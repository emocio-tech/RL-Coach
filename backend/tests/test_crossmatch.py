import copy

import pytest

from app import config
from app.schemas.replay import (
    BoostStats,
    Demolitions,
    GameReport,
    MatchStats,
    PlayerDetail,
    PlayerFullStats,
    PlayerReport,
)
from app.services import crossmatch, stats, storage


# ---------- helpers: hand-built reports (patched into storage) ----------


def _player(name="Alice", team=0, goals=0, saves=0, tracked=10.0, **detail):
    return PlayerReport(
        stats=PlayerFullStats(
            name=name, team=team, score=goals * 100, goals=goals, saves=saves,
            demolitions=Demolitions(), boost=BoostStats(),
        ),
        detail=PlayerDetail(tracked_time_s=tracked, **detail),
    )


def _report(game_id, players, date="2024-01-01 00-00-00", team_size=1, t0=3, t1=2):
    return GameReport(
        id=game_id,
        original_filename="g.replay",
        match=MatchStats(team_size=team_size, team0_score=t0, team1_score=t1, date=date),
        players=players,
    )


@pytest.fixture
def reports(monkeypatch):
    """Factory: reports([...GameReport]) makes storage.iter_game_reports yield them (honouring team_size)."""

    def install(items):
        def fake_iter(team_size=None):
            for report in items:
                if team_size is None or report.match.team_size == team_size:
                    yield report.id, report

        monkeypatch.setattr(storage, "iter_game_reports", fake_iter)

    return install


def _goal_games(goals):
    """One game per value, one day apart (oldest first), Alice scoring `goals[i]`."""
    return [
        _report(f"G{i:02d}", [_player(goals=g)], date=f"2024-01-{i + 1:02d} 00-00-00")
        for i, g in enumerate(goals)
    ]


# ---------- helpers: games stored on disk ----------


def _write_game(games_dir, fake_raw, game_id, date, goals=3, team_size=1, with_map=True, rename_alice=None):
    stats_file, map_file = stats.build_match_files(game_id, "g.replay", fake_raw)
    stats_file.match.date = date
    stats_file.match.team_size = team_size
    for player in stats_file.players:
        if player.name == "Alice":
            player.goals = goals
            if rename_alice:
                player.name = rename_alice
    folder = games_dir / game_id
    folder.mkdir(parents=True)
    (folder / config.STATS_FILENAME).write_text(stats_file.model_dump_json(), encoding="utf-8")
    if with_map:
        (folder / config.MAP_FILENAME).write_text(map_file.model_dump_json(), encoding="utf-8")
    return folder


# ---------- storage.iter_game_reports ----------


def test_iter_game_reports_yields_every_readable_game(games_dir, fake_raw):
    _write_game(games_dir, fake_raw, "G1", "2024-01-01 00-00-00")
    _write_game(games_dir, fake_raw, "G2", "2024-01-02 00-00-00")

    assert [game_id for game_id, _ in storage.iter_game_reports()] == ["G1", "G2"]


def test_iter_game_reports_without_games_dir(games_dir):
    assert list(storage.iter_game_reports()) == []


def test_iter_game_reports_ignores_tmp_folders(games_dir, fake_raw):
    _write_game(games_dir, fake_raw, "G1", "2024-01-01 00-00-00")
    _write_game(games_dir, fake_raw, ".tmp-abc", "2024-01-02 00-00-00")

    assert [game_id for game_id, _ in storage.iter_game_reports()] == ["G1"]


def test_iter_game_reports_ignores_names_not_matching_game_id_pattern(games_dir, fake_raw):
    _write_game(games_dir, fake_raw, "G1", "2024-01-01 00-00-00")
    _write_game(games_dir, fake_raw, "-bad", "2024-01-02 00-00-00")
    _write_game(games_dir, fake_raw, "has space", "2024-01-03 00-00-00")

    assert [game_id for game_id, _ in storage.iter_game_reports()] == ["G1"]


