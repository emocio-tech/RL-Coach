import json

import pytest

from app import config
from app.schemas.replay import MapFile, MatchHeatmaps
from app.services import coach, stats, storage
from tests.conftest import BALL_ID, OBJ_RBSTATE

GAME_ID = "Stadium_P_Online-1v1_abc"


@pytest.fixture
def game(games_dir, fake_raw):
    folder = games_dir / GAME_ID
    folder.mkdir(parents=True)
    stats_file, map_file = stats.build_match_files("abc", "game.replay", fake_raw)
    (folder / config.STATS_FILENAME).write_text(stats_file.model_dump_json(), encoding="utf-8")
    (folder / config.MAP_FILENAME).write_text(map_file.model_dump_json(), encoding="utf-8")
    return GAME_ID


def _stored_map(game_id):
    path = config.GAMES_DIR / game_id / config.MAP_FILENAME
    return MapFile.model_validate_json(path.read_text(encoding="utf-8"))


def _total(counts):
    return sum(sum(row) for row in counts)


def _non_zero_cells(counts):
    return {(i, j): v for i, row in enumerate(counts) for j, v in enumerate(row) if v}


# ---------- stats.heatmap_from_points ----------


def test_heatmap_from_points_counts_in_right_cells():
    heatmap = stats.heatmap_from_points([0.0, 0.0, -4000.0], [0.0, 0.0, 5000.0])

    assert _non_zero_cells(heatmap.counts) == {(10, 13): 2, (0, 25): 1}


def test_heatmap_from_points_grid_dimensions():
    counts = stats.heatmap_from_points([0.0], [0.0]).counts

    assert len(counts) == 20
    assert all(len(row) == 26 for row in counts)


def test_heatmap_from_points_index_is_x_then_y():
    # x drives the first index (20 rows), y the second (26 columns).
    counts = stats.heatmap_from_points([-4000.0], [5000.0]).counts

    assert counts[0][25] == 1


def test_heatmap_from_points_ignores_none_x():
    heatmap = stats.heatmap_from_points([None, 0.0], [0.0, 0.0])

    assert _total(heatmap.counts) == 1


def test_heatmap_from_points_ignores_none_y():
    heatmap = stats.heatmap_from_points([0.0, 0.0], [None, 0.0])

    assert _total(heatmap.counts) == 1


def test_heatmap_from_points_empty_lists_give_zero_grid():
    counts = stats.heatmap_from_points([], []).counts

    assert len(counts) == 20
    assert _total(counts) == 0


def test_heatmap_from_points_only_none_gives_zero_grid():
    assert _total(stats.heatmap_from_points([None, None], [None, None]).counts) == 0


def test_heatmap_from_points_lower_bounds_in_first_cell():
    counts = stats.heatmap_from_points([-4096.0], [-5120.0]).counts

    assert _non_zero_cells(counts) == {(0, 0): 1}


def test_heatmap_from_points_upper_bounds_clamped_to_last_cell():
    counts = stats.heatmap_from_points([4096.0], [5120.0]).counts

    assert _non_zero_cells(counts) == {(19, 25): 1}


def test_heatmap_from_points_out_of_bounds_clamped_to_edge_cells():
    counts = stats.heatmap_from_points([-9000.0, 9000.0], [-9000.0, 9000.0]).counts

    assert _non_zero_cells(counts) == {(0, 0): 1, (19, 25): 1}


def test_heatmap_from_points_just_inside_upper_bound():
    counts = stats.heatmap_from_points([4095.9], [5119.9]).counts

    assert _non_zero_cells(counts) == {(19, 25): 1}


def test_heatmap_from_points_cell_boundary_goes_to_next_cell():
    # x=0 is exactly the boundary between cells 9 and 10 (exact in floating point).
    counts = stats.heatmap_from_points([0.0, -0.01], [0.0, 0.0]).counts

    assert _non_zero_cells(counts) == {(10, 13): 1, (9, 13): 1}


def test_heatmap_from_points_different_lengths_truncated_to_shortest():
    assert _total(stats.heatmap_from_points([0.0, 0.0, 0.0], [0.0]).counts) == 1


def test_heatmap_from_points_single_point():
    assert _total(stats.heatmap_from_points([100.0], [200.0]).counts) == 1


