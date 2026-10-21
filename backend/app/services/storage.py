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
from app.schemas.replay import GameReport, MapFile, PlayerMap, StatsFile, UploadResult, ReplaySummary
from app.services import analysis, parser, stats, maps

CHUNK_SIZE = 1024 * 1024
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
    if total == 0:
        raise ValueError("Empty file")
    content = b"".join(chunks)

    raw = await run_in_threadpool(parser.parse_replay, content)

    properties = (raw.get("properties") if isinstance(raw, dict) else None) or {}
    has_id = bool(properties.get("Id"))
    replay_id = str(properties.get("Id") or uuid.uuid4().hex)
    original_filename = re.sub(r"[\x00-\x1f\x7f]", "", Path(name).name)[:255]

    folder_id = await run_in_threadpool(
        _store_match, raw, properties, replay_id, has_id, original_filename
    )
    return UploadResult(id=folder_id)


def _store_match(
    raw: dict, properties: dict, replay_id: str, has_id: bool, original_filename: str
) -> str:
    """Find an existing folder for this replay or write a new one, atomically."""
    with _STORE_LOCK:
        if has_id:
            existing = _find_existing_folder(replay_id)
            if existing is not None:
                return existing.name
        stats_file, map_file = stats.build_match_files(replay_id, original_filename, raw)
        return _write_match_folder(_folder_name(properties, replay_id), stats_file, map_file)


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


def _write_match_folder(folder_name: str, stats_file, map_file) -> str:
    config.GAMES_DIR.mkdir(parents=True, exist_ok=True)
    games_dir = config.GAMES_DIR.resolve()
    tmp = config.GAMES_DIR / f".tmp-{uuid.uuid4().hex}"
    try:
        tmp.mkdir()
        (tmp / config.STATS_FILENAME).write_text(
            stats_file.model_dump_json(), encoding="utf-8"
        )
        (tmp / config.MAP_FILENAME).write_text(
            map_file.model_dump_json(), encoding="utf-8"
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

def get_player_map(game_id: str, player_name: str) -> PlayerMap | None:
    """Heatmap and track of one player (name compared ignoring case), or None if unavailable."""
    if not GAME_ID_PATTERN.fullmatch(game_id):
        return None
    map_path = config.GAMES_DIR / game_id / config.MAP_FILENAME
    if not map_path.is_file():
        return None
    map_file = MapFile.model_validate_json(map_path.read_text(encoding="utf-8"))
    wanted = player_name.strip().casefold()
    return next((p for p in map_file.players if p.name.casefold() == wanted), None)

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


def get_game_report(game_id: str) -> GameReport | None:
    if not GAME_ID_PATTERN.fullmatch(game_id):
        return None
    folder = config.GAMES_DIR / game_id
    stats_path = folder / config.STATS_FILENAME
    if not stats_path.is_file():
        return None
    stats_file = StatsFile.model_validate_json(stats_path.read_text(encoding="utf-8"))
    stats_file.match.map_name = maps.display_name(stats_file.match.map_name)
    map_path = folder / config.MAP_FILENAME
    map_file = (
        MapFile.model_validate_json(map_path.read_text(encoding="utf-8"))
        if map_path.is_file()
        else None
    )
    return analysis.build_report(game_id, stats_file, map_file)
