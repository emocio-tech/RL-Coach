import asyncio
import json

import pytest

from app import config
from app.mcp_server import (
    INSTRUCTIONS,
    get_match_events,
    get_match_summary,
    get_player_heatmap,
    get_player_stats,
    import_replay,
    list_games,
    mcp,
    suggest_training,
)
from app.services import coach, stats, storage
from tests.conftest import FOLDER_NAME

GAME_ID = "Stadium_P_Online-1v1_abc"


@pytest.fixture
def game(games_dir, fake_raw):
    folder = games_dir / GAME_ID
    folder.mkdir(parents=True)
    stats_file, map_file, heatmap_file = stats.build_match_files("abc", "game.replay", fake_raw)
    (folder / config.STATS_FILENAME).write_text(stats_file.model_dump_json(), encoding="utf-8")
    (folder / config.MATCH3D_FILENAME).write_text(map_file.model_dump_json(), encoding="utf-8")
    (folder / config.HEATMAP_FILENAME).write_text(heatmap_file.model_dump_json(), encoding="utf-8")
    return GAME_ID


def test_server_exposes_the_seven_tools():
    tools = asyncio.run(mcp.list_tools())
    assert {tool.name for tool in tools} == {
        "list_games",
        "import_replay",
        "get_match_summary",
        "get_player_stats",
        "get_match_events",
        "get_player_heatmap",
        "suggest_training",
    }


def test_list_games_empty_without_import(games_dir):
    assert list_games() == {"games": []}


def test_list_games_description_mentions_import_replay():
    tools = {tool.name: tool for tool in asyncio.run(mcp.list_tools())}
    assert "import_replay" in tools["list_games"].description


def test_server_instructions_mention_import_replay():
    assert "import_replay" in INSTRUCTIONS
    assert "import_replay" in mcp.instructions


def test_import_replay_tool_requires_file_path():
    tools = {tool.name: tool for tool in asyncio.run(mcp.list_tools())}
    assert tools["import_replay"].input_schema["required"] == ["file_path"]


def test_import_replay_tool_imports_file_via_server(games_dir, fake_raw, monkeypatch, tmp_path):
    monkeypatch.setattr(storage.parser, "parse_replay", lambda content: fake_raw)
    source = tmp_path / "game.replay"
    source.write_bytes(b"REPLAYDATA")

    result = asyncio.run(mcp.call_tool("import_replay", {"file_path": str(source)}))

    assert not result.is_error
    assert json.loads(result.content[0].text) == {"game_id": FOLDER_NAME, "already_imported": False}
    assert [g["game_id"] for g in list_games()["games"]] == [FOLDER_NAME]
    assert source.read_bytes() == b"REPLAYDATA"


def test_import_replay_function_reports_already_imported(games_dir, fake_raw, monkeypatch, tmp_path):
    monkeypatch.setattr(storage.parser, "parse_replay", lambda content: fake_raw)
    source = tmp_path / "game.replay"
    source.write_bytes(b"REPLAYDATA")
    import_replay(str(source))
    assert import_replay(str(source)) == {"game_id": FOLDER_NAME, "already_imported": True}


def test_import_replay_tool_relative_path_returns_error(games_dir):
    assert import_replay("game.replay") == {"error": "Chemin absolu requis."}


def test_import_replay_tool_missing_file_returns_error(games_dir, tmp_path):
    assert import_replay(str(tmp_path / "nope.replay")) == {"error": "Fichier introuvable."}


def test_import_replay_tool_wrong_extension_returns_error(games_dir, tmp_path):
    other = tmp_path / "game.txt"
    other.write_bytes(b"x")
    assert import_replay(str(other)) == {"error": "Seuls les fichiers .replay sont acceptés."}


def test_import_replay_tool_delegates_to_coach(monkeypatch):
    monkeypatch.setattr(coach, "import_replay", lambda file_path: {"echo": file_path})
    assert import_replay("X") == {"echo": "X"}


def test_list_games_returns_imported_game(game):
    games = list_games()["games"]
    assert [g["game_id"] for g in games] == [GAME_ID]
    assert games[0]["score"].startswith("3-")


def test_get_match_summary_lists_players(game):
    result = get_match_summary(game)
    assert result["match"]["team0_score"] == 3
    assert {p["name"] for p in result["players"]} == {"Alice", "Bob"}


def test_get_player_stats_is_case_insensitive(game):
    result = get_player_stats(game, "alice")
    assert result["name"] == "Alice"
    assert "detail" in result


def test_get_player_stats_unknown_player_lists_available(game):
    result = get_player_stats(game, "Nobody")
    assert result["error"] == "Joueur introuvable."
    assert set(result["available_players"]) == {"Alice", "Bob"}


def test_unknown_game_returns_error(games_dir):
    assert get_match_summary("Nope_P_Online-1v1_zzz") == {"error": "Partie introuvable."}


def test_invalid_game_id_returns_error(games_dir):
    assert get_match_summary("../etc") == {"error": "Partie introuvable."}


def test_get_player_heatmap_gives_zone_percentages(game):
    result = get_player_heatmap(game, "Alice")
    assert result["displayed"] is True
    assert set(result["zones_pct"]) == {"defensive", "mid", "offensive"}


def test_get_match_events_rejects_invalid_type(game):
    assert "error" in get_match_events(game, event_type="dance")


def test_get_match_events_without_timeline_says_so(game):
    # fake_raw has no events: the game is flagged as imported before events extraction
    result = get_match_events(game)
    assert result["events"] == []


def test_suggest_training_returns_drills():
    result = suggest_training(["boost"])
    assert result["trainings"]


def test_suggest_training_rejects_unknown_area():
    assert "error" in suggest_training(["cooking"])


def test_list_games_filters_by_player_name(game):
    assert [g["game_id"] for g in list_games("ali")["games"]] == [GAME_ID]
    assert list_games("Zed") == {"games": []}


def test_list_games_delegates_to_coach_without_none_argument(monkeypatch):
    calls = []

    def fake_run_tool(name, arguments_json, game_id):
        calls.append((name, json.loads(arguments_json), game_id))
        return json.dumps({"games": []})

    monkeypatch.setattr(coach, "run_tool", fake_run_tool)

    list_games()
    list_games("Alice")

    assert calls == [
        ("list_games", {}, None),
        ("list_games", {"player_name": "Alice"}, None),
    ]


def test_list_games_tool_player_name_is_optional():
    tools = {tool.name: tool for tool in asyncio.run(mcp.list_tools())}
    schema = tools["list_games"].input_schema

    assert "player_name" in schema["properties"]
    assert "player_name" not in schema.get("required", [])


def test_list_games_tool_call_through_server(game):
    result = asyncio.run(mcp.call_tool("list_games", {"player_name": "bob"}))

    assert not result.is_error
    assert [g["game_id"] for g in json.loads(result.content[0].text)["games"]] == [GAME_ID]