def test_iter_game_reports_ignores_unreadable_games(games_dir, fake_raw):
    _write_game(games_dir, fake_raw, "G1", "2024-01-01 00-00-00")
    _write_game(games_dir, fake_raw, "G2", "2024-01-02 00-00-00")
    (games_dir / "G2" / config.STATS_FILENAME).write_text("{not json", encoding="utf-8")
    (games_dir / "G3").mkdir()  # no stats.json
    (games_dir / "stray.txt").write_text("x", encoding="utf-8")  # plain file

    assert [game_id for game_id, _ in storage.iter_game_reports()] == ["G1"]


def test_iter_game_reports_filters_on_team_size(games_dir, fake_raw):
    _write_game(games_dir, fake_raw, "G1", "2024-01-01 00-00-00", team_size=1)
    _write_game(games_dir, fake_raw, "G2", "2024-01-02 00-00-00", team_size=2)

    assert [game_id for game_id, _ in storage.iter_game_reports(team_size=2)] == ["G2"]
    assert [game_id for game_id, _ in storage.iter_game_reports(team_size=3)] == []


# ---------- analyze_player: nominal ----------


def test_analyze_player_aggregates_three_games(reports):
    reports(_goal_games([3, 1, 2]))

    result = crossmatch.analyze_player("Alice")

    assert result["player"] == "Alice"
    assert result["games_analyzed"] == 3
    assert result["games_skipped"] == []
    assert result["totals"]["goals"] == 6
    assert result["averages"]["goals"] == 2.0
    assert [row["goals"] for row in result["per_game"]] == [3, 1, 2]
    assert "note" not in result
    assert "trend" not in result


def test_analyze_player_aggregates_stored_games(games_dir, fake_raw):
    _write_game(games_dir, fake_raw, "G1", "2024-01-01 00-00-00", goals=3)
    _write_game(games_dir, fake_raw, "G2", "2024-01-02 00-00-00", goals=1)

    result = crossmatch.analyze_player("Alice")

    assert result["games_analyzed"] == 2
    assert result["totals"]["goals"] == 4
    assert result["averages"]["goals"] == 2.0
    assert result["averages"]["avg_speed"] is not None  # positioning comes from map.json
    assert result["modes"] == {"games_by_team_size": {"1": 2}}


def test_analyze_player_per_game_result_and_score_from_player_point_of_view(reports):
    reports([
        _report("G1", [_player("Alice", team=0)], date="2024-01-01 00-00-00", t0=3, t1=2),
        _report("G2", [_player("Alice", team=1)], date="2024-01-02 00-00-00", t0=3, t1=2),
        _report("G3", [_player("Alice", team=1)], date="2024-01-03 00-00-00", t0=1, t1=1),
    ])

    rows = crossmatch.analyze_player("Alice")["per_game"]

    assert [(r["game_id"], r["result"], r["score"]) for r in rows] == [
        ("G1", "win", "3-2"), ("G2", "loss", "2-3"), ("G3", "draw", "1-1"),
    ]


def test_analyze_player_per_game_without_final_score(reports):
    reports([_report("G1", [_player()], t0=None, t1=None)])

    row = crossmatch.analyze_player("Alice")["per_game"][0]

    assert row["result"] is None
    assert row["score"] is None


# ---------- analyze_player: errors ----------


def test_analyze_player_unknown_player_lists_available_players(reports):
    reports([_report("G1", [_player("bob"), _player("Alice")])])

    result = crossmatch.analyze_player("Zed")

    assert result == {
        "error": "Joueur introuvable dans les parties importées.",
        "available_players": ["Alice", "bob"],
    }


def test_analyze_player_available_players_capped_at_50(reports):
    reports([_report("G1", [_player(f"P{i:03d}") for i in range(60)])])

    result = crossmatch.analyze_player("Zed")

    assert len(result["available_players"]) == crossmatch.MAX_AVAILABLE_PLAYERS == 50
    assert result["available_players"][0] == "P000"


def test_analyze_player_without_any_game(games_dir):
    assert crossmatch.analyze_player("Alice") == {"error": "Aucune partie importée correspondante."}


def test_analyze_player_no_game_for_team_size(reports):
    reports(_goal_games([1, 2]))

    assert crossmatch.analyze_player("Alice", team_size=3) == {"error": "Aucune partie importée correspondante."}


