import json

import pytest

from app import config
from app.services import pads, stats, storage
from tests.conftest import (
    CAR_A, CAR_B, OBJ_RBSTATE, PAD_BIG, PAD_BIG2, PAD_SMALL, PAD_SPARE,
    _rigid, add_frame, add_update, announce_pad, pickup, release,
)

GAME_ID = "Stadium_P_Online-1v1_abc"
FPS = 30


def _map(raw):
    return stats.build_match_files("abc", "game.replay", raw)[1]


def _park(raw, frame, car, x, y):
    """Teleport a car; call it before pickup() so the pickup sees this position."""
    add_update(raw, frame, car, OBJ_RBSTATE, _rigid(x, y, 17.0, 0.0, 0.0, 0.0))


def _pad_at(map_file, x, y):
    return next(p for p in map_file.pads if (p.x, p.y) == (x, y))


def test_pickup_times_are_relative_to_first_frame(fake_raw):
    _park(fake_raw, 10, CAR_B, 0.0, -4200.0)
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)

    pad = _pad_at(_map(fake_raw), 0.0, -4240.0)

    assert [p.t for p in pad.pickups] == [pytest.approx(10 / FPS, abs=1e-3)]


def test_back_is_the_time_of_the_following_release(fake_raw):
    _park(fake_raw, 10, CAR_B, 0.0, -4200.0)
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    release(fake_raw, 40, PAD_SMALL)

    pad = _pad_at(_map(fake_raw), 0.0, -4240.0)

    assert pad.pickups[0].back == pytest.approx(40 / FPS, abs=1e-3)


def test_back_is_none_without_release(fake_raw):
    _park(fake_raw, 10, CAR_B, 0.0, -4200.0)
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)

    pad = _pad_at(_map(fake_raw), 0.0, -4240.0)

    assert pad.pickups[0].back is None


def test_back_is_none_when_next_pickup_comes_before_the_release(fake_raw):
    _park(fake_raw, 10, CAR_B, 0.0, -4200.0)
    pickup(fake_raw, 10, PAD_SMALL, CAR_B, picked_up=1)
    _park(fake_raw, 30, CAR_B, 0.0, -4200.0)
    pickup(fake_raw, 30, PAD_SMALL, CAR_B, picked_up=3)
    release(fake_raw, 50, PAD_SMALL)

    pad = _pad_at(_map(fake_raw), 0.0, -4240.0)

    assert [p.back for p in pad.pickups[:1]] == [None]
    assert pad.pickups[1].back == pytest.approx(50 / FPS, abs=1e-3)


def test_duplicated_pickup_update_is_recorded_once(fake_raw):
    _park(fake_raw, 10, CAR_B, 0.0, -4200.0)
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    pickup(fake_raw, 11, PAD_SMALL, CAR_B)

    assert len(_pad_at(_map(fake_raw), 0.0, -4240.0).pickups) == 1


def test_pads_are_assigned_to_the_standard_positions_and_sorted(fake_raw):
    spots = ((PAD_SMALL, 5, 120.0, -4150.0), (PAD_BIG, 15, 3500.0, 80.0), (PAD_BIG2, 25, -3000.0, 4200.0))
    for pad, frame, x, y in spots:
        _park(fake_raw, frame, CAR_B, x, y)
        pickup(fake_raw, frame, pad, CAR_B)

    result = _map(fake_raw).pads

    assert [(p.x, p.y, p.big) for p in result] == [
        (-3072.0, 4096.0, True), (0.0, -4240.0, False), (3584.0, 0.0, True),
    ]


def test_position_is_the_median_of_the_pickers_positions(fake_raw):
    for frame, x in ((5, 50.0), (15, -40.0), (25, 3000.0)):  # one outlier
        _park(fake_raw, frame, CAR_B, x, -4240.0)
        pickup(fake_raw, frame, PAD_SMALL, CAR_B, picked_up=2 * frame + 1)

    assert [(p.x, p.y) for p in _map(fake_raw).pads] == [(0.0, -4240.0)]


