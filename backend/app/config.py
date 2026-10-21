import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")
GAMES_DIR = ROOT_DIR / "data" / "games"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ALLOWED_EXTENSION = ".replay"
STATS_FILENAME = "stats.json"
MAP_FILENAME = "map.json"
FRAME_SAMPLE_HZ = 5
RRROCKET_PATH = Path(
    os.environ.get("RRROCKET_PATH", ROOT_DIR / "backend" / "bin" / "rrrocket.exe")
)
RRROCKET_TIMEOUT_SECONDS = 60
CORS_ORIGINS = ["http://localhost:5173"]
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL") or None
LLM_MODEL = os.environ.get("LLM_MODEL") or "nova-lite"
LLM_TIMEOUT_SECONDS = 30
LLM_MAX_TOOL_ITERATIONS = 5
CHAT_MAX_MESSAGES = 20
CHAT_MAX_MESSAGE_CHARS = 2000
