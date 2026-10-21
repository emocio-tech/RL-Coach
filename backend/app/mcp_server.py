"""MCP server exposing the imported games to any MCP client (Claude Code, Copilot, Cursor...).

Run from `backend/`: `python -m app.mcp_server` (stdio transport). stdout carries the protocol:
never print anything to it.
"""

import json

from mcp.server.mcpserver import MCPServer

from app.services import coach, storage

INSTRUCTIONS = (
    "Statistiques Rocket League des parties importées dans RL-Coach. Commence par list_games pour obtenir "
    "les game_id, puis interroge une partie. Les données sont brutes : le coaching est à toi de le faire."
)

mcp = MCPServer("rl-coach", instructions=INSTRUCTIONS)


def _call(tool: str, game_id: str | None = None, **arguments) -> dict:
    """Run a coach tool and return its result (an `error` key describes a failure)."""
    return json.loads(coach.run_tool(tool, json.dumps(arguments), game_id))


@mcp.tool()
def list_games() -> list[dict]:
    """Parties importées (la plus récente d'abord) : game_id, fichier d'origine, date d'import, score, carte."""
    return [game.model_dump() for game in storage.list_games()]


@mcp.tool()
def get_match_summary(game_id: str) -> dict:
    """Résumé d'une partie : score, durée, mode, carte, date et stats de base de chaque joueur."""
    return _call("get_match_summary", game_id)


@mcp.tool()
def get_player_stats(game_id: str, player_name: str) -> dict:
    """Stats complètes d'un joueur (base, boost, démolitions, déplacement, positionnement)."""
    return _call("get_player_stats", game_id, player_name=player_name)


@mcp.tool()
def compare_players(game_id: str) -> dict:
    """Stats complètes de tous les joueurs d'une partie, côte à côte."""
    return _call("compare_players", game_id)


@mcp.tool()
def get_match_events(game_id: str, player_name: str | None = None, event_type: str | None = None) -> dict:
    """Instants (mm:ss depuis le début du replay) des buts, passes, tirs, arrêts et démolitions.

    event_type : goal, assist, shot, save, demo_done ou demo_taken. Les deux filtres sont optionnels."""
    arguments = {"player_name": player_name, "event_type": event_type}
    return _call("get_match_events", game_id, **{k: v for k, v in arguments.items() if v is not None})


@mcp.tool()
def get_player_heatmap(game_id: str, player_name: str) -> dict:
    """Temps passé par un joueur en zone défensive, au milieu et en zone offensive (en %)."""
    return _call("show_heatmap", game_id, player_name=player_name)


@mcp.tool()
def suggest_training(focus_areas: list[str]) -> dict:
    """Entraînements (3 au maximum) pour 1 à 3 axes de progression.

    Axes possibles : boost, positioning, rotation, defense, shooting, speed, aerials, ball_control."""
    return _call("suggest_training", focus_areas=focus_areas)


if __name__ == "__main__":
    mcp.run()
