import math

import pytest

from app.services import stats
from app.services.parser import ReplayParseError
from tests.conftest import (
    BOOST_A, BOOST_B, CAR_A, CAR_B, PAD_SMALL, PRI_A, PRI_B,
    OBJ_CAR, OBJ_MATCH_DEMOLISHES, OBJ_PAWN_PRI, OBJ_PRI_NAME, OBJ_REP_BOOST,
    add_frame, add_update, demolish, pickup, release, set_boost,
)

N_SAMPLES = 11  # 2.0 s at 5 Hz, inclusive


def _build(raw):
    return stats.build_match_files("abc", "game.replay", raw)


def _map(raw):
    return _build(raw)[1]


def _stats(raw):
    return _build(raw)[0]


def _player(data, name):
    return next(p for p in data.players if p.name == name)


def test_build_match_files_match_fields(fake_raw):
    stats_file, map_file = _build(fake_raw)
    assert stats_file.replay_id == map_file.replay_id == "abc"
    assert stats_file.original_filename == "game.replay"
    m = stats_file.match
    assert (m.match_type, m.team_size, m.team0_score, m.team1_score) == ("Online", 1, 3, 2)
    assert m.duration_seconds == 300.5
    assert m.map_name == "Stadium_P"
    assert m.date == "2024-01-02 03-04-05"


def test_build_match_files_player_stats(fake_raw):
    data = _stats(fake_raw)
    assert [p.name for p in data.players] == ["Alice", "Bob"]
    alice = _player(data, "Alice")
    assert (alice.team, alice.score, alice.goals, alice.assists, alice.saves, alice.shots) == (0, 500, 3, 1, 2, 5)


def test_build_match_files_resamples_at_5hz_relative_time(fake_raw):
    data = _map(fake_raw)
    t = data.ball.t
    assert t == [round(k * 0.2, 2) for k in range(N_SAMPLES)]
    assert t[0] == 0.0


def test_build_match_files_arrays_have_same_length(fake_raw):
    data = _map(fake_raw)
    for p in data.players:
        tr = p.track
        assert {len(tr.t), len(tr.x), len(tr.y), len(tr.z), len(tr.speed), len(tr.boost)} == {N_SAMPLES}
    b = data.ball
    assert {len(b.t), len(b.x), len(b.y), len(b.z)} == {N_SAMPLES}


def test_build_match_files_speed_is_velocity_norm(fake_raw):
    alice = _player(_map(fake_raw), "Alice")
    assert alice.track.speed[0] == pytest.approx(math.hypot(300, 400))
    assert alice.track.speed[0] == 500.0


def test_build_match_files_boost_converted_to_percent(fake_raw):
    data = _map(fake_raw)
    assert _player(data, "Alice").track.boost[0] == 100
    assert _player(data, "Bob").track.boost[0] == 50
    assert all(isinstance(b, int) for b in _player(data, "Bob").track.boost)


def test_build_match_files_boost_zero_maps_to_zero(fake_raw):
    for f in fake_raw["network_frames"]["frames"]:
        for u in f["updated_actors"]:
            if u["object_id"] == OBJ_REP_BOOST and u["actor_id"] == BOOST_A:
                u["attribute"]["ReplicatedBoost"]["boost_amount"] = 0
    assert _player(_map(fake_raw), "Alice").track.boost[0] == 0


def test_build_match_files_positions_follow_frames(fake_raw):
    alice = _player(_map(fake_raw), "Alice").track
    # 0.2 s = frame 6 -> x = -1000 + 60
    assert alice.x[0] == -1000.0
    assert alice.x[1] == -940.0
    assert alice.y[0] == -2000.0
    assert alice.z[0] == 17.0


def test_build_match_files_ball_present(fake_raw):
    ball = _map(fake_raw).ball
    assert all(v is not None for v in ball.x + ball.y + ball.z)
    assert ball.z[0] == 93.0


def test_build_match_files_heatmap_dimensions_and_total(fake_raw):
    data = _map(fake_raw)
    for p in data.players:
        counts = p.heatmap.counts
        assert len(counts) == 20
        assert all(len(row) == 26 for row in counts)
        non_none = sum(1 for v in p.track.x if v is not None)
        assert sum(sum(row) for row in counts) == non_none == N_SAMPLES