def test_pad_without_known_position_is_ignored(fake_raw):
    pickup(fake_raw, 10, PAD_SMALL, 99)  # instigator is not a known car

    assert _map(fake_raw).pads == []


def test_pad_farther_than_900_from_every_standard_pad_is_ignored(fake_raw):
    _park(fake_raw, 10, CAR_B, 0.0, 0.0)  # 1024 uu from the closest standard pads
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)

    assert _map(fake_raw).pads == []


def test_recreated_pad_actor_is_merged_into_the_same_pad(fake_raw):
    _park(fake_raw, 10, CAR_B, 0.0, -4240.0)
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    release(fake_raw, 20, PAD_SMALL)
    announce_pad(fake_raw, 30, PAD_SPARE, PAD_BIG)  # another object name: another pad key
    _park(fake_raw, 40, CAR_B, 0.0, -4240.0)
    pickup(fake_raw, 40, PAD_SPARE, CAR_B)

    result = _map(fake_raw).pads

    assert len(result) == 1
    assert [p.t for p in result[0].pickups] == [
        pytest.approx(10 / FPS, abs=1e-3), pytest.approx(40 / FPS, abs=1e-3),
    ]
    assert result[0].pickups[0].back == pytest.approx(20 / FPS, abs=1e-3)
    assert result[0].pickups[1].back is None


def test_map_without_any_pickup_has_no_pads(fake_raw):
    assert _map(fake_raw).pads == []


def test_locate_pads_finds_all_standard_pads_from_noisy_samples():
    events = [
        (float(i), f"pad{i}", (x + 100.0, y - 100.0)) for i, (x, y, _big) in enumerate(pads.STANDARD_PADS)
    ]

    result = pads.locate_pads(events, [])

    assert len(result) == 34
    assert {(p["x"], p["y"]) for p in result} == {(x, y) for x, y, _big in pads.STANDARD_PADS}
    assert sum(p["big"] for p in result) == 6
    assert result == sorted(result, key=lambda p: (p["x"], p["y"]))


def test_locate_pads_is_a_global_assignment_not_a_greedy_one():
    # Key a is slightly closer to (0, 1024) than key b, but b is only in range of that pad.
    events = [(1.0, "a", (-500.0, 600.0)), (2.0, "b", (-300.0, 1500.0))]

    result = pads.locate_pads(events, [])

    assert {(p["x"], p["y"], len(p["pickups"])) for p in result} == {(0.0, 1024.0, 1), (-1024.0, 0.0, 1)}


def test_old_map_json_without_pads_is_still_readable(games_dir, fake_raw):
    _park(fake_raw, 10, CAR_B, 0.0, -4200.0)
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    stats_file, map_file, heatmap_file = stats.build_match_files("abc", "game.replay", fake_raw)
    folder = games_dir / GAME_ID
    folder.mkdir(parents=True)
    (folder / config.STATS_FILENAME).write_text(stats_file.model_dump_json(), encoding="utf-8")
    old_map = json.loads(map_file.model_dump_json())
    del old_map["pads"]
    (folder / config.MATCH3D_FILENAME).write_text(json.dumps(old_map), encoding="utf-8")

    tracks = storage.get_game_tracks(GAME_ID)

    assert tracks is not None
    assert tracks.pads == []


def test_tracks_expose_the_pads_of_the_map(games_dir, fake_raw):
    _park(fake_raw, 10, CAR_B, 0.0, -4200.0)
    pickup(fake_raw, 10, PAD_SMALL, CAR_B)
    stats_file, map_file, heatmap_file = stats.build_match_files("abc", "game.replay", fake_raw)
    folder = games_dir / GAME_ID
    folder.mkdir(parents=True)
    (folder / config.STATS_FILENAME).write_text(stats_file.model_dump_json(), encoding="utf-8")
    (folder / config.MATCH3D_FILENAME).write_text(map_file.model_dump_json(), encoding="utf-8")
    (folder / config.HEATMAP_FILENAME).write_text(heatmap_file.model_dump_json(), encoding="utf-8")

    tracks = storage.get_game_tracks(GAME_ID)

    assert tracks.pads == map_file.pads
    assert len(tracks.pads) == 1
