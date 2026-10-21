import math

import pytest

from app.schemas.replay import StatsFile
from app.services import stats
from app.services.parser import ReplayParseError
from tests.conftest import (
    BOOST_A, BOOST_B, CAR_A, CAR_B, PAD_SMALL, PAD_SPARE, PRI_A, PRI_B,
    OBJ_CAR, OBJ_MATCH_DEMOLISHES, OBJ_PAWN_PRI, OBJ_PRI_NAME, OBJ_REP_BOOST, OBJ_RBSTATE,
    ROT_B,
    add_frame, add_update, announce_pad, demolish, pad_object_id, pickup, release, set_boost,
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


def test_build_match_files_missing_team_scores_default_to_zero(fake_raw):
    del fake_raw["properties"]["Team0Score"]
    del fake_raw["properties"]["Team1Score"]
    m = _stats(fake_raw).match
    assert (m.team0_score, m.team1_score) == (0, 0)


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
        lengths = {
            len(tr.t), len(tr.x), len(tr.y), len(tr.z), len(tr.speed), len(tr.boost),
            len(tr.qx), len(tr.qy), len(tr.qz), len(tr.qw),
        }
        assert lengths == {N_SAMPLES}
    b = data.ball
    assert {len(b.t), len(b.x), len(b.y), len(b.z)} == {N_SAMPLES}


def test_build_match_files_speed_is_velocity_norm(fake_raw):
    alice = _player(_map(fake_raw), "Alice")
    assert alice.track.speed[0] == pytest.approx(math.hypot(300, 400))
    assert alice.track.speed[0] == 500.0


_REMOVE = object()


def _set_body(raw, car, **fields):
    """Overwrite fields of the RigidBody of every update of a car (_REMOVE deletes the key)."""
    for f in raw["network_frames"]["frames"]:
        for u in f["updated_actors"]:
            if u["actor_id"] == car and u["object_id"] == OBJ_RBSTATE:
                for key, value in fields.items():
                    if value is _REMOVE:
                        u["attribute"]["RigidBody"].pop(key, None)
                    else:
                        u["attribute"]["RigidBody"][key] = value


def test_build_match_files_rotation_columns_follow_car_quaternion(fake_raw):
    tr = _player(_map(fake_raw), "Alice").track
    assert (tr.qx[0], tr.qy[0], tr.qz[0], tr.qw[0]) == (0.1, 0.2, 0.3, 0.9274)
    bob = _player(_map(fake_raw), "Bob").track
    assert (bob.qx[3], bob.qy[3], bob.qz[3], bob.qw[3]) == (0.5, 0.5, 0.5, 0.5)
    assert all(v is not None for v in tr.qx + tr.qy + tr.qz + tr.qw)


def test_build_match_files_rotation_rounded_to_4_decimals(fake_raw):
    _set_body(fake_raw, CAR_A, rotation={"x": 0.123449, "y": 0.123451, "z": -0.55555, "w": 0.7})
    tr = _player(_map(fake_raw), "Alice").track
    assert (tr.qx[0], tr.qy[0], tr.qw[0]) == (0.1234, 0.1235, 0.7)
    assert tr.qz[0] == round(-0.55555, 4)


def test_build_match_files_sleeping_car_has_no_speed_but_keeps_rotation(fake_raw):
    _set_body(fake_raw, CAR_A, linear_velocity=None)
    tr = _player(_map(fake_raw), "Alice").track
    assert set(tr.speed) == {None}
    assert tr.x[0] == -1000.0
    assert (tr.qx[0], tr.qy[0], tr.qz[0], tr.qw[0]) == (0.1, 0.2, 0.3, 0.9274)


def test_build_match_files_missing_rotation_gives_none(fake_raw):
    _set_body(fake_raw, CAR_A, rotation=_REMOVE)
    tr = _player(_map(fake_raw), "Alice").track
    assert set(tr.qx) == set(tr.qy) == set(tr.qz) == set(tr.qw) == {None}
    assert tr.x[0] == -1000.0  # position and speed are unaffected
    assert tr.speed[0] == 500.0
    assert _player(_map(fake_raw), "Bob").track.qw[0] == 0.5


@pytest.mark.parametrize("missing", ["x", "y", "z", "w"])
def test_build_match_files_incomplete_rotation_gives_none(fake_raw, missing):
    rotation = {k: v for k, v in ROT_B.items() if k != missing}
    _set_body(fake_raw, CAR_B, rotation=rotation)
    tr = _player(_map(fake_raw), "Bob").track
    assert set(tr.qx) == set(tr.qy) == set(tr.qz) == set(tr.qw) == {None}


def test_build_match_files_non_numeric_rotation_component_gives_none(fake_raw):
    _set_body(fake_raw, CAR_B, rotation={"x": 0.5, "y": "0.5", "z": 0.5, "w": True})
    assert set(_player(_map(fake_raw), "Bob").track.qw) == {None}


def test_build_match_files_player_without_car_has_no_rotation(fake_raw):
    fake_raw["properties"]["PlayerStats"].append({"Name": "Ghost", "Team": 0})
    tr = _player(_map(fake_raw), "Ghost").track
    assert {*tr.qx, *tr.qy, *tr.qz, *tr.qw} == {None}


def test_build_match_files_deleted_car_gives_no_rotation_afterwards(fake_raw):
    fake_raw["network_frames"]["frames"][30]["deleted_actors"] = [CAR_B]
    bob = _player(_map(fake_raw), "Bob").track
    assert bob.qw[0] == 0.5
    assert all(v is None for v in bob.qw[6:])


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


def test_build_match_files_second_valid_pickup_without_release_keeps_first_start(fake_raw):
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)  # t = 0.33 s
    pickup(fake_raw, 30, PAD_SMALL, CAR_A)  # t = 1.0 s, no 255 in between: must not replace the wait
    # delay = 7.5 - 0.33 = 7.17 s from the first pickup (>= 7) but 6.5 s from the second (< 7)
    release(fake_raw, add_frame(fake_raw, 7.5), PAD_SMALL)
    bob = _sp(fake_raw, "Bob").boost
    alice = _sp(fake_raw, "Alice").boost
    assert (bob.small_pads, bob.big_pads) == (0, 1)
    assert (alice.small_pads, alice.big_pads) == (0, 1)


