from pathlib import Path

from app.schemas.replay import ReplayStats


def compute_stats(replay_id: str, path: Path) -> ReplayStats:
    """Compute statistics from a replay. Placeholder until the parser exists."""
    return ReplayStats(replay_id=replay_id, players=[])
