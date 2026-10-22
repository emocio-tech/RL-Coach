import json
import re
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from starlette.concurrency import run_in_threadpool

from app import config
from app.schemas.replay import (
    GameReport,
    HeatmapFile,
    Match3DFile,
    MatchHeatmaps,
    MatchTracks,
    PlayerHeatmap,
    PlayerTrackSet,
    ReplaySummary,
    StatsFile,
    UploadResult,
)
from app.services import analysis, parser, stats, maps

CHUNK_SIZE = 1024 * 1024
MAX_LISTED_GAMES = 50
GAME_ID_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
_STORE_LOCK = threading.Lock()


async def save_replay(file: UploadFile) -> UploadResult:
    name = file.filename or ""
    if not name.lower().endswith(config.ALLOWED_EXTENSION):
        raise ValueError("Only .replay files are accepted")

    chunks = []
    total = 0
    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > config.MAX_UPLOAD_BYTES:
            raise ValueError("File too large")
        chunks.append(chunk)
    content = b"".join(chunks)

    folder_id, _ = await run_in_threadpool(import_replay_bytes, content, name)
    return UploadResult(id=folder_id)


def import_replay_bytes(content: bytes, filename: str) -> tuple[str, bool]:
    """Parse and store a replay; return (game_id, already_imported)."""
    if not filename.lower().endswith(config.ALLOWED_EXTENSION):
        raise ValueError("Only .replay files are accepted")
    if len(content) == 0:
        raise ValueError("Empty file")
    if len(content) > config.MAX_UPLOAD_BYTES:
        raise ValueError("File too large")

    raw = parser.parse_replay(content)

    properties = (raw.get("properties") if isinstance(raw, dict) else None) or {}
    has_id = bool(properties.get("Id"))
    replay_id = str(properties.get("Id") or uuid.uuid4().hex)
    original_filename = re.sub(r"[\x00-\x1f\x7f]", "", Path(filename).name)[:255]

    return _store_match(raw, properties, replay_id, has_id, original_filename)


def _store_match(
    raw: dict, properties: dict, replay_id: str, has_id: bool, original_filename: str
) -> tuple[str, bool]:
    """Find an existing folder for this replay or write a new one, atomically.

    Returns (folder name, True if the replay was already imported and nothing was written)."""
    with _STORE_LOCK:
        if has_id:
            existing = _find_existing_folder(replay_id)
            if existing is not None:
                return existing.name, True
        stats_file, match3d_file, heatmap_file = stats.build_match_files(
            replay_id, original_filename, raw
        )
        folder = _write_match_folder(
            _folder_name(properties, replay_id), stats_file, match3d_file, heatmap_file
        )
        return folder, False


def _find_existing_folder(replay_id: str) -> Path | None:
    """Folder already holding this replay (same raw replay_id in stats.json), or None."""
    if not config.GAMES_DIR.is_dir():
        return None
    try:
        folders = sorted(config.GAMES_DIR.iterdir(), key=lambda p: p.name)
    except OSError:
        return None
    for folder in folders:
        if folder.name.startswith(".tmp-"):
            continue
        try:
            if not folder.is_dir():
                continue
            data = json.loads(
                (folder / config.STATS_FILENAME).read_text(encoding="utf-8")
            )
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and data.get("replay_id") == replay_id:
            return folder
    return None


def _sanitize(value, fallback: str) -> str:
    text = re.sub(r"[^A-Za-z0-9._-]", "_", str(value)) if value else ""
    return text.strip(".")[:64] or fallback


def _folder_name(properties: dict, replay_id: str) -> str:
    map_name = _sanitize(properties.get("MapName"), "UnknownMap")
    match_type = _sanitize(properties.get("MatchType"), "Unknown")
    team_size = properties.get("TeamSize")
    size_part = ""
    if isinstance(team_size, int) and not isinstance(team_size, bool):
        size_part = f"-{team_size}v{team_size}"
    return f"{map_name}_{match_type}{size_part}_{_sanitize(replay_id, 'replay')}"


def _write_match_folder(folder_name: str, stats_file, match3d_file, heatmap_file) -> str:
    config.GAMES_DIR.mkdir(parents=True, exist_ok=True)
    games_dir = config.GAMES_DIR.resolve()
    tmp = config.GAMES_DIR / f".tmp-{uuid.uuid4().hex}"
    try:
        tmp.mkdir()
        (tmp / config.STATS_FILENAME).write_text(
            stats_file.model_dump_json(), encoding="utf-8"
        )
        (tmp / config.MATCH3D_FILENAME).write_text(
            match3d_file.model_dump_json(), encoding="utf-8"
        )
        (tmp / config.HEATMAP_FILENAME).write_text(
            heatmap_file.model_dump_json(), encoding="utf-8"
        )
        for attempt in range(1, 1001):
            candidate = folder_name if attempt == 1 else f"{folder_name}_{attempt}"
            final = config.GAMES_DIR / candidate
            if final.resolve().parent != games_dir:
                raise OSError("Invalid replay folder path")
            try:
                tmp.rename(final)
                return candidate
            except OSError:
                if not final.exists():
                    raise
        raise OSError("Could not find a free replay folder name")
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise

def get_heatmap_file(game_id: str) -> HeatmapFile | None:
    """Content of heatmap.json, or None if the game or the file does not exist."""
    if not GAME_ID_PATTERN.fullmatch(game_id):
        return None
    heatmap_path = config.GAMES_DIR / game_id / config.HEATMAP_FILENAME
    if not heatmap_path.is_file():
        return None
    return HeatmapFile.model_validate_json(heatmap_path.read_text(encoding="utf-8"))


