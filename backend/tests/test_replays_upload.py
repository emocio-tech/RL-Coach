import asyncio
import io
import json
import os
from pathlib import Path

import pytest
from fastapi import UploadFile

from app import config
from app.services import parser, stats, storage
from app.services.parser import ReplayParseError
from tests.conftest import FOLDER_NAME, REPLAY_ID


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


def _read(games_dir, folder, filename):
    return json.loads((games_dir / folder / filename).read_text(encoding="utf-8"))


def _stats_of(games_dir, folder):
    return _read(games_dir, folder, config.STATS_FILENAME)


def test_upload_replay_nominal_returns_201_and_writes_stats_and_map(client, games_dir, mock_parse):
    response = _post(client)
    assert response.status_code == 201
    replay_id = response.json()["id"]
    assert replay_id == FOLDER_NAME
    assert [f.name for f in _files(games_dir)] == [replay_id]
    assert sorted(f.name for f in (games_dir / replay_id).iterdir()) == ["map.json", "stats.json"]
    stats_data = _stats_of(games_dir, replay_id)
    assert stats_data["replay_id"] == REPLAY_ID
    assert stats_data["original_filename"] == "game.replay"
    assert len(stats_data["players"]) == 2
    map_data = _read(games_dir, replay_id, config.MAP_FILENAME)
    assert map_data["replay_id"] == REPLAY_ID
    assert len(map_data["players"]) == 2
    assert len(map_data["ball"]["t"]) > 0
    assert mock_parse == [b"REPLAYDATA"]


def test_upload_replay_nominal_stats_json_has_no_tracking_data(client, games_dir, mock_parse):
    replay_id = _post(client).json()["id"]
    text = (games_dir / replay_id / "stats.json").read_text(encoding="utf-8")
    for key in ("track", "heatmap", "ball"):
        assert f'"{key}"' not in text
    player = json.loads(text)["players"][0]
    assert {"demolitions", "boost"} <= set(player)


def test_upload_replay_nominal_events_reach_stats_json(client, games_dir, monkeypatch, fake_raw_with_events):
    monkeypatch.setattr(storage.parser, "parse_replay", lambda c: fake_raw_with_events)
    replay_id = _post(client).json()["id"]
    bob = next(p for p in _stats_of(games_dir, replay_id)["players"] if p["name"] == "Bob")
    assert bob["demolitions"] == {"inflicted": 0, "received": 1}
    assert (bob["boost"]["small_pads"], bob["boost"]["big_pads"]) == (1, 2)


def test_upload_replay_nominal_keeps_no_replay_file(client, games_dir, mock_parse, tmp_path):
    _post(client)
    assert not list(games_dir.rglob("*.replay"))
    assert not list(games_dir.glob(".tmp-*"))
    assert not list(games_dir.glob("*.json"))


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
    assert len(_files(games_dir)) == 1
    assert _stats_of(games_dir, response.json()["id"])["original_filename"] == "x.replay"
    assert not (tmp_path.parent / "x.replay").exists()
    assert not (tmp_path / "x.replay").exists()


def test_save_replay_control_characters_removed_from_filename(games_dir, mock_parse):
    # Called directly: the HTTP test client percent-encodes control characters itself.
    upload = UploadFile(file=io.BytesIO(b"REPLAYDATA"), filename="a\x01b\x7fc\x00.replay")
    result = asyncio.run(storage.save_replay(upload))
    assert _stats_of(games_dir, result.id)["original_filename"] == "abc.replay"


def test_upload_replay_long_filename_truncated_to_255(client, games_dir, mock_parse):
    response = _post(client, name="a" * 400 + ".replay")
    assert response.status_code == 201
    assert len(_stats_of(games_dir, response.json()["id"])["original_filename"]) == 255


def test_upload_replay_missing_binary_returns_500(client, games_dir, monkeypatch):
    def missing(content):
        raise RuntimeError("rrrocket binary not found")

    monkeypatch.setattr(storage.parser, "parse_replay", missing)
    assert _post(client).status_code == 500
    assert _files(games_dir) == []


def test_upload_replay_same_replay_twice_gets_suffixed_folder_and_distinct_ids(client, games_dir, mock_parse):
    a = _post(client).json()["id"]
    b = _post(client).json()["id"]
    c = _post(client).json()["id"]
    assert (a, b, c) == (FOLDER_NAME, f"{FOLDER_NAME}_2", f"{FOLDER_NAME}_3")
    assert sorted(f.name for f in _files(games_dir)) == sorted([a, b, c])
    for folder in (a, b, c):
        assert (games_dir / folder / "stats.json").is_file()
        assert (games_dir / folder / "map.json").is_file()


def test_upload_replay_missing_id_generates_unique_name(client, games_dir, monkeypatch, fake_raw):
    del fake_raw["properties"]["Id"]
    monkeypatch.setattr(storage.parser, "parse_replay", lambda c: fake_raw)
    a = _post(client).json()["id"]
    b = _post(client).json()["id"]
    prefix = "Stadium_P_Online-1v1_"
    assert a.startswith(prefix) and b.startswith(prefix)
    assert len(a) - len(prefix) == 32 and int(a[len(prefix):], 16) >= 0
    assert a != b
    assert _stats_of(games_dir, a)["replay_id"] == a[len(prefix):]


