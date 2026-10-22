import json
import logging
import threading
from datetime import datetime

from app import config

logger = logging.getLogger(__name__)

def _empty_totals() -> dict:
    return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "calls": 0}


# Tokens used by the LLM calls since the back started, and by the calls of each message still being answered.
_session_totals = _empty_totals()
_request_totals: dict[str, dict] = {}
_totals_lock = threading.Lock()

# Tools that read no game file (the training plan is built from constants).
TOOLS_WITHOUT_FILES = {"suggest_training"}

# Message roles, as sent to the LLM, mapped to the log categories.
ROLE_CATEGORIES = {
    "system": "système",
    "user": "utilisateur",
    "assistant": "assistant",
    "tool": "résultats_outils",
}


def _message_chars(message: dict) -> int:
    chars = len(message.get("content") or "")
    for call in message.get("tool_calls") or []:
        function = call["function"]
        chars += len(function["name"]) + len(function["arguments"] or "")
    return chars


def context_chars(conversation: list[dict], tools: list[dict] | None) -> dict[str, int]:
    """Size in characters of what is sent to the LLM, by category."""
    sizes = {category: 0 for category in ROLE_CATEGORIES.values()}
    for message in conversation:
        category = ROLE_CATEGORIES.get(message["role"], message["role"])
        sizes[category] = sizes.get(category, 0) + _message_chars(message)
    sizes["définitions_outils"] = len(json.dumps(tools, ensure_ascii=False)) if tools else 0
    return sizes


def game_files(tool_name: str, game_id: str | None) -> list[str]:
    """Files of data/games read by a tool (stats.json, plus map.json when the game has one)."""
    if not game_id or tool_name in TOOLS_WITHOUT_FILES:
        return []
    return [
        f"data/games/{game_id}/{filename}"
        for filename in (config.STATS_FILENAME, config.MAP_FILENAME)
        if (config.GAMES_DIR / game_id / filename).is_file()
    ]


def _tokens(usage, name: str) -> int:
    value = getattr(usage, name, None)
    return value if isinstance(value, int) else 0


def _totals_line(label: str, totals: dict) -> str:
    if totals["calls"] == 0:
        return f"{label} : tokens non fournis"
    return (
        f"{label} : prompt={totals['prompt_tokens']} completion={totals['completion_tokens']} "
        f"total={totals['total_tokens']} ({totals['calls']} appels)"
    )


def _usage_lines(request_id: str, usage) -> list[str]:
    """Tokens of the call, then the running total of the session (since the back started)."""
    with _totals_lock:
        request = _request_totals.setdefault(request_id, _empty_totals())
        if usage is None:
            return ["Tokens API : non fournis"]
        for totals in (request, _session_totals):
            for name in ("prompt_tokens", "completion_tokens", "total_tokens"):
                totals[name] += _tokens(usage, name)
            totals["calls"] += 1
        session = dict(_session_totals)
    return [
        f"Tokens API : prompt={_tokens(usage, 'prompt_tokens')} "
        f"completion={_tokens(usage, 'completion_tokens')} "
        f"total={_tokens(usage, 'total_tokens')}",
        _totals_line("total_session", session),
    ]


def _write(now: datetime, lines: list[str]) -> None:
    config.LOGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(config.LOGS_DIR / f"llm-{now:%Y-%m-%d}.txt", "a", encoding="utf-8") as log_file:
        log_file.write("\n".join(lines) + "\n\n")


def log_request_end(request_id: str, game_id: str | None) -> None:
    """Append the tokens used by all the LLM calls of one user message, and the session total."""
    try:
        with _totals_lock:
            request = _request_totals.pop(request_id, None)
            session = dict(_session_totals)
        if request is None:
            return
        now = datetime.now()
        _write(
            now,
            [
                f"--- {now:%Y-%m-%d %H:%M:%S} | requête {request_id} terminée | partie {game_id or '-'}",
                _totals_line("total_message", request),
                _totals_line("total_session", session),
            ],
        )
    except Exception:
        logger.exception("Could not write the LLM request log")


def log_call(
    request_id: str,
    iteration: int,
    game_id: str | None,
    conversation: list[dict],
    tools: list[dict] | None,
    response,
) -> None:
    """Append one LLM call to logs/llm-<date>.txt. A logging failure never breaks the chat."""
    try:
        now = datetime.now()
        message = response.choices[0].message if response.choices else None
        tool_calls = (message.tool_calls if message else None) or []
        sizes = context_chars(conversation, tools)
        lines = [
            f"=== {now:%Y-%m-%d %H:%M:%S} | requête {request_id} | appel {iteration + 1} "
            f"| partie {game_id or '-'} | modèle {config.LLM_MODEL}",
            *_usage_lines(request_id, getattr(response, "usage", None)),
            "Contexte envoyé (caractères) : " + " ".join(f"{name}={size}" for name, size in sizes.items()),
        ]
        if tool_calls:
            lines.append("Réponse : appel d'outils")
            for call in tool_calls:
                files = game_files(call.function.name, game_id)
                lines.append(
                    f"  - outil {call.function.name}({call.function.arguments or ''}) "
                    f"| fichiers lus : {', '.join(files) if files else 'aucun'}"
                )
        else:
            text = (message.content if message else None) or ""
            lines.append(f"Réponse : texte ({len(text)} caractères)")
        _write(now, lines)
    except Exception:
        logger.exception("Could not write the LLM call log")
