import json
import os
from pathlib import Path

import pytest

from app import config
from app.services import coach, storage
from app.services.parser import ReplayParseError
from tests.conftest import FOLDER_NAME, REPLAY_ID

CONTENT = b"REPLAYDATA"


@pytest.fixture
def mock_parse(monkeypatch, fake_raw):
    calls = []

    def fake_parse(content):
        calls.append(content)
        return fake_raw

    monkeypatch.setattr(storage.parser, "parse_replay", fake_parse)
    return calls


@pytest.fixture
def replay_file(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    path = source / "game.replay"
    path.write_bytes(CONTENT)
    return path


def _folders(games_dir):
    return list(games_dir.iterdir()) if games_dir.exists() else []


def _stats_of(games_dir, folder):
    return json.loads((games_dir / folder / config.STATS_FILENAME).read_text(encoding="utf-8"))


# --- coach.import_replay : nominal ---


def test_import_replay_nominal_returns_game_id_and_writes_files(games_dir, mock_parse, replay_file):
    result = coach.import_replay(str(replay_file))
    assert result == {"game_id": FOLDER_NAME, "already_imported": False}
    assert sorted(f.name for f in (games_dir / FOLDER_NAME).iterdir()) == ["3dmatch.json", "heatmap.json", "stats.json"]
    assert mock_parse == [CONTENT]


def test_import_replay_nominal_leaves_source_untouched_and_not_copied(games_dir, mock_parse, replay_file):
    before = replay_file.stat().st_mtime_ns
    coach.import_replay(str(replay_file))
    assert replay_file.read_bytes() == CONTENT
    assert replay_file.stat().st_mtime_ns == before
    assert [p.name for p in replay_file.parent.iterdir()] == ["game.replay"]
    assert not list(games_dir.rglob("*.replay"))
    assert not list(games_dir.glob(".tmp-*"))


def test_import_replay_twice_reports_already_imported_without_new_folder(games_dir, mock_parse, replay_file):
    first = coach.import_replay(str(replay_file))
    second = coach.import_replay(str(replay_file))
    assert first["already_imported"] is False
    assert second == {"game_id": FOLDER_NAME, "already_imported": True}
    assert [f.name for f in _folders(games_dir)] == [FOLDER_NAME]


def test_import_replay_strips_surrounding_whitespace_in_path(games_dir, mock_parse, replay_file):
    assert coach.import_replay(f"  {replay_file}  ")["game_id"] == FOLDER_NAME


# --- coach.import_replay : erreurs ---


@pytest.mark.parametrize("value", [None, "", "   "], ids=["none", "empty", "blank"])
def test_import_replay_missing_path_returns_error(games_dir, mock_parse, value):
    assert coach.import_replay(value) == {"error": "Chemin du fichier manquant."}
    assert mock_parse == []


def test_import_replay_non_string_path_returns_missing_error(games_dir, mock_parse):
    assert coach.import_replay(123) == {"error": "Chemin du fichier manquant."}


def test_import_replay_relative_path_returns_error(games_dir, mock_parse, replay_file, monkeypatch):
    monkeypatch.chdir(replay_file.parent)
    assert coach.import_replay("game.replay") == {"error": "Chemin absolu requis."}
    assert mock_parse == []


@pytest.mark.skipif(os.name != "nt", reason="UNC paths are only absolute on Windows")
def test_import_replay_unc_path_returns_error(games_dir, mock_parse):
    assert coach.import_replay("\\\\server\\share\\game.replay") == {
        "error": "Les chemins réseau (UNC) sont refusés."
    }
    assert mock_parse == []


def test_import_replay_wrong_extension_returns_error(games_dir, mock_parse, tmp_path):
    other = tmp_path / "game.txt"
    other.write_bytes(CONTENT)
    assert coach.import_replay(str(other)) == {"error": "Seuls les fichiers .replay sont acceptés."}
    assert mock_parse == []


def test_import_replay_missing_file_returns_not_found(games_dir, mock_parse, tmp_path):
    assert coach.import_replay(str(tmp_path / "nope.replay")) == {"error": "Fichier introuvable."}
    assert _folders(games_dir) == []


def test_import_replay_directory_returns_not_found(games_dir, mock_parse, tmp_path):
    directory = tmp_path / "folder.replay"
    directory.mkdir()
    assert coach.import_replay(str(directory)) == {"error": "Fichier introuvable."}
    assert mock_parse == []


def test_import_replay_symlink_is_refused(games_dir, mock_parse, replay_file, tmp_path):
    link = tmp_path / "link.replay"
    try:
        link.symlink_to(replay_file)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks cannot be created on this system")
    assert coach.import_replay(str(link)) == {"error": "Les liens symboliques sont refusés."}
    assert mock_parse == []
    assert _folders(games_dir) == []


def test_import_replay_empty_file_returns_error(games_dir, mock_parse, tmp_path):
    empty = tmp_path / "empty.replay"
    empty.write_bytes(b"")
    assert coach.import_replay(str(empty)) == {"error": "Fichier vide."}
    assert mock_parse == []


def test_import_replay_too_large_returns_error_without_reading(games_dir, mock_parse, replay_file, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", len(CONTENT) - 1)
    assert coach.import_replay(str(replay_file)) == {"error": "Fichier trop volumineux (50 Mo max)."}
    assert mock_parse == []
    assert _folders(games_dir) == []


def test_import_replay_parse_error_returns_its_message(games_dir, replay_file, monkeypatch):
    def boom(content):
        raise ReplayParseError("bad replay")

    monkeypatch.setattr(storage.parser, "parse_replay", boom)
    assert coach.import_replay(str(replay_file)) == {"error": "bad replay"}
    assert _folders(games_dir) == []


def test_import_replay_missing_rrrocket_binary_returns_error(games_dir, replay_file, monkeypatch):
    def missing(content):
        raise RuntimeError("rrrocket binary not found")

    monkeypatch.setattr(storage.parser, "parse_replay", missing)
    assert coach.import_replay(str(replay_file)) == {"error": "rrrocket introuvable : voir backend/bin/."}


def test_import_replay_read_failure_returns_unreadable(games_dir, mock_parse, replay_file, monkeypatch):
    def failing(self):
        raise PermissionError("locked")

    monkeypatch.setattr(Path, "read_bytes", failing)
    assert coach.import_replay(str(replay_file)) == {"error": "Fichier illisible."}
    assert mock_parse == []


def test_import_replay_unexpected_exception_returns_internal_error(games_dir, replay_file, monkeypatch):
    def boom(content):
        raise KeyError("secret detail")

    monkeypatch.setattr(storage.parser, "parse_replay", boom)
    assert coach.import_replay(str(replay_file)) == {"error": "Erreur interne lors de l'import."}


# --- coach.import_replay : limites ---


def test_import_replay_exactly_max_size_is_accepted(games_dir, mock_parse, replay_file, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", len(CONTENT))
    assert coach.import_replay(str(replay_file))["game_id"] == FOLDER_NAME


def test_import_replay_one_byte_file_is_accepted(games_dir, mock_parse, tmp_path):
    tiny = tmp_path / "tiny.replay"
    tiny.write_bytes(b"x")
    assert coach.import_replay(str(tiny))["game_id"] == FOLDER_NAME


def test_import_replay_uppercase_extension_is_accepted(games_dir, mock_parse, tmp_path):
    upper = tmp_path / "GAME.REPLAY"
    upper.write_bytes(CONTENT)
    assert coach.import_replay(str(upper))["game_id"] == FOLDER_NAME


def test_import_replay_special_characters_in_filename(games_dir, mock_parse, tmp_path):
    special = tmp_path / "ma partie é#1 (finale) [x].replay"
    special.write_bytes(CONTENT)
    result = coach.import_replay(str(special))
    assert result["game_id"] == FOLDER_NAME
    assert _stats_of(games_dir, FOLDER_NAME)["original_filename"] == special.name


def test_import_replay_stores_only_basename_not_full_path(games_dir, mock_parse, replay_file):
    coach.import_replay(str(replay_file))
    text = (games_dir / FOLDER_NAME / config.STATS_FILENAME).read_text(encoding="utf-8")
    assert json.loads(text)["original_filename"] == "game.replay"
    assert str(replay_file.parent) not in text
    assert str(replay_file.parent).replace("\\", "\\\\") not in text
    for filename in (config.MATCH3D_FILENAME, config.HEATMAP_FILENAME):
        file_text = (games_dir / FOLDER_NAME / filename).read_text(encoding="utf-8")
        assert str(replay_file.parent) not in file_text


def test_import_replay_stats_replay_id_matches_replay(games_dir, mock_parse, replay_file):
    coach.import_replay(str(replay_file))
    assert _stats_of(games_dir, FOLDER_NAME)["replay_id"] == REPLAY_ID


# --- storage.import_replay_bytes ---


def test_import_replay_bytes_nominal_returns_tuple(games_dir, mock_parse):
    assert storage.import_replay_bytes(CONTENT, "game.replay") == (FOLDER_NAME, False)


def test_import_replay_bytes_twice_returns_already_imported(games_dir, mock_parse):
    storage.import_replay_bytes(CONTENT, "game.replay")
    assert storage.import_replay_bytes(CONTENT, "other.replay") == (FOLDER_NAME, True)
    assert [f.name for f in _folders(games_dir)] == [FOLDER_NAME]


def test_import_replay_bytes_wrong_extension_raises(games_dir, mock_parse):
    with pytest.raises(ValueError, match="Only .replay files are accepted"):
        storage.import_replay_bytes(CONTENT, "game.txt")
    assert mock_parse == []


def test_import_replay_bytes_empty_raises(games_dir, mock_parse):
    with pytest.raises(ValueError, match="Empty file"):
        storage.import_replay_bytes(b"", "game.replay")
    assert mock_parse == []


def test_import_replay_bytes_too_large_raises(games_dir, mock_parse, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 10)
    with pytest.raises(ValueError, match="File too large"):
        storage.import_replay_bytes(b"x" * 11, "game.replay")
    assert mock_parse == []


def test_import_replay_bytes_exactly_max_size_accepted(games_dir, mock_parse, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 10)
    assert storage.import_replay_bytes(b"x" * 10, "game.replay")[0] == FOLDER_NAME


def test_import_replay_bytes_filename_with_path_keeps_basename(games_dir, mock_parse):
    folder, _ = storage.import_replay_bytes(CONTENT, "C:/secret/dir/../x.replay")
    assert _stats_of(games_dir, folder)["original_filename"] == "x.replay"


def test_import_replay_bytes_uppercase_extension_accepted(games_dir, mock_parse):
    assert storage.import_replay_bytes(CONTENT, "GAME.REPLAY")[1] is False


def test_store_match_returns_folder_and_flag(games_dir, fake_raw):
    properties = fake_raw["properties"]
    first = storage._store_match(fake_raw, properties, REPLAY_ID, True, "g.replay")
    second = storage._store_match(fake_raw, properties, REPLAY_ID, True, "g.replay")
    assert first == (FOLDER_NAME, False)
    assert second == (FOLDER_NAME, True)


# --- non-régression ---


def test_tools_does_not_expose_import_replay_to_the_llm():
    names = [tool["function"]["name"] for tool in coach.TOOLS]
    assert names == [
        "get_match_summary",
        "get_player_stats",
        "choose_player",
        "show_heatmap",
        "get_match_events",
        "suggest_training",
        "list_games",
    ]
    assert "import_replay" not in names