def test_build_match_files_pad_duplicate_release_adds_no_delay():
    state = stats._State()
    state.add_actor(PAD_SMALL, "X.VehiclePickup_Boost_TA_0")
    state.cars.add(CAR_B)
    state.car_pri[CAR_B] = PRI_B
    state.pri_name[PRI_B] = "Bob"
    attribute = "TAGame.VehiclePickup_TA:NewReplicatedPickupData"
    state.now = 1.0
    state.update_actor(PAD_SMALL, attribute, {"PickupNew": {"instigator": CAR_B, "picked_up": 1}})
    state.now = 3.0
    for _ in range(2):
        state.update_actor(PAD_SMALL, attribute, {"PickupNew": {"instigator": None, "picked_up": 255}})
    assert state.pad_delays == {"X.VehiclePickup_Boost_TA_0": [2.0]}


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


def _cycles(raw, pad, cycles):
    """cycles: (pickup time, car, release time or None), chronological, times in s after frame 0."""
    for pick_time, car, release_time in cycles:
        pickup(raw, add_frame(raw, pick_time), pad, car)
        if release_time is not None:
            release(raw, add_frame(raw, release_time), pad)


def _pads(raw, name):
    boost = _sp(raw, name).boost
    return boost.small_pads, boost.big_pads


def test_build_match_files_pad_keyframe_reannounce_counted_once(fake_raw):
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    announce_pad(fake_raw, 15, PAD_SMALL, PAD_SMALL)  # keyframe: same actor announced again
    pickup(fake_raw, 15, PAD_SMALL, CAR_B)  # same (picked_up, instigator) key re-emitted
    assert _pads(fake_raw, "Bob") == (1, 0)


