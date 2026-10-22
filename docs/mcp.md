# Serveur MCP

## Résumé fonctionnel
Un serveur MCP donne à n'importe quel agent compatible (Claude Code, GitHub Copilot, Cursor, Claude Desktop...) un accès aux parties importées dans RL-Coach, et lui permet d'en importer une depuis un fichier `.replay` local. L'agent peut lister les parties, importer un replay, lire le résumé d'un match, les stats d'un joueur, comparer les joueurs, retrouver les instants des buts ou démolitions, obtenir le temps passé par zone et proposer des entraînements. Les données sont brutes : c'est l'agent qui rédige les conseils. Le serveur n'appelle aucun LLM et n'a besoin ni de clé API ni du back FastAPI.

### Exemple concret
Contexte : deux parties sont importées. Dans Claude Code, l'utilisateur demande : « Qu'est-ce que je dois améliorer sur ma dernière partie ? ». L'agent appelle `list_games`, prend le premier `game_id`, appelle `get_player_stats` avec le pseudo de l'utilisateur, puis répond avec des conseils chiffrés. Si l'utilisateur accepte des exercices, l'agent appelle `suggest_training`.

Si `list_games` renvoie une liste vide, l'agent propose d'importer un `.replay` : l'utilisateur donne le chemin absolu du fichier, l'agent appelle `import_replay`, puis utilise le `game_id` obtenu. Voir `docs/mcp-import-replay.md`.

## Description technique

### Lancement
Transport **stdio** : l'agent lance le serveur comme sous-processus et dialogue en JSON sur stdin/stdout. Rien ne tourne en continu.

```
cd backend
.venv\Scripts\python.exe -m app.mcp_server
```
Le dossier de travail doit être `backend/` (import `app`). Le serveur lit `data/games/` via `services/storage`. Seul `import_replay` y écrit (un dossier `stats.json` + `3dmatch.json` + `heatmap.json` par nouvelle partie). Aucun `print` : stdout est réservé au protocole.

### Outils
Le serveur expose 7 outils. Chacun renvoie un objet JSON ; une erreur est un objet `{"error": ...}` (partie ou joueur introuvable, argument invalide, fichier refusé), pas une exception. Sauf `import_replay`, ils réutilisent les outils du coach IA (`services/coach.py`), avec `game_id` en argument. `import_replay` appelle la fonction `coach.import_replay`, absente de la liste `TOOLS` du chat.

| Outil | Arguments | Résultat |
|---|---|---|
| `list_games` | `player_name?` | `{"games": [...]}` : parties importées, la plus récente d'abord, 50 au maximum (`game_id`, `map_name`, `match_type`, `team_size`, `date`, `score`, `players`). `player_name` filtre les parties dont un joueur a un nom contenant ce texte (casse ignorée). |
| `import_replay` | `file_path` (chemin absolu) | Importe un `.replay` local (50 Mo max, ni UNC ni lien symbolique) : `{"game_id", "already_imported"}`, ou `{"error": ...}`. Voir `docs/mcp-import-replay.md`. |
| `get_match_summary` | `game_id` | Score, durée, mode, carte, stats de base de chaque joueur. |
| `get_player_stats` | `game_id`, `player_name` | Stats complètes d'un joueur (nom comparé sans tenir compte de la casse). |
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
- Lecture seule, sauf `import_replay` (import d'un `.replay` local par chemin absolu, voir `docs/mcp-import-replay.md`). Pas de suppression de partie, pas d'import en lot ni en base64.
- Pas d'outil de chat : l'agent fait lui-même le coaching.
- Transport stdio uniquement (pas d'HTTP).
- Sur macOS/Linux, remplacer `backend/.venv/Scripts/python.exe` par `backend/.venv/bin/python`.
- Dépendance : `mcp>=2.0` (`backend/requirements.txt`).
- Tests : `backend/tests/test_mcp_server.py`.