@pytest.mark.parametrize("name", ["", "   ", None, 42])
def test_analyze_player_invalid_name(reports, name):
    reports(_goal_games([1]))

    assert crossmatch.analyze_player(name) == {"error": "Nom de joueur manquant ou invalide."}


def test_analyze_player_only_in_games_older_than_last_n(reports):
    old = _report("G1", [_player("Alice")], date="2024-01-01 00-00-00")
    recent = _report("G2", [_player("Bob")], date="2024-01-02 00-00-00")
    reports([old, recent])

    result = crossmatch.analyze_player("Alice", last_n=1)

    assert result == {"error": "Joueur absent des parties les plus récentes."}


# ---------- analyze_player: limits ----------


@pytest.mark.parametrize("name", ["ALICE", "alice", "  aLiCe  "])
def test_analyze_player_name_is_case_and_space_insensitive(reports, name):
    reports(_goal_games([1, 2]))

    result = crossmatch.analyze_player(name)

    assert result["player"] == "Alice"
    assert result["games_analyzed"] == 2


def test_analyze_player_displays_name_of_most_recent_game(reports):
    reports([
        _report("G1", [_player("alice")], date="2024-01-01 00-00-00"),
        _report("G2", [_player("ALICE")], date="2024-01-02 00-00-00"),
    ])

    assert crossmatch.analyze_player("Alice")["player"] == "ALICE"


def test_analyze_player_absent_from_a_game_is_skipped(reports):
    reports([
        _report("G1", [_player("Alice", goals=2)], date="2024-01-01 00-00-00"),
        _report("G2", [_player("Bob")], date="2024-01-02 00-00-00"),
        _report("G3", [_player("Alice", goals=4)], date="2024-01-03 00-00-00"),
    ])

    result = crossmatch.analyze_player("Alice")

    assert result["games_analyzed"] == 2
    assert result["games_skipped"] == [{"game_id": "G2", "reason": "Joueur absent de cette partie."}]
    assert result["totals"]["goals"] == 6
    assert [row["game_id"] for row in result["per_game"]] == ["G1", "G3"]


def test_analyze_player_game_without_map_json_still_counts_its_totals(games_dir, fake_raw):
    _write_game(games_dir, fake_raw, "G1", "2024-01-01 00-00-00", goals=3)
    _write_game(games_dir, fake_raw, "G2", "2024-01-02 00-00-00", goals=1, with_map=False)

    result = crossmatch.analyze_player("Alice")

    assert result["games_analyzed"] == 2
    assert result["totals"]["goals"] == 4


def test_analyze_player_game_without_map_json_does_not_weigh_in_rates(games_dir, fake_raw):
    _write_game(games_dir, fake_raw, "G1", "2024-01-01 00-00-00")
    _write_game(games_dir, fake_raw, "G2", "2024-01-02 00-00-00", with_map=False)

    only_without_map = crossmatch.analyze_player("Alice", last_n=1)["averages"]["avg_speed"]
    both = crossmatch.analyze_player("Alice")["averages"]["avg_speed"]
    only_with_map = crossmatch.analyze_player("Alice", last_n=2, team_size=1)["averages"]["avg_speed"]

    assert only_without_map is None
    assert both is not None
    assert both == only_with_map


def test_analyze_player_without_any_map_json_gives_null_rates(games_dir, fake_raw):
    _write_game(games_dir, fake_raw, "G1", "2024-01-01 00-00-00", with_map=False)

    averages = crossmatch.analyze_player("Alice")["averages"]

    assert averages["goals"] == 3.0
    assert averages["avg_speed"] is None
    assert averages["defensive_zone_pct"] is None


def test_analyze_player_rates_are_weighted_by_tracked_time(reports):
    reports([
        _report("G1", [_player(tracked=10.0, avg_speed=1000.0)], date="2024-01-01 00-00-00"),
        _report("G2", [_player(tracked=30.0, avg_speed=2000.0)], date="2024-01-02 00-00-00"),
    ])

    # (1000 * 10 + 2000 * 30) / 40, not the plain mean 1500
    assert crossmatch.analyze_player("Alice")["averages"]["avg_speed"] == 1750.0


