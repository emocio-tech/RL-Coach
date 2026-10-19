from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.api.routes import replays


@asynccontextmanager
async def lifespan(_: FastAPI):
    config.REPLAYS_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="RL-Coach", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(replays.router, prefix="/api/replays", tags=["replays"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