def test_build_match_files_pad_same_key_valid_again_after_release(fake_raw):
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    release(fake_raw, 20, PAD_SMALL)
    pickup(fake_raw, 30, PAD_SMALL, CAR_B)
    assert _pads(fake_raw, "Bob") == (2, 0)


def test_build_match_files_pad_recreated_with_new_actor_id_keeps_identity(fake_raw):
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    fake_raw["network_frames"]["frames"][15]["deleted_actors"].append(PAD_SMALL)
    announce_pad(fake_raw, 20, PAD_SPARE, PAD_SMALL)  # same object name, other actor_id
    pickup(fake_raw, 20, PAD_SPARE, CAR_B)  # same key: re-emission, not a new pickup
    assert _pads(fake_raw, "Bob") == (1, 0)


def test_build_match_files_pad_different_object_names_are_different_pads(fake_raw):
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    pickup(fake_raw, 10, PAD_SPARE, CAR_B)  # same key but another pad (other object name)
    assert _pads(fake_raw, "Bob") == (2, 0)


def test_build_match_files_pad_without_object_name_identified_by_actor_id(fake_raw):
    # an actor never announced as a pad still works: identity = actor_id, same key counted once
    for _ in range(2):
        pickup(fake_raw, 10, 99, CAR_B)
    assert _pads(fake_raw, "Bob") == (1, 0)


def test_build_match_files_pad_majority_of_long_delays_counts_all_pickups_big(fake_raw):
    _cycles(fake_raw, PAD_SMALL, [(3.0, CAR_B, 11.0), (12.0, CAR_A, 20.0), (21.0, CAR_B, 24.0)])
    assert _pads(fake_raw, "Bob") == (0, 2)
    assert _pads(fake_raw, "Alice") == (0, 1)


def test_build_match_files_pad_single_long_delay_among_short_stays_small(fake_raw):
    _cycles(fake_raw, PAD_SMALL, [
        (3.0, CAR_B, 7.0), (8.0, CAR_B, 12.0), (13.0, CAR_B, 20.5), (21.0, CAR_B, 25.0),
    ])
    assert _pads(fake_raw, "Bob") == (4, 0)


def test_build_match_files_pad_tie_between_long_and_short_delays_is_small(fake_raw):
    _cycles(fake_raw, PAD_SMALL, [(3.0, CAR_B, 11.0), (12.0, CAR_B, 16.0)])
    assert _pads(fake_raw, "Bob") == (2, 0)


def test_build_match_files_pad_classification_is_per_pad(fake_raw):
    _cycles(fake_raw, PAD_SMALL, [(3.0, CAR_B, 11.0)])
    _cycles(fake_raw, PAD_SPARE, [(12.0, CAR_B, 14.0)])
    assert _pads(fake_raw, "Bob") == (1, 1)


def test_build_match_files_pad_pickup_with_unresolved_player_ignored(fake_raw):
    pickup(fake_raw, 10, PAD_SMALL, 99)  # actor 99 is not a known car
    release(fake_raw, 20, PAD_SMALL)
    for name in ("Alice", "Bob"):
        assert _pads(fake_raw, name) == (0, 0)


def test_build_match_files_pad_non_integer_instigator_ignored(fake_raw):
    for frame, instigator in ((5, True), (6, "11"), (7, 1.0)):
        pickup(fake_raw, frame, PAD_SMALL, instigator)
    for name in ("Alice", "Bob"):
        assert _pads(fake_raw, name) == (0, 0)


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
    assert not keys & {"x", "y", "z", "t", "track", "heatmap", "ball", "speed", "qx", "qy", "qz", "qw"}


