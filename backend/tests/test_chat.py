import pytest

from app import config
from app.schemas.chat import ChatHeatmap, ChoicePrompt, ChoiceStep
from app.schemas.replay import Heatmap
from app.services import coach, stats

GAME_ID = "Stadium_P_Online-1v1_abc"
URL = "/api/chat"


@pytest.fixture
def game(games_dir, fake_raw):
    folder = games_dir / GAME_ID
    folder.mkdir(parents=True)
    stats_file, map_file, heatmap_file = stats.build_match_files("abc", "game.replay", fake_raw)
    (folder / config.STATS_FILENAME).write_text(stats_file.model_dump_json(), encoding="utf-8")
    (folder / config.MATCH3D_FILENAME).write_text(map_file.model_dump_json(), encoding="utf-8")
    (folder / config.HEATMAP_FILENAME).write_text(heatmap_file.model_dump_json(), encoding="utf-8")
    return GAME_ID


@pytest.fixture
def chat_calls(monkeypatch):
    """Mocks coach.chat; records its arguments and returns a fixed reply."""
    calls = []

    def fake_chat(messages, game_id, selected_player):
        calls.append({"messages": messages, "game_id": game_id, "selected_player": selected_player})
        return coach.CoachReply(reply="Réponse du coach")

    monkeypatch.setattr(coach, "chat", fake_chat)
    return calls


def _body(**overrides):
    body = {"messages": [{"role": "user", "content": "Salut"}]}
    body.update(overrides)
    return body


def _raising(monkeypatch, exc):
    def fake_chat(*args, **kwargs):
        raise exc

    monkeypatch.setattr(coach, "chat", fake_chat)


# ---------- nominal ----------


def test_chat_endpoint_ok(client, game, chat_calls):
    response = client.post(URL, json=_body(game_id=game))

    assert response.status_code == 200
    assert response.json() == {"reply": "Réponse du coach", "prompt": None, "heatmaps": []}


def test_chat_endpoint_without_game_id(client, chat_calls):
    response = client.post(URL, json=_body())

    assert response.status_code == 200
    assert chat_calls[0]["game_id"] is None


def test_chat_endpoint_forwards_game_id_and_selected_player(client, game, chat_calls):
    client.post(URL, json=_body(game_id=game, selected_player="Alice"))

    assert len(chat_calls) == 1
    assert chat_calls[0]["game_id"] == game
    assert chat_calls[0]["selected_player"] == "Alice"
    assert chat_calls[0]["messages"][0].content == "Salut"


def test_chat_endpoint_empty_game_id_treated_as_none(client, chat_calls):
    response = client.post(URL, json=_body(game_id=""))

    assert response.status_code == 200
    assert chat_calls[0]["game_id"] is None


def test_chat_endpoint_returns_prompt_when_coach_provides_one(client, game, monkeypatch):
    prompt = ChoicePrompt(steps=[
        ChoiceStep(question="Quel est ton pseudo ?", options=["Alice", "Bob"]),
        ChoiceStep(question="Que veux-tu voir ?", options=["Stats de match", "Axes d'amélioration"]),
    ])
    monkeypatch.setattr(coach, "chat", lambda *a, **k: coach.CoachReply(reply="Qui es-tu ?", prompt=prompt))

    response = client.post(URL, json=_body(game_id=game))

    assert response.status_code == 200
    assert response.json() == {
        "reply": "Qui es-tu ?",
        "prompt": {"steps": [
            {"question": "Quel est ton pseudo ?", "options": ["Alice", "Bob"]},
            {"question": "Que veux-tu voir ?", "options": ["Stats de match", "Axes d'amélioration"]},
        ]},
        "heatmaps": [],
    }