def test_build_match_files_heatmap_static_player_in_single_cell(fake_raw):
    counts = _player(_map(fake_raw), "Bob").heatmap.counts
    cells = [(i, j) for i, row in enumerate(counts) for j, v in enumerate(row) if v]
    assert cells == [(int((1000 + 4096) / 8192 * 20), int((3000 + 5120) / 10240 * 26))]


def test_build_match_files_player_without_car_gives_none(fake_raw):
    fake_raw["properties"]["PlayerStats"].append({"Name": "Ghost", "Team": 0})
    ghost = _player(_map(fake_raw), "Ghost")
    assert set(ghost.track.x) == {None}
    assert set(ghost.track.boost) == {None}
    assert sum(sum(r) for r in ghost.heatmap.counts) == 0


def test_build_match_files_deleted_actor_gives_none_afterwards(fake_raw):
    fake_raw["network_frames"]["frames"][30]["deleted_actors"] = [CAR_B]
    bob = _player(_map(fake_raw), "Bob").track
    assert all(v is not None for v in bob.x[:5])
    assert all(v is None for v in bob.x[6:])
    assert _player(_map(fake_raw), "Alice").track.x[-1] is not None


def test_build_match_files_unknown_pri_name_ignored(fake_raw):
    f0 = fake_raw["network_frames"]["frames"][0]
    f0["new_actors"].append({"actor_id": 12, "object_id": OBJ_CAR})
    f0["updated_actors"] += [
        {"actor_id": 22, "object_id": OBJ_PRI_NAME, "attribute": {"String": "Spectator"}},
        {"actor_id": 12, "object_id": OBJ_PAWN_PRI, "attribute": {"ActiveActor": {"active": True, "actor": 22}}},
    ]
    assert [p.name for p in _stats(fake_raw).players] == ["Alice", "Bob"]
    assert [p.name for p in _map(fake_raw).players] == ["Alice", "Bob"]


def test_build_match_files_missing_player_stats_raises(fake_raw):
    del fake_raw["properties"]["PlayerStats"]
    with pytest.raises(ReplayParseError):
        _build(fake_raw)


def test_build_match_files_empty_network_frames_raises(fake_raw):
    fake_raw["network_frames"] = {"frames": []}
    with pytest.raises(ReplayParseError):
        _build(fake_raw)


def test_build_match_files_missing_network_frames_raises(fake_raw):
    del fake_raw["network_frames"]
    with pytest.raises(ReplayParseError):
        _build(fake_raw)


def test_build_match_files_single_frame_gives_one_sample(fake_raw):
    fake_raw["network_frames"]["frames"] = fake_raw["network_frames"]["frames"][:1]
    data = _map(fake_raw)
    assert data.ball.t == [0.0]
    assert _player(data, "Alice").track.x == [-1000.0]


# ---- stats.json content: demolitions and boost ----


def _sp(raw, name):
    return _player(_stats(raw), name)


def test_build_match_files_demolitions_inflicted_and_received(fake_raw_with_events):
    alice = _sp(fake_raw_with_events, "Alice")
    bob = _sp(fake_raw_with_events, "Bob")
    assert (alice.demolitions.inflicted, alice.demolitions.received) == (1, 0)
    assert (bob.demolitions.inflicted, bob.demolitions.received) == (0, 1)


def test_build_match_files_demolition_duplicate_within_3s_counted_once(fake_raw_with_events):
    # The fixture already holds a duplicate 10 frames (0.33 s) after the first one.
    assert _sp(fake_raw_with_events, "Bob").demolitions.received == 1


def test_build_match_files_demolition_after_dedup_window_counted_again(fake_raw_with_events):
    raw = fake_raw_with_events
    last = raw["network_frames"]["frames"][-1]
    raw["network_frames"]["frames"].append(
        {"time": last["time"] + 4.0, "delta": 0, "new_actors": [], "updated_actors": [], "deleted_actors": []}
    )
    demolish(raw, len(raw["network_frames"]["frames"]) - 1, PRI_A, CAR_B)
    assert _sp(raw, "Bob").demolitions.received == 2


def test_build_match_files_demolitions_without_counter_use_events(fake_raw_with_events):
    raw = fake_raw_with_events
    for f in raw["network_frames"]["frames"]:
        f["updated_actors"] = [u for u in f["updated_actors"] if u["object_id"] != OBJ_MATCH_DEMOLISHES]
    assert _sp(raw, "Alice").demolitions.inflicted == 1


