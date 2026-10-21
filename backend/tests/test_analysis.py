import json

import pytest

from app import config
from app.schemas.replay import MatchEvent
from app.services import analysis, stats

GAME_ID = "Stadium_P_Online-1v1_abc"


@pytest.fixture
def files(fake_raw):
    return stats.build_match_files("abc", "game.replay", fake_raw)


def _detail(report, name):
    return next(p.detail for p in report.players if p.stats.name == name)


def test_build_report_keeps_match_and_player_stats(files):
    stats_file, map_file = files

    report = analysis.build_report(GAME_ID, stats_file, map_file)

    assert report.id == GAME_ID
    assert report.match.team0_score == 3
    assert [p.stats.name for p in report.players] == ["Alice", "Bob"]
    assert report.players[0].stats.goals == 3
    assert report.players[0].stats.boost == stats_file.players[0].boost


def test_build_report_speed(files):
    alice = _detail(analysis.build_report(GAME_ID, *files), "Alice")

    assert alice.avg_speed == 500.0
    assert alice.slow_pct == 100.0
    assert alice.supersonic_pct == 0.0
    assert alice.zero_boost_pct == 0.0
    assert alice.tracked_time_s == pytest.approx(2.2)


def test_build_report_zones_are_relative_to_team_side(files):
    report = analysis.build_report(GAME_ID, *files)

    # Alice (team 0) is at y=-2000, Bob (team 1) at y=3000: both in their own third.
    assert _detail(report, "Alice").defensive_zone_pct == 100.0
    assert _detail(report, "Bob").defensive_zone_pct == 100.0
    assert _detail(report, "Alice").offensive_zone_pct == 0.0


def test_build_report_ball_positioning(files):
    report = analysis.build_report(GAME_ID, *files)

    assert _detail(report, "Alice").behind_ball_pct == 100.0
    assert _detail(report, "Bob").behind_ball_pct == 100.0
    assert _detail(report, "Alice").first_man_pct == 100.0
    assert _detail(report, "Alice").second_man_pct == 0.0
    assert _detail(report, "Alice").avg_ball_distance > 0


def test_build_report_exposes_ball_y_for_momentum(files):
    _, map_file = files

    report = analysis.build_report(GAME_ID, *files)

    assert report.ball_y == map_file.ball.y
    assert report.sample_seconds == pytest.approx(1 / config.FRAME_SAMPLE_HZ)


def test_build_report_player_without_position_has_empty_detail(files):
    stats_file, map_file = files
    map_file.players[1].track.x = [None] * len(map_file.ball.t)

    bob = _detail(analysis.build_report(GAME_ID, stats_file, map_file), "Bob")

    assert bob.tracked_time_s == 0.0
    assert bob.avg_speed is None
    assert bob.defensive_zone_pct is None


def test_build_report_without_map_file_gives_empty_details(files):
    stats_file, _ = files

    report = analysis.build_report(GAME_ID, stats_file, None)

    assert report.players[0].stats.name == "Alice"
    assert report.players[0].detail.avg_speed is None


def test_build_report_without_map_file_has_no_momentum(files):
    stats_file, _ = files

    report = analysis.build_report(GAME_ID, stats_file, None)

    assert report.ball_y == []
    assert report.sample_seconds is None


def test_build_report_without_ball_position_has_no_ball_stats(files):
    stats_file, map_file = files
    map_file.ball.x = [None] * len(map_file.ball.t)

    alice = _detail(analysis.build_report(GAME_ID, stats_file, map_file), "Alice")

    assert alice.avg_ball_distance is None
    assert alice.first_man_pct is None
    assert alice.avg_speed == 500.0


def test_build_report_ignores_missing_speed_samples(files):
    stats_file, map_file = files
    map_file.players[0].track.speed[0] = None

    alice = _detail(analysis.build_report(GAME_ID, stats_file, map_file), "Alice")

    assert alice.avg_speed == 500.0


def test_build_report_copies_events(files):
    stats_file, map_file = files
    stats_file.events = [
        MatchEvent(seconds=1.0, type="goal", player="Alice", team=0),
        MatchEvent(seconds=2.5, type="demolition", player="Bob", team=1, victim="Alice"),
    ]

    report = analysis.build_report(GAME_ID, stats_file, map_file)

    assert report.events == stats_file.events


def test_build_report_events_empty_when_stats_file_has_none(files):
    assert analysis.build_report(GAME_ID, *files).events == []


def test_build_report_keeps_events_without_map_file(files):
    stats_file, _ = files
    stats_file.events = [MatchEvent(seconds=1.0, type="save", player="Bob", team=1)]

    report = analysis.build_report(GAME_ID, stats_file, None)

    assert [e.type for e in report.events] == ["save"]


def test_build_report_events_list_is_not_shared_with_stats_file(files):
    stats_file, map_file = files
    stats_file.events = [MatchEvent(seconds=1.0, type="goal", player="Alice", team=0)]

    report = analysis.build_report(GAME_ID, stats_file, map_file)
    report.events.append(MatchEvent(seconds=2.0, type="shot", player="Bob", team=1))

    assert len(stats_file.events) == 1


def _write_game(games_dir, files, with_map=True):
    folder = games_dir / GAME_ID
    folder.mkdir(parents=True)
    stats_file, map_file = files
    (folder / config.STATS_FILENAME).write_text(stats_file.model_dump_json(), encoding="utf-8")
    if with_map:
        (folder / config.MAP_FILENAME).write_text(map_file.model_dump_json(), encoding="utf-8")