def test_chat_endpoint_returns_heatmaps_when_coach_provides_them(client, game, monkeypatch):
    heatmap = ChatHeatmap(
        player="Alice", team=0, heatmap=Heatmap(counts=[[1, 2], [3, 4]], x_min=-1.0, x_max=1.0, y_min=-2.0, y_max=2.0)
    )
    monkeypatch.setattr(
        coach, "chat", lambda *a, **k: coach.CoachReply(reply="Voici.", heatmaps=[heatmap])
    )

    response = client.post(URL, json=_body(game_id=game))

    assert response.status_code == 200
    assert response.json()["reply"] == "Voici."
    assert response.json()["heatmaps"] == [
        {
            "player": "Alice",
            "team": 0,
            "heatmap": {"counts": [[1, 2], [3, 4]], "x_min": -1.0, "x_max": 1.0, "y_min": -2.0, "y_max": 2.0},
        }
    ]


def test_chat_endpoint_prompt_is_null_when_absent(client, chat_calls):
    response = client.post(URL, json=_body())

    assert "prompt" in response.json()
    assert response.json()["prompt"] is None


# ---------- errors ----------


def test_chat_endpoint_unknown_game_returns_404(client, chat_calls):
    response = client.post(URL, json=_body(game_id="Missing_Game_1"))

    assert response.status_code == 404
    assert response.json()["detail"] == "Partie introuvable."
    assert chat_calls == []


def test_chat_endpoint_invalid_game_id_returns_404(client, chat_calls):
    response = client.post(URL, json=_body(game_id="../secret"))

    assert response.status_code == 404
    assert chat_calls == []


def test_chat_endpoint_last_message_not_from_user_returns_422(client, chat_calls):
    messages = [{"role": "user", "content": "Q"}, {"role": "assistant", "content": "R"}]

    response = client.post(URL, json={"messages": messages})

    assert response.status_code == 422
    assert chat_calls == []


def test_chat_endpoint_empty_content_returns_422(client, chat_calls):
    response = client.post(URL, json={"messages": [{"role": "user", "content": ""}]})

    assert response.status_code == 422


def test_chat_endpoint_content_too_long_returns_422(client, chat_calls):
    content = "x" * (config.CHAT_MAX_MESSAGE_CHARS + 1)

    response = client.post(URL, json={"messages": [{"role": "user", "content": content}]})

    assert response.status_code == 422


def test_chat_endpoint_too_many_messages_returns_422(client, chat_calls):
    messages = [{"role": "user", "content": "m"}] * (config.CHAT_MAX_MESSAGES + 1)

    response = client.post(URL, json={"messages": messages})

    assert response.status_code == 422


def test_chat_endpoint_empty_message_list_returns_422(client, chat_calls):
    response = client.post(URL, json={"messages": []})

    assert response.status_code == 422


def test_chat_endpoint_missing_messages_returns_422(client, chat_calls):
    response = client.post(URL, json={})

    assert response.status_code == 422


def test_chat_endpoint_invalid_role_returns_422(client, chat_calls):
    response = client.post(URL, json={"messages": [{"role": "system", "content": "x"}]})

    assert response.status_code == 422


def test_chat_endpoint_missing_api_key_returns_503(client, monkeypatch):
    _raising(monkeypatch, coach.CoachConfigError("no key"))

    assert client.post(URL, json=_body()).status_code == 503


def test_chat_endpoint_timeout_returns_504(client, monkeypatch):
    _raising(monkeypatch, coach.CoachTimeoutError("slow"))

    assert client.post(URL, json=_body()).status_code == 504


def test_chat_endpoint_provider_unavailable_returns_502(client, monkeypatch):
    _raising(monkeypatch, coach.CoachUnavailableError("down"))

    assert client.post(URL, json=_body()).status_code == 502


def test_chat_endpoint_generic_coach_error_returns_502(client, monkeypatch):
    _raising(monkeypatch, coach.CoachError("empty"))

    assert client.post(URL, json=_body()).status_code == 502


# ---------- limits ----------


def test_chat_endpoint_accepts_max_size_message_and_history(client, chat_calls):
    messages = [{"role": "user", "content": "x" * config.CHAT_MAX_MESSAGE_CHARS}] * config.CHAT_MAX_MESSAGES

    response = client.post(URL, json={"messages": messages})

    assert response.status_code == 200