def test_build_match_files_map_file_has_no_stats_data(fake_raw_with_events):
    keys = set(_all_keys(_map(fake_raw_with_events).model_dump()))
    assert not keys & {"demolitions", "boost_stats", "small_pads", "big_pads", "score", "goals"}


# ---------- match events (timeline) ----------

PRI_GOALS = "TAGame.PRI_TA:MatchGoals"
PRI_ASSISTS = "TAGame.PRI_TA:MatchAssists"
PRI_SAVES = "TAGame.PRI_TA:MatchSaves"
PRI_SHOTS = "TAGame.PRI_TA:MatchShots"
PRI_UNKNOWN, PRI_CAROL = 90, 22  # PRI without any name / PRI named after a player absent from PlayerStats


def counter(raw, frame, pri, attribute, value):
    """PRI counter update {"Int": value}; the attribute name is registered in raw["objects"] if needed."""
    objects = raw["objects"]
    if attribute not in objects:
        objects.append(attribute)
    add_update(raw, frame, pri, objects.index(attribute), {"Int": value})


def _events(raw):
    return [(e.seconds, e.type, e.player, e.team, e.victim) for e in _stats(raw).events]


def _stats_without_events_dict():
    return {
        "replay_id": "abc",
        "original_filename": "old.replay",
        "match": {},
        "players": [],
    }


@pytest.mark.parametrize(
    "attribute, event_type",
    [(PRI_GOALS, "goal"), (PRI_ASSISTS, "assist"), (PRI_SAVES, "save"), (PRI_SHOTS, "shot")],
)
def test_build_match_files_counter_increment_produces_event(fake_raw, attribute, event_type):
    counter(fake_raw, 30, PRI_A, attribute, 1)

    assert _events(fake_raw) == [(1.0, event_type, "Alice", 0, None)]


def test_build_match_files_event_has_team_of_player(fake_raw):
    counter(fake_raw, 30, PRI_B, PRI_SAVES, 1)

    assert _events(fake_raw) == [(1.0, "save", "Bob", 1, None)]


def test_build_match_files_event_seconds_are_relative_to_first_frame(fake_raw):
    counter(fake_raw, 45, PRI_A, PRI_GOALS, 1)  # frame time is T_OFFSET + 1.5

    assert _events(fake_raw)[0][0] == 1.5


def test_build_match_files_event_seconds_rounded_to_one_decimal(fake_raw):
    counter(fake_raw, 20, PRI_A, PRI_GOALS, 1)  # 0.666... s

    assert _events(fake_raw)[0][0] == 0.7


def test_build_match_files_event_after_last_sampled_step_is_kept(fake_raw):
    late = add_frame(fake_raw, 8.5)
    counter(fake_raw, late, PRI_A, PRI_GOALS, 1)

    assert _events(fake_raw) == [(8.5, "goal", "Alice", 0, None)]


def test_build_match_files_counter_jump_produces_one_event_per_increment(fake_raw):
    counter(fake_raw, 30, PRI_A, PRI_GOALS, 3)

    assert _events(fake_raw) == [(1.0, "goal", "Alice", 0, None)] * 3


def test_build_match_files_counter_successive_updates_only_count_the_difference(fake_raw):
    counter(fake_raw, 20, PRI_A, PRI_GOALS, 1)
    counter(fake_raw, 40, PRI_A, PRI_GOALS, 3)

    assert [e[0] for e in _events(fake_raw)] == [0.7, 1.3, 1.3]


def test_build_match_files_counter_jump_is_capped_per_update(fake_raw):
    counter(fake_raw, 30, PRI_A, PRI_GOALS, stats.MAX_EVENTS_PER_UPDATE + 1)
    counter(fake_raw, 40, PRI_B, PRI_GOALS, stats.MAX_EVENTS_PER_UPDATE)

    events = _events(fake_raw)
    assert len([e for e in events if e[2] == "Alice"]) == stats.MAX_EVENTS_PER_UPDATE
    assert len([e for e in events if e[2] == "Bob"]) == stats.MAX_EVENTS_PER_UPDATE


