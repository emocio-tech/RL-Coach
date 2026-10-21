from fastapi import APIRouter, HTTPException, UploadFile

from app.schemas.replay import GameReport, MatchTracks, ReplaySummary, UploadResult
from app.services import storage

router = APIRouter()


@router.post("", response_model=UploadResult, status_code=201)
async def upload_replay(file: UploadFile):
    try:
        return await storage.save_replay(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=list[ReplaySummary])
def list_replays():
    return storage.list_games()


@router.get("/{game_id}/tracks", response_model=MatchTracks)
def get_game_tracks(game_id: str):
    tracks = storage.get_game_tracks(game_id)
    if tracks is None:
        raise HTTPException(status_code=404, detail="Tracking data not found")
    return tracks


@router.get("/{game_id}/stats", response_model=GameReport)
def get_game_stats(game_id: str):
    report = storage.get_game_report(game_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Replay not found")
    return report
