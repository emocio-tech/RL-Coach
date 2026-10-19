from fastapi import APIRouter, HTTPException, UploadFile

from app.schemas.replay import ReplayInfo, ReplayStats
from app.services import stats, storage

router = APIRouter()


@router.post("", response_model=ReplayInfo, status_code=201)
async def upload_replay(file: UploadFile):
    try:
        return await storage.save_replay(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=list[ReplayInfo])
def list_replays():
    return storage.list_replays()


@router.get("/{replay_id}/stats", response_model=ReplayStats)
def get_replay_stats(replay_id: str):
    path = storage.get_replay_path(replay_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Replay not found")
    return stats.compute_stats(replay_id, path)