def test_build_match_files_counter_same_value_produces_no_second_event(fake_raw):
    counter(fake_raw, 20, PRI_A, PRI_GOALS, 1)
    counter(fake_raw, 40, PRI_A, PRI_GOALS, 1)

    assert _events(fake_raw) == [(0.7, "goal", "Alice", 0, None)]


def test_build_match_files_counter_zero_produces_no_event(fake_raw):
    counter(fake_raw, 20, PRI_A, PRI_GOALS, 0)

    assert _events(fake_raw) == []


def test_build_match_files_counter_decrease_produces_no_event_and_resets_reference(fake_raw):
    counter(fake_raw, 10, PRI_A, PRI_GOALS, 2)
    counter(fake_raw, 20, PRI_A, PRI_GOALS, 1)
    counter(fake_raw, 30, PRI_A, PRI_GOALS, 2)

    # 2 events at f10, nothing at f20, then +1 relative to the last seen value (1) at f30
    assert [e[0] for e in _events(fake_raw)] == [0.3, 0.3, 1.0]


@pytest.mark.parametrize("value", [True, "2", 1.5, None])
def test_build_match_files_counter_non_integer_value_is_ignored(fake_raw, value):
    counter(fake_raw, 30, PRI_A, PRI_GOALS, value)

    assert _events(fake_raw) == []


def test_build_match_files_counters_are_tracked_per_player_and_per_type(fake_raw):
    counter(fake_raw, 30, PRI_A, PRI_GOALS, 1)
    counter(fake_raw, 30, PRI_B, PRI_GOALS, 1)
    counter(fake_raw, 30, PRI_A, PRI_SAVES, 1)

    assert sorted(e[1:3] for e in _events(fake_raw)) == [
        ("goal", "Alice"), ("goal", "Bob"), ("save", "Alice"),
    ]


def test_build_match_files_counter_of_actor_without_known_name_is_ignored(fake_raw):
    counter(fake_raw, 30, PRI_UNKNOWN, PRI_GOALS, 1)

    assert _events(fake_raw) == []


def test_build_match_files_event_of_player_absent_from_player_stats_is_ignored(fake_raw):
    add_update(fake_raw, 0, PRI_CAROL, OBJ_PRI_NAME, {"String": "Carol"})
    counter(fake_raw, 30, PRI_CAROL, PRI_GOALS, 1)
    counter(fake_raw, 30, PRI_A, PRI_ASSISTS, 1)

    assert _events(fake_raw) == [(1.0, "assist", "Alice", 0, None)]


def test_build_match_files_shot_is_dropped_when_same_player_goal_is_simultaneous(fake_raw):
    counter(fake_raw, 30, PRI_A, PRI_GOALS, 1)
    counter(fake_raw, 30, PRI_A, PRI_SHOTS, 1)

    assert _events(fake_raw) == [(1.0, "goal", "Alice", 0, None)]


def test_build_match_files_shot_slightly_before_goal_is_dropped(fake_raw):
    counter(fake_raw, 24, PRI_A, PRI_SHOTS, 1)
    counter(fake_raw, 30, PRI_A, PRI_GOALS, 1)

    assert [e[1] for e in _events(fake_raw)] == ["goal"]


def test_build_match_files_shot_exactly_one_second_from_goal_is_dropped(fake_raw):
    counter(fake_raw, 30, PRI_A, PRI_GOALS, 1)
    counter(fake_raw, 60, PRI_A, PRI_SHOTS, 1)  # 1.0 s later = SHOT_GOAL_DEDUP_WINDOW

    assert [e[1] for e in _events(fake_raw)] == ["goal"]


