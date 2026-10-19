from pydantic import BaseModel


class ReplayInfo(BaseModel):
    id: str
    filename: str
    size_bytes: int


class PlayerStats(BaseModel):
    name: str
    team: int
    score: int = 0
    goals: int = 0
    assists: int = 0
    saves: int = 0
    shots: int = 0


class ReplayStats(BaseModel):
    replay_id: str
    players: list[PlayerStats] = []