def test_upload_replay_write_failure_returns_500_and_leaves_nothing(client, games_dir, mock_parse, monkeypatch):
    real_write = Path.write_text

    def failing(self, *args, **kwargs):
        if self.name == config.MAP_FILENAME:
            raise OSError("disk full")
        return real_write(self, *args, **kwargs)

    monkeypatch.setattr(Path, "write_text", failing)
    assert _post(client).status_code == 500
    assert _files(games_dir) == []


def test_write_match_folder_rename_failure_removes_temp_folder(games_dir, fake_raw, monkeypatch):
    stats_file, map_file = stats.build_match_files("abc", "g.replay", fake_raw)

    def failing(self, target):
        raise PermissionError("locked")

    monkeypatch.setattr(Path, "rename", failing)
    with pytest.raises(PermissionError):
        storage._write_match_folder("Match", stats_file, map_file)
    assert _files(games_dir) == []


def test_upload_replay_map_name_with_forbidden_chars_is_sanitized(client, games_dir, monkeypatch, fake_raw):
    fake_raw["properties"]["MapName"] = '../../a:b*c?"<>|\\ d'
    monkeypatch.setattr(storage.parser, "parse_replay", lambda c: fake_raw)
    response = _post(client)
    assert response.status_code == 201
    folder = response.json()["id"]
    assert all(c.isalnum() or c in "._-" for c in folder)
    assert [f.name for f in _files(games_dir)] == [folder]
    assert not (games_dir.parent / "a").exists()


def test_upload_replay_very_long_map_name_is_truncated(client, games_dir, monkeypatch, fake_raw):
    fake_raw["properties"]["MapName"] = "m" * 500
    monkeypatch.setattr(storage.parser, "parse_replay", lambda c: fake_raw)
    response = _post(client)
    assert response.status_code == 201
    assert response.json()["id"] == "m" * 64 + f"_Online-1v1_{REPLAY_ID}"


def test_upload_replay_stats_json_keeps_original_map_name(client, games_dir, monkeypatch, fake_raw):
    fake_raw["properties"]["MapName"] = "Weird/Map"
    monkeypatch.setattr(storage.parser, "parse_replay", lambda c: fake_raw)
    folder = _post(client).json()["id"]
    assert _stats_of(games_dir, folder)["match"]["map_name"] == "Weird/Map"
    assert folder.startswith("Weird_Map_")


@pytest.mark.parametrize(
    "props, expected",
    [
        ({"MapName": "Stadium_P", "MatchType": "Online", "TeamSize": 3}, "Stadium_P_Online-3v3_X1"),
        ({"MatchType": "Online", "TeamSize": 2}, "UnknownMap_Online-2v2_X1"),
        ({"MapName": "Stadium_P", "TeamSize": 2}, "Stadium_P_Unknown-2v2_X1"),
        ({"MapName": "Stadium_P", "MatchType": "Online"}, "Stadium_P_Online_X1"),
        ({"MapName": "Stadium_P", "MatchType": "Online", "TeamSize": "3"}, "Stadium_P_Online_X1"),
        ({"MapName": "Stadium_P", "MatchType": "Online", "TeamSize": True}, "Stadium_P_Online_X1"),
        ({"MapName": "..", "MatchType": ""}, "UnknownMap_Unknown_X1"),
        ({"MapName": "Café", "MatchType": "Online"}, "Caf__Online_X1"),
    ],
)
def test_folder_name_property_variants(props, expected):
    assert storage._folder_name(props, "X1") == expected


def test_sanitize_strips_path_separators_and_edge_dots():
    result = storage._sanitize("../../etc/passwd", "fb")
    assert "/" not in result and "\\" not in result
    assert not result.startswith(".")


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
    folder = response.json()["id"]
    assert [f.name for f in _files(games_dir)] == [folder]
    assert not list(games_dir.glob(".tmp-*"))
    parsed = parser.parse_replay(content)["properties"]
    expected = len(parsed["PlayerStats"])
    assert expected > 0
    if parsed.get("Id"):
        assert folder.endswith(storage._sanitize(parsed["Id"], "replay"))
    stats_data = _stats_of(games_dir, folder)
    assert len(stats_data["players"]) == expected
    assert all({"demolitions", "boost"} <= set(p) for p in stats_data["players"])
    data = _read(games_dir, folder, config.MAP_FILENAME)
    assert len(data["players"]) == expected
    n = len(data["ball"]["t"])
    assert n > 0
    assert len(data["ball"]["x"]) == len(data["ball"]["y"]) == len(data["ball"]["z"]) == n
    for p in data["players"]:
        tr = p["track"]
        assert all(len(tr[k]) == n for k in ("t", "x", "y", "z", "speed", "boost"))
        assert len(p["heatmap"]["counts"]) == 20
