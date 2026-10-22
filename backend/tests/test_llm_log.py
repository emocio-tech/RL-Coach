from types import SimpleNamespace

import pytest

from app import config
from app.schemas.chat import ChatMessage
from app.services import coach, llm_log
from tests.test_coach import GAME_ID, _response, _tool_call, game, llm  # noqa: F401


@pytest.fixture(autouse=True)
def reset_session_totals():
    for name in llm_log._session_totals:
        llm_log._session_totals[name] = 0


def _read_log(logs_dir):
    files = list(logs_dir.glob("llm-*.txt"))
    assert len(files) == 1
    return files[0].read_text(encoding="utf-8")


def _with_usage(response, prompt=120, completion=30):
    response.usage = SimpleNamespace(prompt_tokens=prompt, completion_tokens=completion, total_tokens=prompt + completion)
    return response


def test_log_call_writes_tokens_and_categories(llm, logs_dir):
    llm([_with_usage(_response(content="Bonjour !"))])

    coach.chat([ChatMessage(role="user", content="Salut")], None, None)

    log = _read_log(logs_dir)
    assert "prompt=120 completion=30 total=150" in log
    assert "utilisateur=5" in log
    assert "Outils proposés" not in log
    assert "Réponse : texte (9 caractères)" in log


def test_log_never_contains_the_user_message(llm, game, logs_dir):
    llm([
        _response(tool_calls=[_tool_call("c1", "get_match_summary")]),
        _response(content="Voilà."),
    ])

    coach.chat([ChatMessage(role="user", content="Message très personnel")], game, "Alice")

    assert "très personnel" not in _read_log(logs_dir)


def test_log_call_accumulates_session_total(llm, game, logs_dir):
    llm([
        _with_usage(_response(tool_calls=[_tool_call("c1", "get_match_summary")]), prompt=100, completion=10),
        _with_usage(_response(content="Voilà."), prompt=200, completion=20),
    ])

    coach.chat([ChatMessage(role="user", content="Résume")], game, "Alice")

    log = _read_log(logs_dir)
    assert "total_session : prompt=100 completion=10 total=110 (1 appels)" in log
    assert "total_session : prompt=300 completion=30 total=330 (2 appels)" in log


def test_log_request_end_writes_message_total(llm, game, logs_dir):
    llm([
        _with_usage(_response(tool_calls=[_tool_call("c1", "get_match_summary")]), prompt=100, completion=10),
        _with_usage(_response(content="Voilà."), prompt=200, completion=20),
    ])

    coach.chat([ChatMessage(role="user", content="Résume")], game, "Alice")
    coach.chat([ChatMessage(role="user", content="Encore")], game, "Alice")

    summaries = [line for line in _read_log(logs_dir).splitlines() if line.startswith("total_message")]
    # The fake client replays its last response: the second message needs a single LLM call.
    assert summaries == [
        "total_message : prompt=300 completion=30 total=330 (2 appels)",
        "total_message : prompt=200 completion=20 total=220 (1 appels)",
    ]
    assert "total_session : prompt=500 completion=50 total=550 (3 appels)" in _read_log(logs_dir)


def test_log_request_end_written_even_when_the_chat_fails(llm, logs_dir):
    llm([_with_usage(_response(content=None))])

    with pytest.raises(coach.CoachError):
        coach.chat([ChatMessage(role="user", content="Salut")], None, None)

    assert "total_message : prompt=120 completion=30 total=150 (1 appels)" in _read_log(logs_dir)


def test_log_call_lists_tools_and_files_used(llm, game, logs_dir):
    llm([
        _with_usage(_response(tool_calls=[_tool_call("c1", "get_match_summary")])),
        _with_usage(_response(content="Voilà.")),
    ])

    coach.chat([ChatMessage(role="user", content="Résume")], game, "Alice")

    log = _read_log(logs_dir)
    assert log.count("=== ") == 2
    assert "outil get_match_summary({})" in log
    assert f"data/games/{GAME_ID}/stats.json, data/games/{GAME_ID}/3dmatch.json" in log
    assert "résultats_outils=0" in log.split("=== ")[1]
    assert "résultats_outils=0" not in log.split("=== ")[2]


def test_log_call_tool_without_files(llm, game, logs_dir):
    llm([
        _response(tool_calls=[_tool_call("c1", "suggest_training", '{"focus_areas": ["boost"]}')]),
        _response(content="ok"),
    ])

    coach.chat([ChatMessage(role="user", content="Entraînement")], game, "Alice")

    log = _read_log(logs_dir)
    assert "outil suggest_training" in log
    assert "fichiers lus : aucun" in log
    assert "Tokens API : non fournis" in log


def test_log_call_failure_never_breaks_the_chat(llm, tmp_path, monkeypatch):
    llm([_response(content="Bonjour !")])
    not_a_dir = tmp_path / "not-a-dir"
    not_a_dir.write_text("", encoding="utf-8")
    monkeypatch.setattr(config, "LOGS_DIR", not_a_dir / "logs")  # mkdir fails: the parent is a file

    reply = coach.chat([ChatMessage(role="user", content="Salut")], None, None)

    assert reply.reply == "Bonjour !"
    assert not (not_a_dir / "logs").exists()


def test_game_files_ignores_missing_map(games_dir):
    folder = games_dir / "g"
    folder.mkdir(parents=True)
    (folder / config.STATS_FILENAME).write_text("{}", encoding="utf-8")

    assert llm_log.game_files("get_player_stats", "g") == ["data/games/g/stats.json"]
