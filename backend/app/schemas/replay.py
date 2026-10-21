from typing import Literal

from pydantic import BaseModel


class UploadResult(BaseModel):
    id: str


class MatchStats(BaseModel):
    match_type: str | None = None
    team_size: int | None = None
    team0_score: int | None = None
    team1_score: int | None = None
    duration_seconds: float | None = None
    map_name: str | None = None
    date: str | None = None


class PlayerStats(BaseModel):
    name: str
    team: int
    score: int = 0
    goals: int = 0
    assists: int = 0
    saves: int = 0
    shots: int = 0


class PlayerTrack(BaseModel):
    t: list[float]
    x: list[float | None]
    y: list[float | None]
    z: list[float | None]
    speed: list[float | None]
    boost: list[int | None]
    qx: list[float | None]
    qy: list[float | None]
    qz: list[float | None]
    qw: list[float | None]


class Heatmap(BaseModel):
    x_min: float = -4096.0
    x_max: float = 4096.0
    y_min: float = -5120.0
    y_max: float = 5120.0
    counts: list[list[int]]


class BallTrack(BaseModel):
    t: list[float]
    x: list[float | None]
    y: list[float | None]
    z: list[float | None]


class Demolitions(BaseModel):
    inflicted: int = 0
    received: int = 0


class BoostStats(BaseModel):
    small_pads: int = 0
    big_pads: int = 0
    consumed_per_minute: float | None = None
    average_level: float | None = None


class PlayerFullStats(PlayerStats):
    demolitions: Demolitions
    boost: BoostStats


class MatchEvent(BaseModel):
    seconds: float  # elapsed since the start of the replay (not "t": stats.json must hold no tracking keys)
    type: Literal["goal", "assist", "shot", "save", "demolition"]
    player: str
    team: int
    victim: str | None = None


class StatsFile(BaseModel):
    replay_id: str
    original_filename: str
    match: MatchStats
    players: list[PlayerFullStats]
    events: list[MatchEvent] = []


class PlayerMap(BaseModel):
    name: str
    team: int
    heatmap: Heatmap
    track: PlayerTrack


class MapFile(BaseModel):
    replay_id: str
    players: list[PlayerMap]
    ball: BallTrack


class PlayerDetail(BaseModel):
    tracked_time_s: float = 0.0
    avg_speed: float | None = None
    supersonic_pct: float | None = None
    slow_pct: float | None = None
    zero_boost_pct: float | None = None
    defensive_zone_pct: float | None = None
    mid_zone_pct: float | None = None
    offensive_zone_pct: float | None = None
    behind_ball_pct: float | None = None
    avg_ball_distance: float | None = None
    first_man_pct: float | None = None
    second_man_pct: float | None = None
    third_man_pct: float | None = None


class PlayerReport(BaseModel):
    stats: PlayerFullStats
    detail: PlayerDetail


class GameReport(BaseModel):
    id: str
    original_filename: str
    match: MatchStats
    players: list[PlayerReport]
    ball_y: list[float | None] = []
    sample_seconds: float | None = None
    events: list[MatchEvent] = []