def test_analyze_player_weighted_rates_ignore_none_values(reports):
    reports([
        _report("G1", [_player(tracked=10.0, avg_speed=1000.0)], date="2024-01-01 00-00-00"),
        _report("G2", [_player(tracked=100.0, avg_speed=None)], date="2024-01-02 00-00-00"),
    ])

    assert crossmatch.analyze_player("Alice")["averages"]["avg_speed"] == 1000.0


def test_analyze_player_weighted_rates_ignore_zero_tracked_time(reports):
    reports([
        _report("G1", [_player(tracked=0.0, avg_speed=5000.0)], date="2024-01-01 00-00-00"),
        _report("G2", [_player(tracked=20.0, avg_speed=1200.0)], date="2024-01-02 00-00-00"),
    ])

    assert crossmatch.analyze_player("Alice")["averages"]["avg_speed"] == 1200.0


def test_analyze_player_last_n_keeps_most_recent_games(reports):
    reports(_goal_games([1, 2, 3, 4, 5]))

    result = crossmatch.analyze_player("Alice", last_n=2)

    assert [row["game_id"] for row in result["per_game"]] == ["G03", "G04"]
    assert result["totals"]["goals"] == 9


def test_analyze_player_last_n_is_capped_at_max(reports):
    reports(_goal_games(range(crossmatch.MAX_LAST_N + 5)))

    result = crossmatch.analyze_player("Alice", last_n=crossmatch.MAX_LAST_N + 100)

    assert result["games_analyzed"] == crossmatch.MAX_LAST_N
    assert result["per_game"][0]["game_id"] == "G05"  # the 5 oldest games are dropped


def test_analyze_player_default_last_n_is_max(reports):
    reports(_goal_games(range(crossmatch.MAX_LAST_N + 1)))

    assert crossmatch.analyze_player("Alice")["games_analyzed"] == crossmatch.MAX_LAST_N


def test_analyze_player_last_n_below_one_is_raised_to_one(reports):
    reports(_goal_games([1, 2, 3]))

    assert crossmatch.analyze_player("Alice", last_n=0)["games_analyzed"] == 1


def test_analyze_player_games_sorted_by_date_not_by_id(reports):
    reports([
        _report("A_new", [_player()], date="2024-03-01 00-00-00"),
        _report("Z_old", [_player()], date="2024-01-01 00-00-00"),
    ])

    assert [r["game_id"] for r in crossmatch.analyze_player("Alice")["per_game"]] == ["Z_old", "A_new"]


def test_analyze_player_games_without_date_are_dropped_first(reports):
    reports([
        _report("G1", [_player()], date=None),
        _report("G2", [_player()], date="2024-01-01 00-00-00"),
    ])

    assert [r["game_id"] for r in crossmatch.analyze_player("Alice", last_n=1)["per_game"]] == ["G2"]


def test_analyze_player_team_size_filter(reports):
    reports([
        _report("G1", [_player(goals=1)], date="2024-01-01 00-00-00", team_size=1),
        _report("G2", [_player(goals=5)], date="2024-01-02 00-00-00", team_size=2),
    ])

    result = crossmatch.analyze_player("Alice", team_size=2)

    assert result["games_analyzed"] == 1
    assert result["totals"]["goals"] == 5
    assert result["modes"] == {"games_by_team_size": {"2": 1}}


def test_analyze_player_mixed_modes_adds_a_note(reports):
    reports([
        _report("G1", [_player()], date="2024-01-01 00-00-00", team_size=1),
        _report("G2", [_player()], date="2024-01-02 00-00-00", team_size=2),
        _report("G3", [_player()], date="2024-01-03 00-00-00", team_size=None),
    ])

    modes = crossmatch.analyze_player("Alice")["modes"]

    assert modes["games_by_team_size"] == {"1": 1, "2": 1, "unknown": 1}
    assert modes["note"] == crossmatch.MIXED_MODES_NOTE


def test_analyze_player_single_mode_has_no_modes_note(reports):
    reports(_goal_games([1, 2, 3]))

    assert "note" not in crossmatch.analyze_player("Alice")["modes"]


