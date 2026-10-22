"""MCP server exposing the imported games to any MCP client (Claude Code, Copilot, Cursor...).

Run from `backend/`: `python -m app.mcp_server` (stdio transport). stdout carries the protocol:
never print anything to it.
"""

import json

from mcp.server.mcpserver import MCPServer

from app.services import coach

INSTRUCTIONS = (
    "Statistiques Rocket League des parties importées dans RL-Coach. Commence par list_games pour obtenir "
    "les game_id (filtre optionnel player_name pour retrouver les parties d'un joueur), puis interroge une partie. "
    "Si list_games renvoie une liste vide, ou si l'utilisateur veut "
    "ajouter une partie, propose-lui d'importer un .replay : demande-lui le chemin absolu du fichier, puis "
    "appelle import_replay. Les données sont brutes : le coaching est à toi de le faire."
)

mcp = MCPServer("rl-coach", instructions=INSTRUCTIONS)


def _call(tool: str, game_id: str | None = None, **arguments) -> dict:
    """Run a coach tool and return its result (an `error` key describes a failure)."""
    return json.loads(coach.run_tool(tool, json.dumps(arguments), game_id))


@mcp.tool()
def list_games(player_name: str | None = None) -> dict:
    """Parties importées (la plus récente d'abord, 50 au maximum) : game_id, carte, mode, date, score, joueurs.

    player_name (optionnel) : ne garde que les parties d'un joueur dont le nom contient ce texte (casse ignorée).
    Liste vide : proposer à l'utilisateur d'importer un .replay avec import_replay."""
    arguments = {"player_name": player_name}
    return _call("list_games", **{k: v for k, v in arguments.items() if v is not None})


@mcp.tool()
def import_replay(file_path: str) -> dict:
    """Importe un fichier .replay local (50 Mo max) ; file_path doit être le chemin ABSOLU du fichier.

    Renvoie game_id, à utiliser ensuite avec les autres outils. already_imported est vrai si la partie existait déjà."""
    return coach.import_replay(file_path)


@mcp.tool()
def get_match_summary(game_id: str) -> dict:
    """Résumé d'une partie : score, durée, mode, carte, date et stats de base de chaque joueur."""
    return _call("get_match_summary", game_id)


@mcp.tool()
def get_player_stats(game_id: str, player_name: str) -> dict:
    """Stats complètes d'un joueur (base, boost, démolitions, déplacement, positionnement)."""
    return _call("get_player_stats", game_id, player_name=player_name)


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
