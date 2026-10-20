import json
import os
import subprocess
import tempfile

from app import config


class ReplayParseError(ValueError):
    pass


def parse_replay(content: bytes) -> dict:
    """Parse a .replay file content into a dict using the rrrocket binary."""
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".replay")
    tmp_path = tmp.name
    try:
        try:
            tmp.write(content)
        finally:
            tmp.close()

        try:
            result = subprocess.run(
                [str(config.RRROCKET_PATH), "-n", tmp_path],
                capture_output=True,
                timeout=config.RRROCKET_TIMEOUT_SECONDS,
            )
        except FileNotFoundError:
            raise RuntimeError("rrrocket binary not found")
        except subprocess.TimeoutExpired:
            raise ReplayParseError("Replay parsing timed out")

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace").strip()[:200]
            raise ReplayParseError(f"Replay parsing failed: {stderr}")

        try:
            return json.loads(result.stdout)
        except ValueError:
            raise ReplayParseError("Replay parsing returned invalid JSON")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