def test_heatmap_from_points_keeps_default_bounds():
    heatmap = stats.heatmap_from_points([0.0], [0.0])

    assert (heatmap.x_min, heatmap.x_max, heatmap.y_min, heatmap.y_max) == (-4096.0, 4096.0, -5120.0, 5120.0)


def test_heatmap_from_points_skip_excludes_flagged_points():
    heatmap = stats.heatmap_from_points([0.0, 0.0, -4000.0], [0.0, 0.0, 5000.0], skip=[True, False, False])

    assert _non_zero_cells(heatmap.counts) == {(10, 13): 1, (0, 25): 1}


def test_heatmap_from_points_skip_shorter_than_points_keeps_the_rest():
    heatmap = stats.heatmap_from_points([0.0, 0.0, 0.0], [0.0, 0.0, 0.0], skip=[True])

    assert _total(heatmap.counts) == 2


def test_heatmap_from_points_skip_none_or_all_false_changes_nothing():
    xs, ys = [0.0, 100.0, -4000.0], [0.0, 200.0, 5000.0]

    assert stats.heatmap_from_points(xs, ys, skip=None).counts == stats.heatmap_from_points(xs, ys).counts
    assert stats.heatmap_from_points(xs, ys, skip=[False] * 3).counts == stats.heatmap_from_points(xs, ys).counts


# ---------- stats.dead_ball_mask ----------


def _still(n, x=0.0, y=0.0, z=93.0):
    return [x] * n, [y] * n, [z] * n


def test_dead_ball_mask_flags_a_still_run_of_enough_samples():
    xs, ys, zs = _still(stats.DEAD_BALL_MIN_SAMPLES)

    assert stats.dead_ball_mask(xs, ys, zs) == [True] * stats.DEAD_BALL_MIN_SAMPLES


def test_dead_ball_mask_ignores_a_still_run_just_too_short():
    xs, ys, zs = _still(stats.DEAD_BALL_MIN_SAMPLES - 1)

    assert not any(stats.dead_ball_mask(xs, ys, zs))


def test_dead_ball_mask_does_not_flag_a_moving_ball():
    n = 30
    xs = [i * (stats.DEAD_BALL_MAX_STEP + 1) for i in range(n)]

    assert not any(stats.dead_ball_mask(xs, [0.0] * n, [93.0] * n))


def test_dead_ball_mask_counts_height_as_movement():
    n = 30
    zs = [93.0 + i * (stats.DEAD_BALL_MAX_STEP + 1) for i in range(n)]

    assert not any(stats.dead_ball_mask([0.0] * n, [0.0] * n, zs))


def test_dead_ball_mask_flags_only_the_still_part():
    still = stats.DEAD_BALL_MIN_SAMPLES + 2
    moving = [1000.0 + 100 * i for i in range(5)]
    xs = [0.0] * still + moving
    ys = [0.0] * len(xs)
    zs = [93.0] * len(xs)

    assert stats.dead_ball_mask(xs, ys, zs) == [True] * still + [False] * 5


def test_dead_ball_mask_flags_several_runs():
    n = stats.DEAD_BALL_MIN_SAMPLES
    xs = [0.0] * n + [500.0, 900.0] + [-3000.0] * n
    ys = [0.0] * len(xs)
    zs = [93.0] * len(xs)

    assert stats.dead_ball_mask(xs, ys, zs) == [True] * n + [False, False] + [True] * n


