import asyncio

import pytest

from app import config
from app.mcp_server import (
    compare_players,
    get_match_events,
    get_match_summary,
    get_player_heatmap,
    get_player_stats,
    list_games,
    mcp,
    suggest_training,
)
from app.services import stats

GAME_ID = "Stadium_P_Online-1v1_abc"


@pytest.fixture
def game(games_dir, fake_raw):
    folder = games_dir / GAME_ID
    folder.mkdir(parents=True)
    stats_file, map_file = stats.build_match_files("abc", "game.replay", fake_raw)
    (folder / config.STATS_FILENAME).write_text(stats_file.model_dump_json(), encoding="utf-8")
    (folder / config.MAP_FILENAME).write_text(map_file.model_dump_json(), encoding="utf-8")
    return GAME_ID


def test_server_exposes_the_seven_tools():
    tools = asyncio.run(mcp.list_tools())
    assert {tool.name for tool in tools} == {
        "list_games",
        "get_match_summary",
        "get_player_stats",
        "compare_players",
        "get_match_events",
        "get_player_heatmap",
        "suggest_training",
    }


def test_list_games_empty_without_import(games_dir):
    assert list_games() == []


def test_list_games_returns_imported_game(game):
    games = list_games()
    assert [g["id"] for g in games] == [GAME_ID]
    assert games[0]["team0_score"] == 3


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


def test_compare_players_returns_every_player(game):
    assert {p["name"] for p in compare_players(game)["players"]} == {"Alice", "Bob"}


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
