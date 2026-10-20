import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
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