def get_player_heatmap(game_id: str, player_name: str) -> PlayerHeatmap | None:
    """Heatmap of one player (name compared ignoring case and surrounding spaces), or None if unavailable.

    It is the very heatmap the Heatmaps page shows: it goes through `get_game_heatmaps`, so the chat and the page
    can never differ (dead-ball samples left out).
    """
    heatmaps = get_game_heatmaps(game_id)
    if heatmaps is None:
        return None
    wanted = player_name.strip().casefold()
    return next((p for p in heatmaps.players if p.name.casefold() == wanted), None)


def list_games() -> list[ReplaySummary]:
    """Imported games, most recent import first. The import date is the mtime of stats.json."""
    if not config.GAMES_DIR.is_dir():
        return []
    games = []
    for folder in config.GAMES_DIR.iterdir():
        stats_path = folder / config.STATS_FILENAME
        if not GAME_ID_PATTERN.fullmatch(folder.name) or not stats_path.is_file():
            continue
        try:
            stats_file = StatsFile.model_validate_json(stats_path.read_text(encoding="utf-8"))
            imported_at = datetime.fromtimestamp(stats_path.stat().st_mtime, tz=timezone.utc)
        except (OSError, ValueError):
            continue
        games.append(
            ReplaySummary(
                id=folder.name,
                original_filename=stats_file.original_filename,
                imported_at=imported_at.isoformat(),
                team0_score=stats_file.match.team0_score,
                team1_score=stats_file.match.team1_score,
                map_name=maps.display_name(stats_file.match.map_name),
            )
        )
    return sorted(games, key=lambda game: game.imported_at, reverse=True)


def list_game_infos(player_name: str | None = None) -> list[dict]:
    """Description of the imported games, most recent first (at most MAX_LISTED_GAMES).

    Reads the stats.json of each game folder; unreadable folders are skipped. `player_name` keeps only the games
    having a player whose name contains it (case-insensitive)."""
    if not config.GAMES_DIR.is_dir():
        return []
    wanted = player_name.strip().casefold() if player_name and player_name.strip() else None
    games = []
    try:
        folders = list(config.GAMES_DIR.iterdir())
    except OSError:
        return []
    for folder in folders:
        stats_path = folder / config.STATS_FILENAME
        if not GAME_ID_PATTERN.fullmatch(folder.name) or not stats_path.is_file():
            continue
        try:
            stats_file = StatsFile.model_validate_json(stats_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        names = [p.name for p in stats_file.players]
        if wanted is not None and not any(wanted in name.casefold() for name in names):
            continue
        match = stats_file.match
        games.append(
            {
                "game_id": folder.name,
                "map_name": maps.display_name(match.map_name),
                "match_type": match.match_type,
                "team_size": match.team_size,
                "date": match.date,
                "score": f"{match.team0_score}-{match.team1_score}",
                "players": names,
            }
        )
    games.sort(key=lambda game: game["date"] or "", reverse=True)
    return games[:MAX_LISTED_GAMES]


def get_game_tracks(game_id: str) -> MatchTracks | None:
    """Tracks of every player and of the ball, or None if the game or its 3dmatch.json is missing."""
    if not GAME_ID_PATTERN.fullmatch(game_id):
        return None
    folder = config.GAMES_DIR / game_id
    stats_path = folder / config.STATS_FILENAME
    map_path = folder / config.MATCH3D_FILENAME
    if not stats_path.is_file() or not map_path.is_file():
        return None
    try:
        stats_file = StatsFile.model_validate_json(stats_path.read_text(encoding="utf-8"))
        map_file = Match3DFile.model_validate_json(map_path.read_text(encoding="utf-8"))
    except ValueError:
        # Game imported before the orientations were extracted: no usable tracking data.
        return None
    cars = {p.name: p.car for p in stats_file.players}
    return MatchTracks(
        id=game_id,
        players=[
            PlayerTrackSet(name=p.name, team=p.team, car=cars.get(p.name), track=p.track)
            for p in map_file.players
        ],
        ball=map_file.ball,
        duration_seconds=stats_file.match.duration_seconds,
        pads=map_file.pads,
    )


def get_game_heatmaps(game_id: str) -> MatchHeatmaps | None:
    """Heatmaps of every player and of the ball (read from heatmap.json), or None if unavailable.

    The import step stores them without the dead-ball samples; 3dmatch.json is never read.
    """
    try:
        heatmap_file = get_heatmap_file(game_id)
    except (OSError, ValueError):
        return None
    if heatmap_file is None:
        return None
    return MatchHeatmaps(players=heatmap_file.players, ball=heatmap_file.ball)


def get_game_report(game_id: str, include_match3d: bool = True) -> GameReport | None:
    """Report of a game; without include_match3d, 3dmatch.json is not read (degraded report, no detailed stats)."""
    if not GAME_ID_PATTERN.fullmatch(game_id):
        return None
    folder = config.GAMES_DIR / game_id
    stats_path = folder / config.STATS_FILENAME
    if not stats_path.is_file():
        return None
    stats_file = StatsFile.model_validate_json(stats_path.read_text(encoding="utf-8"))
    stats_file.match.map_name = maps.display_name(stats_file.match.map_name)
    map_path = folder / config.MATCH3D_FILENAME
    map_file = (
        Match3DFile.model_validate_json(map_path.read_text(encoding="utf-8"))
        if include_match3d and map_path.is_file()
        else None
    )
    return analysis.build_report(game_id, stats_file, map_file)