def test_dead_ball_mask_none_breaks_a_run():
    n = stats.DEAD_BALL_MIN_SAMPLES
    xs, ys, zs = _still(n)
    xs[n // 2] = None  # each half is shorter than the minimum

    assert not any(stats.dead_ball_mask(xs, ys, zs))


def test_dead_ball_mask_empty_input():
    assert stats.dead_ball_mask([], [], []) == []


def test_build_match_files_player_heatmap_matches_heatmap_from_points(fake_raw):
    # Non-regression: the player heatmap of map.json is the binning of the player's own track
    # (the ball of fake_raw keeps moving, so no sample is dead).
    map_file = stats.build_match_files("abc", "game.replay", fake_raw)[1]

    assert not any(stats.dead_ball_mask(map_file.ball.x, map_file.ball.y, map_file.ball.z))
    assert map_file.players
    for player in map_file.players:
        expected = stats.heatmap_from_points(player.track.x, player.track.y)
        assert player.heatmap.counts == expected.counts


def test_build_match_files_stores_ball_heatmap_of_ball_track(fake_raw):
    map_file = stats.build_match_files("abc", "game.replay", fake_raw)[1]

    assert map_file.ball_heatmap is not None
    assert map_file.ball_heatmap.counts == stats.heatmap_from_points(map_file.ball.x, map_file.ball.y).counts
    assert _total(map_file.ball_heatmap.counts) > 0


def _freeze_ball_until(raw, last_still_frame, moved_x=500.0):
    """Ball motionless up to last_still_frame (included), then moved to moved_x (a kickoff-like dead period)."""
    for index, frame in enumerate(raw["network_frames"]["frames"]):
        for update in frame["updated_actors"]:
            if update["actor_id"] == BALL_ID and update["object_id"] == OBJ_RBSTATE:
                x = 0.0 if index <= last_still_frame else moved_x
                update["attribute"]["RigidBody"]["location"]["x"] = x


def test_build_match_files_heatmaps_ignore_dead_ball_samples(fake_raw):
    # Ball still for frames 0..54 = samples 0..9 (>= DEAD_BALL_MIN_SAMPLES), then it moves: only sample 10 is live.
    _freeze_ball_until(fake_raw, last_still_frame=54)

    map_file = stats.build_match_files("abc", "game.replay", fake_raw)[1]

    dead = stats.dead_ball_mask(map_file.ball.x, map_file.ball.y, map_file.ball.z)
    assert dead == [True] * 10 + [False]
    assert _total(map_file.ball_heatmap.counts) == 1
    for player in map_file.players:
        assert _total(player.heatmap.counts) == 1
        # the tracks themselves keep every sample (3D replay, positioning page)
        assert len(player.track.x) == len(dead)
    assert len(map_file.ball.x) == len(dead)


def test_map_file_without_ball_heatmap_is_still_valid(fake_raw):
    # Files imported before ball_heatmap existed must keep loading.
    map_file = stats.build_match_files("abc", "game.replay", fake_raw)[1]

    legacy = MapFile.model_validate_json(map_file.model_dump_json(exclude={"ball_heatmap"}))

    assert legacy.ball_heatmap is None


# ---------- storage.get_game_heatmaps ----------


def test_get_game_heatmaps_players_and_ball(game):
    stored = _stored_map(game)

    result = storage.get_game_heatmaps(game)

    assert isinstance(result, MatchHeatmaps)
    assert [(p.name, p.team) for p in result.players] == [(p.name, p.team) for p in stored.players]
    for got, expected in zip(result.players, stored.players):
        assert got.heatmap.counts == expected.heatmap.counts


def test_get_game_heatmaps_ball_matches_ball_track(game):
    stored = _stored_map(game)

    result = storage.get_game_heatmaps(game)

    assert result.ball.counts == stats.heatmap_from_points(stored.ball.x, stored.ball.y).counts
    assert _total(result.ball.counts) == len([v for v in stored.ball.x if v is not None]) > 0


def test_get_game_heatmaps_ball_read_from_map_file_when_stored(game):
    # A stored ball heatmap is returned as is, not recomputed from the ball track.
    path = config.GAMES_DIR / game / config.MAP_FILENAME
    stored = _stored_map(game)
    marker = [[0] * 26 for _ in range(20)]
    marker[3][4] = 99
    stored.ball_heatmap = stored.ball_heatmap.model_copy(update={"counts": marker})
    path.write_text(stored.model_dump_json(), encoding="utf-8")

    assert storage.get_game_heatmaps(game).ball.counts == marker


def test_get_game_heatmaps_read_from_map_file_players_untouched_when_ball_heatmap_stored(game):
    # With a stored ball heatmap the file is current: player heatmaps are returned exactly as stored.
    path = config.GAMES_DIR / game / config.MAP_FILENAME
    stored = _stored_map(game)
    marker = [[0] * 26 for _ in range(20)]
    marker[1][2] = 7
    stored.players[0].heatmap = stored.players[0].heatmap.model_copy(update={"counts": marker})
    path.write_text(stored.model_dump_json(), encoding="utf-8")

    assert storage.get_game_heatmaps(game).players[0].heatmap.counts == marker


def test_get_game_heatmaps_ball_recomputed_for_legacy_map_file_without_ball_heatmap(game):
    path = config.GAMES_DIR / game / config.MAP_FILENAME
    stored = _stored_map(game)
    stored.ball_heatmap = None
    path.write_text(stored.model_dump_json(exclude={"ball_heatmap"}), encoding="utf-8")
    assert "ball_heatmap" not in path.read_text(encoding="utf-8")

    result = storage.get_game_heatmaps(game)

    assert result.ball.counts == stats.heatmap_from_points(stored.ball.x, stored.ball.y).counts
    assert _total(result.ball.counts) > 0


def test_get_game_heatmaps_legacy_map_file_recomputes_every_heatmap_without_dead_ball_samples(game):
    # A legacy file counts the dead-ball samples in its stored player heatmaps: they are rebuilt from the tracks.
    path = config.GAMES_DIR / game / config.MAP_FILENAME
    stored = _stored_map(game)
    n = len(stored.ball.t)
    still = stats.DEAD_BALL_MIN_SAMPLES
    stored.ball.x = [0.0] * still + [1000.0 + 100 * i for i in range(n - still)]
    stored.ball.y = [0.0] * n
    stored.ball.z = [93.0] * n
    for player in stored.players:  # legacy heatmap: every sample counted
        player.heatmap = stats.heatmap_from_points(player.track.x, player.track.y)
    path.write_text(stored.model_dump_json(exclude={"ball_heatmap"}), encoding="utf-8")

    result = storage.get_game_heatmaps(game)

    live = n - still
    assert _total(result.ball.counts) == live
    for got, player in zip(result.players, stored.players):
        assert _total(player.heatmap.counts) == len([v for v in player.track.x if v is not None])
        assert _total(got.heatmap.counts) == len([v for v in player.track.x[still:] if v is not None])
        assert _total(got.heatmap.counts) < _total(player.heatmap.counts)


def test_get_game_heatmaps_invalid_game_id(game):
    assert storage.get_game_heatmaps("../x") is None


def test_get_game_heatmaps_empty_game_id():
    assert storage.get_game_heatmaps("") is None


def test_get_game_heatmaps_unknown_game(games_dir):
    assert storage.get_game_heatmaps("Missing_Game_1") is None


def test_get_game_heatmaps_missing_map_file(game):
    (config.GAMES_DIR / game / config.MAP_FILENAME).unlink()

    assert storage.get_game_heatmaps(game) is None


def test_get_game_heatmaps_invalid_json(game):
    (config.GAMES_DIR / game / config.MAP_FILENAME).write_text("{not json", encoding="utf-8")

    assert storage.get_game_heatmaps(game) is None


def test_get_game_heatmaps_invalid_schema(game):
    (config.GAMES_DIR / game / config.MAP_FILENAME).write_text('{"replay_id": "abc"}', encoding="utf-8")

    assert storage.get_game_heatmaps(game) is None


def test_get_game_heatmaps_ball_without_positions_gives_zero_grid(game):
    path = config.GAMES_DIR / game / config.MAP_FILENAME
    stored = _stored_map(game)
    stored.ball.x = [None] * len(stored.ball.x)
    stored.ball_heatmap = None  # legacy file: the heatmap is recomputed from the (empty) track
    path.write_text(stored.model_dump_json(), encoding="utf-8")

    assert _total(storage.get_game_heatmaps(game).ball.counts) == 0


# ---------- storage.get_player_heatmap and the chat: same heatmaps as the page ----------


def _legacy_with_dead_ball(game):
    """Rewrite the game's map.json as an old file: no stored ball heatmap, player heatmaps counting every sample,
    and a ball that stays still for the first DEAD_BALL_MIN_SAMPLES samples (a kickoff)."""
    path = config.GAMES_DIR / game / config.MAP_FILENAME
    stored = _stored_map(game)
    n = len(stored.ball.t)
    still = stats.DEAD_BALL_MIN_SAMPLES
    stored.ball.x = [0.0] * still + [1000.0 + 100 * i for i in range(n - still)]
    stored.ball.y = [0.0] * n
    stored.ball.z = [93.0] * n
    for player in stored.players:
        player.heatmap = stats.heatmap_from_points(player.track.x, player.track.y)  # old: every sample counted
    path.write_text(stored.model_dump_json(exclude={"ball_heatmap"}), encoding="utf-8")
    return stored


def test_get_player_heatmap_is_the_page_heatmap(game):
    page = {p.name: p for p in storage.get_game_heatmaps(game).players}

    for name, expected in page.items():
        assert storage.get_player_heatmap(game, name) == expected


def test_get_player_heatmap_is_the_page_heatmap_for_a_legacy_file_too(game):
    # In an old file the stored player heatmap counts the dead-ball samples; the page recomputes it without them,
    # and the chat must show the very same one.
    stored = _legacy_with_dead_ball(game)
    page = {p.name: p for p in storage.get_game_heatmaps(game).players}

    for player in stored.players:
        chat = storage.get_player_heatmap(game, player.name)
        assert chat == page[player.name]
        assert _total(chat.heatmap.counts) < _total(player.heatmap.counts)  # not the stored, unfiltered one


def test_chat_show_heatmap_returns_the_page_heatmap(game):
    heatmaps = []

    coach.run_tool("show_heatmap", '{"player_name": "Alice"}', game, heatmaps)

    page = next(p for p in storage.get_game_heatmaps(game).players if p.name == "Alice")
    assert [(h.player, h.team, h.heatmap) for h in heatmaps] == [(page.name, page.team, page.heatmap)]


def test_chat_show_heatmap_returns_the_page_heatmap_for_a_legacy_file_too(game):
    stored = _legacy_with_dead_ball(game)
    alice = next(p for p in stored.players if p.name == "Alice")
    heatmaps = []

    coach.run_tool("show_heatmap", '{"player_name": "Alice"}', game, heatmaps)

    page = next(p for p in storage.get_game_heatmaps(game).players if p.name == "Alice")
    assert heatmaps[0].heatmap == page.heatmap
    assert _total(heatmaps[0].heatmap.counts) < _total(alice.heatmap.counts)  # the dead-ball samples are left out


def test_chat_show_heatmap_for_every_player_matches_the_page(game):
    page = {p.name: p for p in storage.get_game_heatmaps(game).players}

    for name in page:
        heatmaps = []
        coach.run_tool("show_heatmap", f'{{"player_name": "{name}"}}', game, heatmaps)
        assert heatmaps[0].heatmap == page[name].heatmap
        assert heatmaps[0].team == page[name].team


def test_chat_show_heatmap_unreadable_map_file_gives_the_error(game):
    (config.GAMES_DIR / game / config.MAP_FILENAME).write_text("{not json", encoding="utf-8")
    heatmaps = []

    result = json.loads(coach.run_tool("show_heatmap", '{"player_name": "Alice"}', game, heatmaps))

    assert "error" in result
    assert heatmaps == []

# ---------- GET /api/replays/{game_id}/heatmaps ----------


def test_heatmaps_route_returns_match_heatmaps(client, game):
    response = client.get(f"/api/replays/{game}/heatmaps")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"players", "ball"}
    assert [p["name"] for p in body["players"]] == ["Alice", "Bob"]
    assert all(set(p) == {"name", "team", "heatmap"} for p in body["players"])
    assert len(body["ball"]["counts"]) == 20
    assert len(body["ball"]["counts"][0]) == 26


def test_heatmaps_route_matches_storage(client, game):
    body = client.get(f"/api/replays/{game}/heatmaps").json()

    assert body == storage.get_game_heatmaps(game).model_dump()


def test_heatmaps_route_unknown_game_returns_404(client):
    response = client.get("/api/replays/Missing_Game_1/heatmaps")

    assert response.status_code == 404
    assert response.json() == {"detail": "Heatmap data not found"}


def test_heatmaps_route_invalid_game_id_returns_404(client):
    response = client.get("/api/replays/.hidden/heatmaps")

    assert response.status_code == 404
    assert response.json() == {"detail": "Heatmap data not found"}


def test_heatmaps_route_missing_map_file_returns_404(client, game):
    (config.GAMES_DIR / game / config.MAP_FILENAME).unlink()

    assert client.get(f"/api/replays/{game}/heatmaps").status_code == 404
