import os
import re
import uuid
from pathlib import Path

from fastapi import UploadFile
from starlette.concurrency import run_in_threadpool

from app import config
from app.schemas.replay import UploadResult
from app.services import parser, stats

CHUNK_SIZE = 1024 * 1024


async def save_replay(file: UploadFile) -> UploadResult:
    name = file.filename or ""
    if not name.lower().endswith(config.ALLOWED_EXTENSION):
        raise ValueError("Only .replay files are accepted")

    chunks = []
    total = 0
    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > config.MAX_UPLOAD_BYTES:
            raise ValueError("File too large")
        chunks.append(chunk)
    if total == 0:
        raise ValueError("Empty file")
    content = b"".join(chunks)

    raw = await run_in_threadpool(parser.parse_replay, content)

    replay_id = uuid.uuid4().hex
    original_filename = re.sub(r"[\x00-\x1f\x7f]", "", Path(name).name)[:255]

    data = await run_in_threadpool(
        stats.build_replay_data, replay_id, original_filename, raw
    )

    config.GAMES_DIR.mkdir(parents=True, exist_ok=True)
    final_path = config.GAMES_DIR / f"{replay_id}{config.STORED_EXTENSION}"
    tmp_path = config.GAMES_DIR / f"{replay_id}{config.STORED_EXTENSION}.tmp"
    try:
        tmp_path.write_text(data.model_dump_json(), encoding="utf-8")
        os.replace(tmp_path, final_path)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise

    return UploadResult(id=replay_id)
