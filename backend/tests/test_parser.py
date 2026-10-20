import json
import os
import subprocess
from types import SimpleNamespace

import pytest

from app import config
from app.services import parser
from app.services.parser import ReplayParseError


@pytest.fixture
def run_spy(monkeypatch):
    """Patch subprocess.run; returns a dict recording the temp path used and lets tests set behaviour."""
    state = {"path": None, "existed": None, "result": None, "raises": None, "args": None, "kwargs": None}

    def fake_run(args, **kwargs):
        state["args"], state["kwargs"] = args, kwargs
        state["path"] = args[-1]
        state["existed"] = os.path.exists(args[-1])
        if state["raises"]:
            raise state["raises"]
        return state["result"]

    monkeypatch.setattr(parser.subprocess, "run", fake_run)
    return state


def _ok(payload):
    return SimpleNamespace(returncode=0, stdout=json.dumps(payload).encode(), stderr=b"")


def test_parse_replay_nominal_returns_parsed_json(run_spy):
    run_spy["result"] = _ok({"a": 1})
    assert parser.parse_replay(b"data") == {"a": 1}
    assert run_spy["existed"] is True
    assert run_spy["args"][0] == str(config.RRROCKET_PATH)
    assert run_spy["kwargs"]["timeout"] == config.RRROCKET_TIMEOUT_SECONDS


def test_parse_replay_nominal_removes_temp_file(run_spy):
    run_spy["result"] = _ok({})
    parser.parse_replay(b"data")
    assert not os.path.exists(run_spy["path"])


def test_parse_replay_nonzero_exit_raises_parse_error_with_truncated_message(run_spy):
    run_spy["result"] = SimpleNamespace(returncode=1, stdout=b"", stderr=b"x" * 500)
    with pytest.raises(ReplayParseError) as exc:
        parser.parse_replay(b"data")
    assert str(exc.value) == "Replay parsing failed: " + "x" * 200
    assert not os.path.exists(run_spy["path"])


def test_parse_replay_nonzero_exit_invalid_utf8_stderr(run_spy):
    run_spy["result"] = SimpleNamespace(returncode=2, stdout=b"", stderr=b"\xff\xfe bad")
    with pytest.raises(ReplayParseError):
        parser.parse_replay(b"data")


def test_parse_replay_timeout_raises_parse_error(run_spy):
    run_spy["raises"] = subprocess.TimeoutExpired(cmd="rrrocket", timeout=60)
    with pytest.raises(ReplayParseError):
        parser.parse_replay(b"data")
    assert not os.path.exists(run_spy["path"])


def test_parse_replay_invalid_json_raises_parse_error(run_spy):
    run_spy["result"] = SimpleNamespace(returncode=0, stdout=b"not json", stderr=b"")
    with pytest.raises(ReplayParseError):
        parser.parse_replay(b"data")
    assert not os.path.exists(run_spy["path"])


def test_parse_replay_missing_binary_raises_runtime_error(run_spy):
    run_spy["raises"] = FileNotFoundError()
    with pytest.raises(RuntimeError) as exc:
        parser.parse_replay(b"data")
    assert not isinstance(exc.value, ReplayParseError)
    assert not os.path.exists(run_spy["path"])


def test_parse_replay_parse_error_is_value_error():
    assert issubclass(ReplayParseError, ValueError)