def test_build_match_files_shot_more_than_one_second_from_goal_is_kept(fake_raw):
    counter(fake_raw, 10, PRI_A, PRI_SHOTS, 1)
    late = add_frame(fake_raw, 1.5)
    counter(fake_raw, late, PRI_A, PRI_GOALS, 1)  # 1.5 - 0.33 > 1.0 s

    assert [e[1] for e in _events(fake_raw)] == ["shot", "goal"]


def test_build_match_files_shot_is_kept_when_goal_is_by_another_player(fake_raw):
    counter(fake_raw, 30, PRI_B, PRI_GOALS, 1)
    counter(fake_raw, 30, PRI_A, PRI_SHOTS, 1)

    assert sorted(e[1:3] for e in _events(fake_raw)) == [("goal", "Bob"), ("shot", "Alice")]


def test_build_match_files_other_event_types_are_not_dropped_near_a_goal(fake_raw):
    counter(fake_raw, 30, PRI_A, PRI_GOALS, 1)
    counter(fake_raw, 30, PRI_A, PRI_ASSISTS, 1)
    counter(fake_raw, 30, PRI_A, PRI_SAVES, 1)

    assert sorted(e[1] for e in _events(fake_raw)) == ["assist", "goal", "save"]


def test_build_match_files_demolition_produces_event_with_victim(fake_raw):
    demolish(fake_raw, 20, PRI_A, CAR_B)

    assert _events(fake_raw) == [(0.7, "demolition", "Alice", 0, "Bob")]


def test_build_match_files_demolition_duplicate_within_window_gives_one_event(fake_raw_with_events):
    assert _events(fake_raw_with_events) == [(0.7, "demolition", "Alice", 0, "Bob")]


def test_build_match_files_demolition_after_dedup_window_gives_second_event(fake_raw):
    demolish(fake_raw, 0, PRI_A, CAR_B)
    late = add_frame(fake_raw, 3.0)  # exactly DEMOLISH_DEDUP_WINDOW later
    demolish(fake_raw, late, PRI_A, CAR_B)

    assert [e[0] for e in _events(fake_raw)] == [0.0, 3.0]


def test_build_match_files_self_demolition_produces_no_event(fake_raw):
    demolish(fake_raw, 20, PRI_A, CAR_A, self_demolish=True)

    assert _events(fake_raw) == []


def test_build_match_files_events_are_sorted_chronologically(fake_raw):
    counter(fake_raw, 50, PRI_B, PRI_SAVES, 1)
    demolish(fake_raw, 20, PRI_A, CAR_B)
    counter(fake_raw, 10, PRI_A, PRI_GOALS, 1)
    late = add_frame(fake_raw, 2.5)
    counter(fake_raw, late, PRI_A, PRI_ASSISTS, 1)

    events = _events(fake_raw)
    assert [e[1] for e in events] == ["goal", "demolition", "save", "assist"]
    assert [e[0] for e in events] == sorted(e[0] for e in events)


def test_build_match_files_without_counters_has_no_events(fake_raw):
    assert _stats(fake_raw).events == []


def test_build_match_files_events_do_not_change_player_stats(fake_raw):
    before = _stats(fake_raw).players
    counter(fake_raw, 30, PRI_A, PRI_GOALS, 1)

    assert _stats(fake_raw).players == before


def test_stats_file_without_events_key_is_valid():
    assert StatsFile.model_validate(_stats_without_events_dict()).events == []


def test_stats_file_events_roundtrip_through_json(fake_raw):
    counter(fake_raw, 30, PRI_A, PRI_GOALS, 1)
    demolish(fake_raw, 20, PRI_A, CAR_B)
    original = _stats(fake_raw)

    assert StatsFile.model_validate_json(original.model_dump_json()) == original


def test_stats_file_rejects_unknown_event_type():
    data = _stats_without_events_dict()
    data["events"] = [{"seconds": 1.0, "type": "boost", "player": "Alice", "team": 0}]

    with pytest.raises(ValueError):
        StatsFile.model_validate(data)