def test_build_match_files_match_demolishes_counter_takes_priority_for_inflicted(fake_raw_with_events):
    add_update(fake_raw_with_events, 50, PRI_A, OBJ_MATCH_DEMOLISHES, {"Int": 5})
    alice = _sp(fake_raw_with_events, "Alice")
    assert alice.demolitions.inflicted == 5
    assert _sp(fake_raw_with_events, "Bob").demolitions.received == 1


def test_build_match_files_self_demolish_ignored(fake_raw):
    demolish(fake_raw, 20, PRI_B, CAR_B, self_demolish=True)
    for name in ("Alice", "Bob"):
        d = _sp(fake_raw, name).demolitions
        assert (d.inflicted, d.received) == (0, 0)


def test_build_match_files_demolish_by_same_player_ignored(fake_raw):
    demolish(fake_raw, 20, PRI_B, CAR_B)
    assert _sp(fake_raw, "Bob").demolitions.received == 0


def test_build_match_files_legacy_demolish_attribute_supported(fake_raw_with_events):
    raw = fake_raw_with_events
    raw["objects"][10] = "TAGame.Car_TA:ReplicatedDemolish"
    for f in raw["network_frames"]["frames"]:
        for u in f["updated_actors"]:
            if u["object_id"] == 10:
                u["attribute"] = {"Demolish": u["attribute"]["DemolishExtended"]}
    assert _sp(raw, "Bob").demolitions.received == 1


def test_build_match_files_small_and_big_pads_counted(fake_raw_with_events):
    boost = _sp(fake_raw_with_events, "Bob").boost
    assert (boost.small_pads, boost.big_pads) == (1, 2)
    alice = _sp(fake_raw_with_events, "Alice").boost
    assert (alice.small_pads, alice.big_pads) == (0, 0)


# delay (s) between the pickup (frame 30 = 1.0 s) and the pad becoming available again
PAD_CASES = [
    pytest.param(0.4, "small", id="delay-0.4"),
    pytest.param(4.0, "small", id="delay-4.0"),
    pytest.param(6.9, "small", id="delay-6.9"),
    pytest.param(7.0, "big", id="delay-7.0"),
    pytest.param(10.0, "big", id="delay-10.0"),
]


@pytest.mark.parametrize("delay, expected", PAD_CASES)
def test_build_match_files_pad_size_thresholds(fake_raw, delay, expected):
    pickup(fake_raw, 30, PAD_SMALL, CAR_B)
    release(fake_raw, add_frame(fake_raw, 1.0 + delay), PAD_SMALL)
    boost = _sp(fake_raw, "Bob").boost
    assert (boost.small_pads, boost.big_pads) == ((1, 0) if expected == "small" else (0, 1))


def test_build_match_files_pad_size_ignores_boost_gain(fake_raw):
    # Boost goes 0 -> 100 % (huge gain) but the pad respawns after 1 s: small.
    set_boost(fake_raw, 1, BOOST_B, 0)
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    set_boost(fake_raw, 12, BOOST_B, 255)
    release(fake_raw, 40, PAD_SMALL)
    boost = _sp(fake_raw, "Bob").boost
    assert (boost.small_pads, boost.big_pads) == (1, 0)


def test_build_match_files_pad_pickup_never_released_counted_small_at_end(fake_raw):
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    add_frame(fake_raw, 30.0)
    boost = _sp(fake_raw, "Bob").boost
    assert (boost.small_pads, boost.big_pads) == (1, 0)


def test_build_match_files_second_pickup_on_pending_pad_counts_first_small(fake_raw):
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    pickup(fake_raw, 30, PAD_SMALL, CAR_A)
    release(fake_raw, add_frame(fake_raw, 11.0), PAD_SMALL)  # 10 s after Alice's pickup
    bob = _sp(fake_raw, "Bob").boost
    alice = _sp(fake_raw, "Alice").boost
    assert (bob.small_pads, bob.big_pads) == (1, 0)
    assert (alice.small_pads, alice.big_pads) == (0, 1)


