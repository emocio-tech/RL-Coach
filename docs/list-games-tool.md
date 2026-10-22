# Tools améliorés : `list_games` et argument `game_id`

## Résumé fonctionnel
Un nouveau tool `list_games` liste les parties importées, avec un filtre optionnel par nom de joueur. Les tools `get_match_summary`, `get_player_stats`, `show_heatmap` et `get_match_events` acceptent un argument optionnel `game_id`. Le LLM peut ainsi explorer et comparer plusieurs parties. Sans `game_id`, c'est la partie ouverte par l'utilisateur qui est utilisée. Les tools `compare_players` et `analyze_player_across_matches` sont supprimés : le LLM compose lui-même la comparaison à partir de plusieurs appels.

### Exemple concret
Dans le chat, aucune partie n'est ouverte. L'utilisateur « Zen » écrit : « compare ma dernière partie avec la précédente ».
1. Le LLM appelle `list_games({"player_name": "Zen"})`. Il reçoit `{"games": [{"game_id": "Mannfield_Doubles_ab12", ...}, {"game_id": "Utopia_Doubles_cd34", ...}]}`, de la plus récente à la plus ancienne.
2. Il appelle `get_player_stats({"player_name": "Zen", "game_id": "Mannfield_Doubles_ab12"})`, puis la même chose avec `Utopia_Doubles_cd34`.
3. Il compare les deux jeux de stats et répond avec les écarts.

Les identifiants sont illustratifs. Le format réel est `<stade>_<mode>_<id replay>`.

## Description technique

### Entrées

**`list_games`** (`backend/app/services/coach.py`, `_list_games`)

| nom | type | obligatoire | description |
|---|---|---|---|
| `player_name` | string | non | Garde les parties ayant un joueur dont le nom contient ce texte, sans tenir compte de la casse. Vide ou espaces : pas de filtre. Non string : erreur `Argument player_name invalide.` |

**`game_id`** (`GAME_ID_PROPERTY`), ajouté à `get_match_summary`, `get_player_stats`, `show_heatmap` et `get_match_events`

| nom | type | obligatoire | description |
|---|---|---|---|
| `game_id` | string | non | Doit respecter `GAME_ID_PATTERN` (`storage.py`). La valeur est « trimée ». `None` ou `""` : partie ouverte de la requête. |

La résolution se fait dans `_effective_game_id`, appelé avant ces tools.

**MCP** (`backend/app/mcp_server.py`) : `list_games(player_name=None)` délègue à `coach.run_tool`. Pour les autres tools, `game_id` est un paramètre obligatoire, transmis à `run_tool` comme « partie ouverte » (il n'est donc pas validé par `GAME_ID_PATTERN` dans `_effective_game_id`). Un id invalide ou inconnu donne `Partie introuvable.`. Les instructions du serveur demandent de commencer par `list_games`.

**Chat** : le prompt système indique la partie ouverte quand elle existe, décrit `list_games` et, sans partie ouverte, demande d'utiliser `list_games` puis de passer le `game_id`. Les outils sont envoyés au LLM même sans partie ouverte.

### Sorties

`list_games` renvoie `{"games": [...]}`. Chaque élément contient :

| champ | contenu |
|---|---|
| `game_id` | nom du dossier dans `data/games/` |
| `map_name` | nom d'affichage du stade |
| `match_type` | `str` ou `null` |
| `team_size` | `int` ou `null` |
| `date` | chaîne issue de `stats.json`, ou `null` |
| `score` | `"<équipe0>-<équipe1>"`, par exemple `"3-2"` |
| `players` | noms des joueurs |

- **Tri** : par `date` décroissante ; les dates nulles passent en dernier.
- **Limite** : 50 parties (`MAX_LISTED_GAMES`), sans indicateur de troncature.
- **Ignorés** : dossiers dont le nom ne respecte pas le pattern, sans `stats.json`, ou au `stats.json` illisible.
- **Aucune partie** : `{"games": []}`.
- Ne pas confondre avec `storage.list_games()` (`ReplaySummary`, trié par date d'import, utilisé par `GET /api/replays`).

Les autres tools gardent leurs sorties, calculées sur la partie résolue. Sans `player_name`, `get_player_stats` et `show_heatmap` utilisent le joueur sélectionné.

**Log LLM** (`services/llm_log.py`) : `game_files(tool_name, game_id, arguments_json)` lit d'abord le `game_id` des arguments, sinon celui de la requête, et le valide par `GAME_ID_PATTERN` (id invalide : aucun fichier). `list_games` est dans `TOOLS_WITHOUT_FILES` (il lit tous les `stats.json`).

### Erreurs
Renvoyées dans le JSON du tool sous la forme `{"error": "..."}`.

| condition | message |
|---|---|
| `game_id` omis, aucune partie ouverte (chat) | `Aucune partie ouverte : appelle list_games pour trouver une partie.` |
| `game_id` non string ou hors pattern | `Argument game_id invalide : utilise un game_id renvoyé par list_games.` |
| `game_id` valide mais dossier absent | `Partie introuvable : utilise un game_id renvoyé par list_games.` |
| `player_name` non string (`list_games`) | `Argument player_name invalide.` |
| outil supprimé ou inconnu | `Outil inconnu : <nom>` |

### Périmètre
- **Inclus** : `list_games` (chat et MCP), `game_id` optionnel sur 4 tools du chat, log par partie, helper `storage.list_game_infos`.
- **Exclu** : comparaison et analyse multi-parties côté serveur (`crossmatch.py` supprimé), pagination, recherche par date, `choose_player`, `suggest_training` et `import_replay` (inchangés).
