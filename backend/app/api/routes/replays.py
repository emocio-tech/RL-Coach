from fastapi import APIRouter, HTTPException, UploadFile

from app.schemas.replay import UploadResult
from app.services import storage

router = APIRouter()


@router.post("", response_model=UploadResult, status_code=201)
async def upload_replay(file: UploadFile):
    try:
        return await storage.save_replay(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
