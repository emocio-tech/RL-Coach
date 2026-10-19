import uuid
from pathlib import Path

from fastapi import UploadFile

from app import config
from app.schemas.replay import ReplayInfo


async def save_replay(file: UploadFile) -> ReplayInfo:
    original_name = file.filename or ""
    if not original_name.lower().endswith(config.ALLOWED_EXTENSION):
        raise ValueError("Only .replay files are accepted")

    content = await file.read()
    if len(content) > config.MAX_UPLOAD_BYTES:
        raise ValueError("File too large")

    config.REPLAYS_DIR.mkdir(parents=True, exist_ok=True)
    replay_id = uuid.uuid4().hex
    (config.REPLAYS_DIR / f"{replay_id}{config.ALLOWED_EXTENSION}").write_bytes(content)
    return ReplayInfo(id=replay_id, filename=original_name, size_bytes=len(content))


def list_replays() -> list[ReplayInfo]:
    if not config.REPLAYS_DIR.exists():
        return []
    return [
        ReplayInfo(id=p.stem, filename=p.name, size_bytes=p.stat().st_size)
        for p in sorted(config.REPLAYS_DIR.glob(f"*{config.ALLOWED_EXTENSION}"))
    ]


def get_replay_path(replay_id: str) -> Path | None:
    if not replay_id.isalnum():
        return None
    path = config.REPLAYS_DIR / f"{replay_id}{config.ALLOWED_EXTENSION}"
    return path if path.is_file() else None
