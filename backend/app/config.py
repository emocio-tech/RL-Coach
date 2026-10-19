from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
REPLAYS_DIR = ROOT_DIR / "data" / "replays"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ALLOWED_EXTENSION = ".replay"
CORS_ORIGINS = ["http://localhost:5173"]
