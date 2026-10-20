import math

import pytest

from app.services import stats
from app.services.parser import ReplayParseError
from tests.conftest import CAR_B, PRI_B, BOOST_A, OBJ_PRI_NAME, OBJ_PAWN_PRI, OBJ_CAR, OBJ_REP_BOOST

N_SAMPLES = 11  # 2.0 s at 5 Hz, inclusive


def _build(raw):
    return stats.build_replay_data("abc", "game.replay", raw)


def _player(data, name):
    return next(p for p in data.players if p.stats.name == name)


def test_build_replay_data_match_fields(fake_raw):
    data = _build(fake_raw)
    assert data.id == "abc"
    assert data.original_filename == "game.replay"
    m = data.match
    assert (m.match_type, m.team_size, m.team0_score, m.team1_score) == ("Online", 1, 3, 2)
    assert m.duration_seconds == 300.5
    assert m.map_name == "Stadium_P"
    assert m.date == "2024-01-02 03-04-05"


def test_build_replay_data_player_stats(fake_raw):
    data = _build(fake_raw)
    assert [p.stats.name for p in data.players] == ["Alice", "Bob"]
    alice = _player(data, "Alice").stats
    assert (alice.team, alice.score, alice.goals, alice.assists, alice.saves, alice.shots) == (0, 500, 3, 1, 2, 5)


def test_build_replay_data_resamples_at_5hz_relative_time(fake_raw):
    data = _build(fake_raw)
    t = data.ball.t
    assert t == [round(k * 0.2, 2) for k in range(N_SAMPLES)]
    assert t[0] == 0.0


def test_build_replay_data_arrays_have_same_length(fake_raw):
    data = _build(fake_raw)
    for p in data.players:
        tr = p.track
        assert {len(tr.t), len(tr.x), len(tr.y), len(tr.z), len(tr.speed), len(tr.boost)} == {N_SAMPLES}
    b = data.ball
    assert {len(b.t), len(b.x), len(b.y), len(b.z)} == {N_SAMPLES}


def test_build_replay_data_speed_is_velocity_norm(fake_raw):
    alice = _player(_build(fake_raw), "Alice")
    assert alice.track.speed[0] == pytest.approx(math.hypot(300, 400))
    assert alice.track.speed[0] == 500.0


def test_build_replay_data_boost_converted_to_percent(fake_raw):
    data = _build(fake_raw)
    assert _player(data, "Alice").track.boost[0] == 100
    assert _player(data, "Bob").track.boost[0] == 50
    assert all(isinstance(b, int) for b in _player(data, "Bob").track.boost)


def test_build_replay_data_boost_zero_maps_to_zero(fake_raw):
    for f in fake_raw["network_frames"]["frames"]:
        for u in f["updated_actors"]:
            if u["object_id"] == OBJ_REP_BOOST and u["actor_id"] == BOOST_A:
                u["attribute"]["ReplicatedBoost"]["boost_amount"] = 0
    assert _player(_build(fake_raw), "Alice").track.boost[0] == 0


def test_build_replay_data_positions_follow_frames(fake_raw):
    alice = _player(_build(fake_raw), "Alice").track
    # 0.2 s = frame 6 -> x = -1000 + 60
    assert alice.x[0] == -1000.0
    assert alice.x[1] == -940.0
    assert alice.y[0] == -2000.0
    assert alice.z[0] == 17.0


def test_build_replay_data_ball_present(fake_raw):
    ball = _build(fake_raw).ball
    assert all(v is not None for v in ball.x + ball.y + ball.z)
    assert ball.z[0] == 93.0


def test_build_replay_data_heatmap_dimensions_and_total(fake_raw):
    data = _build(fake_raw)
    for p in data.players:
        counts = p.heatmap.counts
        assert len(counts) == 20
        assert all(len(row) == 26 for row in counts)
        non_none = sum(1 for v in p.track.x if v is not None)
        assert sum(sum(row) for row in counts) == non_none == N_SAMPLES


def test_build_replay_data_heatmap_static_player_in_single_cell(fake_raw):
    counts = _player(_build(fake_raw), "Bob").heatmap.counts
    cells = [(i, j) for i, row in enumerate(counts) for j, v in enumerate(row) if v]
    assert cells == [(int((1000 + 4096) / 8192 * 20), int((3000 + 5120) / 10240 * 26))]


def test_build_replay_data_player_without_car_gives_none(fake_raw):
    fake_raw["properties"]["PlayerStats"].append({"Name": "Ghost", "Team": 0})
    ghost = _player(_build(fake_raw), "Ghost")
    assert set(ghost.track.x) == {None}
    assert set(ghost.track.boost) == {None}
    assert sum(sum(r) for r in ghost.heatmap.counts) == 0


def test_build_replay_data_deleted_actor_gives_none_afterwards(fake_raw):
    fake_raw["network_frames"]["frames"][30]["deleted_actors"] = [CAR_B]
    bob = _player(_build(fake_raw), "Bob").track
    assert all(v is not None for v in bob.x[:5])
    assert all(v is None for v in bob.x[6:])
    assert _player(_build(fake_raw), "Alice").track.x[-1] is not None


def test_build_replay_data_unknown_pri_name_ignored(fake_raw):
    f0 = fake_raw["network_frames"]["frames"][0]
    f0["new_actors"].append({"actor_id": 12, "object_id": OBJ_CAR})
    f0["updated_actors"] += [
        {"actor_id": 22, "object_id": OBJ_PRI_NAME, "attribute": {"String": "Spectator"}},
        {"actor_id": 12, "object_id": OBJ_PAWN_PRI, "attribute": {"ActiveActor": {"active": True, "actor": 22}}},
    ]
    data = _build(fake_raw)
    assert [p.stats.name for p in data.players] == ["Alice", "Bob"]


def test_build_replay_data_missing_player_stats_raises(fake_raw):
    del fake_raw["properties"]["PlayerStats"]
    with pytest.raises(ReplayParseError):
        _build(fake_raw)


def test_build_replay_data_empty_network_frames_raises(fake_raw):
    fake_raw["network_frames"] = {"frames": []}
    with pytest.raises(ReplayParseError):
        _build(fake_raw)


def test_build_replay_data_missing_network_frames_raises(fake_raw):
    del fake_raw["network_frames"]
    with pytest.raises(ReplayParseError):
        _build(fake_raw)


def test_build_replay_data_single_frame_gives_one_sample(fake_raw):
    fake_raw["network_frames"]["frames"] = fake_raw["network_frames"]["frames"][:1]
    data = _build(fake_raw)
    assert data.ball.t == [0.0]
    assert _player(data, "Alice").track.x == [-1000.0]
