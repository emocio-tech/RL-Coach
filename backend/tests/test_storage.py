import copy

import pytest

from app import config
from app.services import stats, storage


def _write_game(games_dir, folder_name, fake_raw, date="2024-01-02 03-04-05", players=None, team0_score=3):
    raw = copy.deepcopy(fake_raw)
    if date is None:
        raw["properties"].pop("Date")
    else:
        raw["properties"]["Date"] = date
    raw["properties"]["Team0Score"] = team0_score
    if players is not None:
        raw["properties"]["PlayerStats"] = players
    stats_file, _, _ = stats.build_match_files(folder_name, "game.replay", raw)
    folder = games_dir / folder_name
    folder.mkdir(parents=True)
    (folder / config.STATS_FILENAME).write_text(stats_file.model_dump_json(), encoding="utf-8")
    return folder


# ---------- list_game_infos: nominal ----------


def test_list_game_infos_returns_game_description(games_dir, fake_raw):
    _write_game(games_dir, "Stadium_P_Online-1v1_abc", fake_raw)

    infos = storage.list_game_infos()

    assert len(infos) == 1
    info = infos[0]
    assert info["game_id"] == "Stadium_P_Online-1v1_abc"
    assert info["match_type"] == "Online"
    assert info["team_size"] == 1
    assert info["date"] == "2024-01-02 03-04-05"
    assert info["score"] == "3-2"
    assert info["players"] == ["Alice", "Bob"]
    assert set(info) == {"game_id", "map_name", "match_type", "team_size", "date", "score", "players"}


def test_list_game_infos_sorted_by_date_descending(games_dir, fake_raw):
    _write_game(games_dir, "G_old", fake_raw, date="2023-05-01 10-00-00")
    _write_game(games_dir, "G_new", fake_raw, date="2024-06-01 10-00-00")
    _write_game(games_dir, "G_mid", fake_raw, date="2024-01-01 10-00-00")

    assert [g["game_id"] for g in storage.list_game_infos()] == ["G_new", "G_mid", "G_old"]


def test_list_game_infos_game_without_date_is_last(games_dir, fake_raw):
    _write_game(games_dir, "G_nodate", fake_raw, date=None)
    _write_game(games_dir, "G_old", fake_raw, date="2000-01-01 00-00-00")

    infos = storage.list_game_infos()

    assert [g["game_id"] for g in infos] == ["G_old", "G_nodate"]
    assert infos[1]["date"] is None


# ---------- list_game_infos: filter ----------


def test_list_game_infos_filter_is_partial_and_case_insensitive(games_dir, fake_raw):
    _write_game(games_dir, "G_alice", fake_raw)

    assert [g["game_id"] for g in storage.list_game_infos("ALI")] == ["G_alice"]
    assert [g["game_id"] for g in storage.list_game_infos("  ice ")] == ["G_alice"]


def test_list_game_infos_filter_keeps_only_games_of_the_player(games_dir, fake_raw):
    _write_game(games_dir, "G_ab", fake_raw)
    _write_game(
        games_dir, "G_cd", fake_raw,
        players=[{"Name": "Carol", "Team": 0, "Score": 1}, {"Name": "Dave", "Team": 1, "Score": 1}],
    )

    assert [g["game_id"] for g in storage.list_game_infos("carol")] == ["G_cd"]


def test_list_game_infos_unknown_player_gives_empty_list(games_dir, fake_raw):
    _write_game(games_dir, "G_ab", fake_raw)

    assert storage.list_game_infos("Zed") == []


@pytest.mark.parametrize("player_name", ["", "   ", None])
def test_list_game_infos_blank_filter_means_no_filter(games_dir, fake_raw, player_name):
    _write_game(games_dir, "G_ab", fake_raw)

    assert len(storage.list_game_infos(player_name)) == 1


# ---------- list_game_infos: limits and errors ----------


def test_list_game_infos_without_games_dir_is_empty(games_dir):
    assert storage.list_game_infos() == []


def test_list_game_infos_empty_games_dir_is_empty(games_dir):
    games_dir.mkdir(parents=True)

    assert storage.list_game_infos() == []


def test_list_game_infos_limited_to_max_listed_games(games_dir, fake_raw):
    for n in range(storage.MAX_LISTED_GAMES + 1):
        _write_game(games_dir, f"G_{n:03d}", fake_raw, date=f"2024-01-01 00-{n:02d}-00")

    infos = storage.list_game_infos()

    assert len(infos) == storage.MAX_LISTED_GAMES == 50
    # the oldest game is the one dropped
    assert "G_000" not in [g["game_id"] for g in infos]
    assert infos[0]["game_id"] == f"G_{storage.MAX_LISTED_GAMES:03d}"


def test_list_game_infos_exactly_max_games_are_all_listed(games_dir, fake_raw):
    for n in range(storage.MAX_LISTED_GAMES):
        _write_game(games_dir, f"G_{n:03d}", fake_raw)

    assert len(storage.list_game_infos()) == storage.MAX_LISTED_GAMES


def test_list_game_infos_skips_corrupted_stats_file(games_dir, fake_raw):
    _write_game(games_dir, "G_ok", fake_raw)
    broken = games_dir / "G_broken"
    broken.mkdir()
    (broken / config.STATS_FILENAME).write_text("{not json", encoding="utf-8")

    assert [g["game_id"] for g in storage.list_game_infos()] == ["G_ok"]


def test_list_game_infos_skips_folder_without_stats_and_stray_files(games_dir, fake_raw):
    _write_game(games_dir, "G_ok", fake_raw)
    (games_dir / "G_empty").mkdir()
    (games_dir / "notes.txt").write_text("x", encoding="utf-8")

    assert [g["game_id"] for g in storage.list_game_infos()] == ["G_ok"]


def test_list_game_infos_skips_folder_with_invalid_name(games_dir, fake_raw):
    _write_game(games_dir, "G_ok", fake_raw)
    _write_game(games_dir, "-bad name", fake_raw)

    assert [g["game_id"] for g in storage.list_game_infos()] == ["G_ok"]
