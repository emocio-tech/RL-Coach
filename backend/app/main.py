from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.api.routes import chat, replays


@asynccontextmanager
async def lifespan(_: FastAPI):
    config.GAMES_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="RL-Coach", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(replays.router, prefix="/api/replays", tags=["replays"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