@pytest.mark.parametrize("n_games, has_note", [(1, True), (2, True), (3, False), (4, False)])
def test_analyze_player_insufficient_sample_note_below_three_games(reports, n_games, has_note):
    reports(_goal_games(range(n_games)))

    result = crossmatch.analyze_player("Alice")

    assert ("note" in result) is has_note
    if has_note:
        assert result["note"] == crossmatch.INSUFFICIENT_SAMPLE_NOTE


@pytest.mark.parametrize("n_games, has_trend", [(1, False), (2, False), (3, False), (4, True), (5, True)])
def test_analyze_player_trend_only_from_four_games(reports, n_games, has_trend):
    reports(_goal_games(range(n_games)))

    assert ("trend" in crossmatch.analyze_player("Alice")) is has_trend


def test_analyze_player_trend_compares_older_and_recent_halves(reports):
    reports(_goal_games([0, 2, 4, 6]))

    trend = crossmatch.analyze_player("Alice")["trend"]

    assert trend["older_games"] == 2
    assert trend["recent_games"] == 2
    assert trend["metrics"]["goals"] == {"older": 1.0, "recent": 5.0, "delta": 4.0}


def test_analyze_player_trend_with_odd_count_ignores_the_middle_game(reports):
    reports(_goal_games([0, 0, 100, 4, 4]))

    goals = crossmatch.analyze_player("Alice")["trend"]["metrics"]["goals"]

    assert goals == {"older": 0.0, "recent": 4.0, "delta": 4.0}


def test_analyze_player_trend_delta_is_none_when_a_half_has_no_data(reports):
    reports([
        _report(f"G{i}", [_player(tracked=10.0, supersonic_pct=None if i < 2 else 5.0)], date=f"2024-01-0{i + 1} 00-00-00")
        for i in range(4)
    ])

    metric = crossmatch.analyze_player("Alice")["trend"]["metrics"]["supersonic_pct"]

    assert metric == {"older": None, "recent": 5.0, "delta": None}


def test_analyze_player_tmp_folder_is_ignored(games_dir, fake_raw):
    _write_game(games_dir, fake_raw, "G1", "2024-01-01 00-00-00", goals=3)
    _write_game(games_dir, fake_raw, ".tmp-xyz", "2024-01-02 00-00-00", goals=50)

    result = crossmatch.analyze_player("Alice")

    assert result["games_analyzed"] == 1
    assert result["totals"]["goals"] == 3


def test_analyze_player_1v1_omits_man_percentages(reports):
    reports([_report("G1", [_player(first_man_pct=50.0, second_man_pct=50.0, third_man_pct=0.0)], team_size=1)])

    averages = crossmatch.analyze_player("Alice")["averages"]

    assert not {"first_man_pct", "second_man_pct", "third_man_pct"} & set(averages)
    assert "supersonic_pct" in averages


def test_analyze_player_1v1_filter_omits_man_percentages_even_for_mixed_games(reports):
    reports([
        _report("G1", [_player(first_man_pct=50.0)], team_size=1),
        _report("G2", [_player(first_man_pct=50.0)], date="2024-01-02 00-00-00", team_size=2),
    ])

    averages = crossmatch.analyze_player("Alice", team_size=1)["averages"]

    assert "first_man_pct" not in averages


def test_analyze_player_3v3_keeps_weighted_man_percentages(reports):
    reports([
        _report("G1", [_player(tracked=10.0, first_man_pct=20.0, second_man_pct=30.0, third_man_pct=50.0)], team_size=3),
        _report(
            "G2",
            [_player(tracked=30.0, first_man_pct=60.0, second_man_pct=20.0, third_man_pct=20.0)],
            date="2024-01-02 00-00-00",
            team_size=3,
        ),
    ])

    averages = crossmatch.analyze_player("Alice")["averages"]

    assert averages["first_man_pct"] == 50.0
    assert averages["second_man_pct"] == 22.5
    assert averages["third_man_pct"] == 27.5


def test_analyze_player_does_not_mutate_stored_reports(reports):
    games = _goal_games([1, 2, 3, 4])
    snapshot = copy.deepcopy(games)
    reports(games)

    crossmatch.analyze_player("Alice")

    assert games == snapshot