def test_get_stats_endpoint(client, files, games_dir):
    _write_game(games_dir, files)

    response = client.get(f"/api/replays/{GAME_ID}/stats")

    assert response.status_code == 200
    body = response.json()
    assert body["match"]["map_name"] == "DFH Stadium"
    assert body["players"][0]["detail"]["avg_speed"] == 500.0
    assert "demolitions" in body["players"][0]["stats"]


def test_get_tracks_endpoint_returns_player_and_ball_tracks(client, files, games_dir):
    _write_game(games_dir, files)

    response = client.get(f"/api/replays/{GAME_ID}/tracks")

    assert response.status_code == 200
    body = response.json()
    assert [p["name"] for p in body["players"]] == ["Alice", "Bob"]
    assert body["players"][0]["team"] == 0
    assert set(body["players"][0]["track"]) >= {"t", "x", "y", "z", "qx", "qy", "qz", "qw", "boost", "speed"}
    assert body["ball"]["t"] == files[1].ball.t
    assert "heatmap" not in body["players"][0]


def test_get_tracks_endpoint_without_map_file_returns_404(client, files, games_dir):
    _write_game(games_dir, files, with_map=False)

    assert client.get(f"/api/replays/{GAME_ID}/tracks").status_code == 404


def test_get_tracks_endpoint_with_old_map_format_returns_404(client, files, games_dir):
    _write_game(games_dir, files)
    map_path = games_dir / GAME_ID / config.MAP_FILENAME
    old_map = json.loads(map_path.read_text(encoding="utf-8"))
    for player in old_map["players"]:
        for key in ("qx", "qy", "qz", "qw"):
            del player["track"][key]
    map_path.write_text(json.dumps(old_map), encoding="utf-8")

    response = client.get(f"/api/replays/{GAME_ID}/tracks")

    assert response.status_code == 404
    assert response.json()["detail"] == "Tracking data not found"


@pytest.mark.parametrize("game_id", ["unknown", "..", ".hidden"])
def test_get_tracks_unknown_id_returns_404(client, game_id):
    assert client.get(f"/api/replays/{game_id}/tracks").status_code == 404


def test_get_stats_endpoint_exposes_momentum(client, files, games_dir):
    _write_game(games_dir, files)

    body = client.get(f"/api/replays/{GAME_ID}/stats").json()

    assert body["ball_y"] == files[1].ball.y
    assert body["sample_seconds"] == pytest.approx(1 / config.FRAME_SAMPLE_HZ)


def test_get_stats_endpoint_exposes_events(client, files, games_dir):
    files[0].events = [MatchEvent(seconds=83.7, type="goal", player="Alice", team=0)]
    _write_game(games_dir, files)

    body = client.get(f"/api/replays/{GAME_ID}/stats").json()

    assert body["events"] == [{"seconds": 83.7, "type": "goal", "player": "Alice", "team": 0, "victim": None}]


def test_get_stats_endpoint_old_stats_file_without_events_key(client, files, games_dir):
    _write_game(games_dir, files)
    stats_path = games_dir / GAME_ID / config.STATS_FILENAME
    data = json.loads(stats_path.read_text(encoding="utf-8"))
    del data["events"]
    stats_path.write_text(json.dumps(data), encoding="utf-8")

    response = client.get(f"/api/replays/{GAME_ID}/stats")

    assert response.status_code == 200
    assert response.json()["events"] == []


def test_get_stats_endpoint_without_map_file(client, files, games_dir):
    _write_game(games_dir, files, with_map=False)

    response = client.get(f"/api/replays/{GAME_ID}/stats")

    assert response.status_code == 200
    assert response.json()["players"][0]["detail"]["avg_speed"] is None
    assert response.json()["ball_y"] == []


@pytest.mark.parametrize("game_id", ["unknown", "..", "a%2Fb", ".hidden"])
def test_get_stats_unknown_id_returns_404(client, game_id):
    assert client.get(f"/api/replays/{game_id}/stats").status_code == 404


def test_build_report_exposes_timeline_seconds_from_map_file(fake_raw):
    stats_file, map_file = stats.build_match_files("abc", "game.replay", fake_raw)

    report = analysis.build_report(GAME_ID, stats_file, map_file)

    assert report.timeline_seconds == 2.0


def test_build_report_without_map_file_has_no_timeline(files):
    report = analysis.build_report(GAME_ID, files[0], None)

    assert report.timeline_seconds is None


def test_get_stats_endpoint_exposes_timeline_seconds(client, fake_raw, games_dir):
    _write_game(games_dir, stats.build_match_files("abc", "game.replay", fake_raw))

    assert client.get(f"/api/replays/{GAME_ID}/stats").json()["timeline_seconds"] == 2.0


def test_get_stats_endpoint_legacy_map_json_without_timeline_seconds(client, files, games_dir):
    import json

    _write_game(games_dir, files)
    map_path = games_dir / GAME_ID / config.MAP_FILENAME
    legacy = json.loads(map_path.read_text(encoding="utf-8"))
    del legacy["timeline_seconds"]
    map_path.write_text(json.dumps(legacy), encoding="utf-8")

    response = client.get(f"/api/replays/{GAME_ID}/stats")

    assert response.status_code == 200
    assert response.json()["timeline_seconds"] is None
