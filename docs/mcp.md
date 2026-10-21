# Serveur MCP

## Résumé fonctionnel
Un serveur MCP donne à n'importe quel agent compatible (Claude Code, GitHub Copilot, Cursor, Claude Desktop...) un accès aux parties déjà importées dans RL-Coach. L'agent peut lister les parties, lire le résumé d'un match, les stats d'un joueur, comparer les joueurs, retrouver les instants des buts ou démolitions, obtenir le temps passé par zone et proposer des entraînements. Les données sont brutes : c'est l'agent qui rédige les conseils. Le serveur n'appelle aucun LLM et n'a besoin ni de clé API ni du back FastAPI.

### Exemple concret
Contexte : deux parties sont importées. Dans Claude Code, l'utilisateur demande : « Qu'est-ce que je dois améliorer sur ma dernière partie ? ». L'agent appelle `list_games`, prend le premier `game_id`, appelle `get_player_stats` avec le pseudo de l'utilisateur, puis répond avec des conseils chiffrés. Si l'utilisateur accepte des exercices, l'agent appelle `suggest_training`.

## Description technique

### Lancement
Transport **stdio** : l'agent lance le serveur comme sous-processus et dialogue en JSON sur stdin/stdout. Rien ne tourne en continu.

```
cd backend
.venv\Scripts\python.exe -m app.mcp_server
```
Le dossier de travail doit être `backend/` (import `app`). Le serveur lit `data/games/` via `services/storage`. Il n'écrit rien. Aucun `print` : stdout est réservé au protocole.

### Outils
Chaque outil renvoie un objet JSON ; une erreur est un objet `{"error": ...}` (partie ou joueur introuvable, argument invalide), pas une exception. Ils réutilisent les outils du coach IA (`services/coach.py`), avec `game_id` en argument.

| Outil | Arguments | Résultat |
|---|---|---|
| `list_games` | aucun | Parties importées, la plus récente d'abord (`id`, `original_filename`, `imported_at`, scores, `map_name`). |
| `get_match_summary` | `game_id` | Score, durée, mode, carte, stats de base de chaque joueur. |
| `get_player_stats` | `game_id`, `player_name` | Stats complètes d'un joueur (nom comparé sans tenir compte de la casse). |
| `compare_players` | `game_id` | Stats complètes de tous les joueurs. |
| `get_match_events` | `game_id`, `player_name?`, `event_type?` | Événements horodatés (mm:ss depuis le début du replay), 60 au maximum. `event_type` : `goal`, `assist`, `shot`, `save`, `demo_done`, `demo_taken`. |
| `get_player_heatmap` | `game_id`, `player_name` | Temps passé en zone défensive, milieu, offensive (%). |
| `suggest_training` | `focus_areas` (1 à 3) | Entraînements (3 au maximum). Axes : `boost`, `positioning`, `rotation`, `defense`, `shooting`, `speed`, `aerials`, `ball_control`. |

### Brancher un agent
Tous les agents attendent la même information (commande, arguments, dossier de travail) ; seuls le fichier et la clé racine changent. Prérequis : le venv du back existe (`pip install -r backend/requirements.txt`).

| Agent | Fichier | Clé racine |
|---|---|---|
| Claude Code | `.mcp.json` à la racine (versionné, déjà fourni) | `mcpServers` |
| VS Code / Copilot | `.vscode/mcp.json` (ignoré par Git) | `servers` |
| Cursor | `.cursor/mcp.json` | `mcpServers` |
| Claude Desktop | `claude_desktop_config.json` (global) | `mcpServers` |

Contenu du serveur, identique partout (chemins relatifs à la racine du dépôt ; pour un fichier global, mettre des chemins absolus) :

```json
{
  "command": "backend/.venv/Scripts/python.exe",
  "args": ["-m", "app.mcp_server"],
  "cwd": "backend"
}
```
Exemple VS Code / Copilot (`.vscode/mcp.json`) : `{ "servers": { "rl-coach": <contenu ci-dessus> } }`.

### Périmètre
- Lecture seule : pas d'import de replay ni de suppression via MCP.
- Pas d'outil de chat : l'agent fait lui-même le coaching.
- Transport stdio uniquement (pas d'HTTP).
- Sur macOS/Linux, remplacer `backend/.venv/Scripts/python.exe` par `backend/.venv/bin/python`.
- Dépendance : `mcp>=2.0` (`backend/requirements.txt`).
- Tests : `backend/tests/test_mcp_server.py`.
