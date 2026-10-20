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


class StatsFile(BaseModel):
    replay_id: str
    original_filename: str
    match: MatchStats
    players: list[PlayerFullStats]


class PlayerMap(BaseModel):
    name: str
    team: int
    heatmap: Heatmap
    track: PlayerTrack


class MapFile(BaseModel):
    replay_id: str
    players: list[PlayerMap]
    ball: BallTrack