def test_build_match_files_pad_release_counted_once(fake_raw):
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    release(fake_raw, 20, PAD_SMALL)
    release(fake_raw, 21, PAD_SMALL)
    boost = _sp(fake_raw, "Bob").boost
    assert (boost.small_pads, boost.big_pads) == (1, 0)


def test_build_match_files_pad_without_instigator_ignored(fake_raw):
    pickup(fake_raw, 5, PAD_SMALL, None, picked_up=255)
    pickup(fake_raw, 6, PAD_SMALL, None, picked_up=1)
    pickup(fake_raw, 7, PAD_SMALL, -1, picked_up=1)
    for name in ("Alice", "Bob"):
        boost = _sp(fake_raw, name).boost
        assert (boost.small_pads, boost.big_pads) == (0, 0)


def test_build_match_files_release_without_pending_pickup_ignored(fake_raw):
    release(fake_raw, 5, PAD_SMALL)
    pickup(fake_raw, 6, PAD_SMALL, CAR_B, picked_up=255)
    boost = _sp(fake_raw, "Bob").boost
    assert (boost.small_pads, boost.big_pads) == (0, 0)


def test_build_match_files_same_pickup_repeated_counted_once(fake_raw):
    for frame in (10, 11, 12):
        pickup(fake_raw, frame, PAD_SMALL, CAR_B)
    assert _sp(fake_raw, "Bob").boost.small_pads == 1


def test_build_match_files_consumed_per_minute(fake_raw_with_events):
    # Alice consumes 40 %, Bob 20 % over 300.5 s
    assert _sp(fake_raw_with_events, "Alice").boost.consumed_per_minute == round(40 / (300.5 / 60), 1) == 8.0
    assert _sp(fake_raw_with_events, "Bob").boost.consumed_per_minute == 4.0


def test_build_match_files_average_level_time_weighted(fake_raw_with_events):
    # Alice: (20 * 100 + 40 * 60) / 60 frames = 73.3 ; Bob: 4462.35 / 60 = 74.4
    assert _sp(fake_raw_with_events, "Alice").boost.average_level == 73.3
    assert _sp(fake_raw_with_events, "Bob").boost.average_level == 74.4


def test_build_match_files_constant_level_gives_that_average_and_no_consumption(fake_raw):
    alice = _sp(fake_raw, "Alice").boost
    assert alice.average_level == 100.0
    assert alice.consumed_per_minute == 0.0
    assert _sp(fake_raw, "Bob").boost.average_level == 50.2


def test_build_match_files_missing_duration_gives_no_consumption_rate(fake_raw_with_events):
    del fake_raw_with_events["properties"]["TotalSecondsPlayed"]
    stats_file = _stats(fake_raw_with_events)
    assert stats_file.match.duration_seconds is None
    assert all(p.boost.consumed_per_minute is None for p in stats_file.players)


def test_build_match_files_zero_duration_gives_no_consumption_rate(fake_raw_with_events):
    fake_raw_with_events["properties"]["TotalSecondsPlayed"] = 0
    assert all(p.boost.consumed_per_minute is None for p in _stats(fake_raw_with_events).players)


def test_build_match_files_player_without_car_has_zero_stats_and_no_average(fake_raw):
    fake_raw["properties"]["PlayerStats"].append({"Name": "Ghost", "Team": 0})
    ghost = _sp(fake_raw, "Ghost")
    assert (ghost.demolitions.inflicted, ghost.demolitions.received) == (0, 0)
    assert (ghost.boost.small_pads, ghost.boost.big_pads) == (0, 0)
    assert ghost.boost.average_level is None


def _all_keys(value):
    if isinstance(value, dict):
        for k, v in value.items():
            yield k
            yield from _all_keys(v)
    elif isinstance(value, list):
        for v in value:
            yield from _all_keys(v)


def test_build_match_files_stats_file_has_no_tracking_data(fake_raw_with_events):
    keys = set(_all_keys(_stats(fake_raw_with_events).model_dump()))
    assert not keys & {"x", "y", "z", "t", "track", "heatmap", "ball", "speed"}


def test_build_match_files_map_file_has_no_stats_data(fake_raw_with_events):
    keys = set(_all_keys(_map(fake_raw_with_events).model_dump()))
    assert not keys & {"demolitions", "boost_stats", "small_pads", "big_pads", "score", "goals"}
