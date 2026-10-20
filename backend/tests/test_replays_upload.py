import asyncio
import io
import json
import os
from pathlib import Path

import pytest
from fastapi import UploadFile

from app import config
from app.services import parser, storage
from app.services.parser import ReplayParseError


@pytest.fixture
def mock_parse(monkeypatch, fake_raw):
    calls = []

    def fake_parse(content):
        calls.append(content)
        return fake_raw

    monkeypatch.setattr(storage.parser, "parse_replay", fake_parse)
    return calls


def _post(client, name="game.replay", content=b"REPLAYDATA"):
    return client.post("/api/replays", files={"file": (name, content, "application/octet-stream")})


def _files(games_dir):
    return list(games_dir.iterdir()) if games_dir.exists() else []


def test_upload_replay_nominal_returns_201_and_writes_single_json(client, games_dir, mock_parse):
    response = _post(client)
    assert response.status_code == 201
    replay_id = response.json()["id"]
    files = _files(games_dir)
    assert [f.name for f in files] == [f"{replay_id}.json"]
    data = json.loads(files[0].read_text(encoding="utf-8"))
    assert data["id"] == replay_id
    assert data["original_filename"] == "game.replay"
    assert len(data["players"]) == 2
    assert mock_parse == [b"REPLAYDATA"]


def test_upload_replay_nominal_keeps_no_replay_file(client, games_dir, mock_parse, tmp_path):
    _post(client)
    assert not list(games_dir.glob("*.replay"))
    assert not list(games_dir.glob("*.tmp"))


def test_upload_replay_uppercase_extension_accepted(client, games_dir, mock_parse):
    assert _post(client, name="GAME.REPLAY").status_code == 201


def test_upload_replay_wrong_extension_returns_400(client, games_dir, mock_parse):
    response = _post(client, name="game.txt")
    assert response.status_code == 400
    assert _files(games_dir) == []
    assert mock_parse == []


def test_upload_replay_too_large_returns_400_and_writes_nothing(client, games_dir, mock_parse, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 10)
    response = _post(client, content=b"x" * 11)
    assert response.status_code == 400
    assert _files(games_dir) == []
    assert mock_parse == []


def test_upload_replay_exactly_max_size_accepted(client, games_dir, mock_parse, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 10)
    assert _post(client, content=b"x" * 10).status_code == 201


def test_upload_replay_empty_file_returns_400(client, games_dir, mock_parse):
    response = _post(client, content=b"")
    assert response.status_code == 400
    assert _files(games_dir) == []
    assert mock_parse == []


def test_upload_replay_missing_file_field_returns_422(client, games_dir, mock_parse):
    assert client.post("/api/replays").status_code == 422


def test_upload_replay_parse_error_returns_400_and_writes_nothing(client, games_dir, monkeypatch):
    def boom(content):
        raise ReplayParseError("bad replay")

    monkeypatch.setattr(storage.parser, "parse_replay", boom)
    response = _post(client)
    assert response.status_code == 400
    assert "bad replay" in response.json()["detail"]
    assert _files(games_dir) == []


def test_upload_replay_unusable_data_returns_400(client, games_dir, monkeypatch, fake_raw):
    fake_raw["network_frames"] = {"frames": []}
    monkeypatch.setattr(storage.parser, "parse_replay", lambda c: fake_raw)
    assert _post(client).status_code == 400
    assert _files(games_dir) == []


def test_upload_replay_path_traversal_filename_is_sanitized(client, games_dir, mock_parse, tmp_path):
    response = _post(client, name="../../x.replay")
    assert response.status_code == 201
    files = _files(games_dir)
    assert len(files) == 1
    assert json.loads(files[0].read_text(encoding="utf-8"))["original_filename"] == "x.replay"
    assert not (tmp_path.parent / "x.replay").exists()
    assert not (tmp_path / "x.replay").exists()


def test_save_replay_control_characters_removed_from_filename(games_dir, mock_parse):
    # Called directly: the HTTP test client percent-encodes control characters itself.
    upload = UploadFile(file=io.BytesIO(b"REPLAYDATA"), filename="a\x01b\x7fc\x00.replay")
    result = asyncio.run(storage.save_replay(upload))
    data = json.loads((games_dir / f"{result.id}.json").read_text(encoding="utf-8"))
    assert data["original_filename"] == "abc.replay"


def test_upload_replay_long_filename_truncated_to_255(client, games_dir, mock_parse):
    response = _post(client, name="a" * 400 + ".replay")
    assert response.status_code == 201
    data = json.loads(_files(games_dir)[0].read_text(encoding="utf-8"))
    assert len(data["original_filename"]) == 255


def test_upload_replay_missing_binary_returns_500(client, games_dir, monkeypatch):
    def missing(content):
        raise RuntimeError("rrrocket binary not found")

    monkeypatch.setattr(storage.parser, "parse_replay", missing)
    assert _post(client).status_code == 500
    assert _files(games_dir) == []


def test_upload_replay_two_uploads_get_distinct_ids(client, games_dir, mock_parse):
    a = _post(client).json()["id"]
    b = _post(client).json()["id"]
    assert a != b
    assert len(_files(games_dir)) == 2


@pytest.mark.parametrize("method", ["get", "delete", "put"])
def test_replays_collection_other_methods_not_available(client, method):
    assert getattr(client, method)("/api/replays").status_code in (404, 405)


def test_replays_get_by_id_not_found(client):
    assert client.get("/api/replays/abc").status_code in (404, 405)


SAMPLE = os.environ.get("RL_SAMPLE_REPLAY")


@pytest.mark.skipif(
    not SAMPLE or not config.RRROCKET_PATH.exists() or not Path(SAMPLE or "").exists(),
    reason="RL_SAMPLE_REPLAY not set or rrrocket binary/sample missing",
)
def test_upload_replay_real_replay_integration(client, games_dir):
    content = Path(SAMPLE).read_bytes()
    response = _post(client, name=Path(SAMPLE).name, content=content)
    assert response.status_code == 201
    files = _files(games_dir)
    assert len(files) == 1
    data = json.loads(files[0].read_text(encoding="utf-8"))
    expected = len(parser.parse_replay(content)["properties"]["PlayerStats"])
    assert expected > 0
    assert len(data["players"]) == expected
    n = len(data["ball"]["t"])
    assert n > 0
    assert len(data["ball"]["x"]) == len(data["ball"]["y"]) == len(data["ball"]["z"]) == n
    for p in data["players"]:
        tr = p["track"]
        assert all(len(tr[k]) == n for k in ("t", "x", "y", "z", "speed", "boost"))
        assert len(p["heatmap"]["counts"]) == 20
