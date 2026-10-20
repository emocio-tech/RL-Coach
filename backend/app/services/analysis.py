import math

from app import config
from app.schemas.replay import (
    BallTrack,
    GameReport,
    MapFile,
    PlayerDetail,
    PlayerMap,
    PlayerReport,
    StatsFile,
)

SUPERSONIC_SPEED = 2200.0
SLOW_SPEED = 1000.0
FIELD_HALF_LENGTH = 5120.0
ZONE_LIMIT = FIELD_HALF_LENGTH / 3
SAMPLE_SECONDS = 1 / config.FRAME_SAMPLE_HZ


def build_report(game_id: str, stats_file: StatsFile, map_file: MapFile | None) -> GameReport:
    """Merge the match stats with positioning stats computed from the tracks."""
    maps = {p.name: p for p in map_file.players} if map_file else {}
    details = _positioning(map_file) if map_file else {}
    return GameReport(
        id=game_id,
        original_filename=stats_file.original_filename,
        match=stats_file.match,
        players=[
            PlayerReport(
                stats=p,
                detail=details.get(p.name, PlayerDetail()) if p.name in maps else PlayerDetail(),
            )
            for p in stats_file.players
        ],
        ball_y=list(map_file.ball.y) if map_file else [],
        sample_seconds=SAMPLE_SECONDS if map_file else None,
        events=list(stats_file.events),
        timeline_seconds=map_file.timeline_seconds if map_file else None,
    )


def _pct(count: int, total: int) -> float | None:
    return round(count / total * 100, 1) if total else None


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def _positioning(map_file: MapFile) -> dict[str, PlayerDetail]:
    players = map_file.players
    ball = map_file.ball
    n_samples = len(ball.t)

    def position(player: PlayerMap, k: int):
        track = player.track
        if k >= len(track.x) or track.x[k] is None or track.y[k] is None:
            return None
        return track.x[k], track.y[k], track.z[k] or 0.0

    def ball_position(b: BallTrack, k: int):
        if b.x[k] is None or b.y[k] is None:
            return None
        return b.x[k], b.y[k], b.z[k] or 0.0

    ball_distance = [[None] * n_samples for _ in players]
    behind = [[None] * n_samples for _ in players]
    rank = [[None] * n_samples for _ in players]

    for k in range(n_samples):
        target = ball_position(ball, k)
        if target is None:
            continue
        for team in {p.team for p in players}:
            members = []
            for i, player in enumerate(players):
                if player.team != team:
                    continue
                pos = position(player, k)
                if pos is None:
                    continue
                dist = math.dist(pos, target)
                ball_distance[i][k] = dist
                # Team 0 defends the negative y side, team 1 the positive one.
                behind[i][k] = pos[1] < target[1] if team == 0 else pos[1] > target[1]
                members.append((dist, i))
            for place, (_, i) in enumerate(sorted(members)):
                rank[i][k] = place

    details = {}
    for i, player in enumerate(players):
        track = player.track
        idx = [k for k in range(n_samples) if position(player, k) is not None]
        speeds = [track.speed[k] for k in idx if track.speed[k] is not None]
        boosts = [track.boost[k] for k in idx if track.boost[k] is not None]

        zones = {"def": 0, "mid": 0, "off": 0}
        for k in idx:
            y = track.y[k] if player.team == 0 else -track.y[k]
            zones["def" if y < -ZONE_LIMIT else "off" if y > ZONE_LIMIT else "mid"] += 1

        ranks = [r for r in rank[i] if r is not None]
        behind_flags = [b for b in behind[i] if b is not None]
        distances = [d for d in ball_distance[i] if d is not None]

        details[player.name] = PlayerDetail(
            tracked_time_s=round(len(idx) * SAMPLE_SECONDS, 1),
            avg_speed=_avg(speeds),
            supersonic_pct=_pct(sum(s >= SUPERSONIC_SPEED for s in speeds), len(speeds)),
            slow_pct=_pct(sum(s < SLOW_SPEED for s in speeds), len(speeds)),
            zero_boost_pct=_pct(sum(b == 0 for b in boosts), len(boosts)),
            defensive_zone_pct=_pct(zones["def"], len(idx)),
            mid_zone_pct=_pct(zones["mid"], len(idx)),
            offensive_zone_pct=_pct(zones["off"], len(idx)),
            behind_ball_pct=_pct(sum(behind_flags), len(behind_flags)),
            avg_ball_distance=_avg(distances),
            first_man_pct=_pct(ranks.count(0), len(ranks)),
            second_man_pct=_pct(ranks.count(1), len(ranks)),
            third_man_pct=_pct(ranks.count(2), len(ranks)),
        )
    return details
