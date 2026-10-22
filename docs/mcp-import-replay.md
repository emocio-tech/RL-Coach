# Import d'un replay depuis le serveur MCP

## Résumé fonctionnel
L'outil MCP `import_replay` permet à un agent (Claude Code, Copilot, Cursor, Claude Desktop...) d'importer un fichier `.replay` local dans RL-Coach, sans passer par l'interface web. L'utilisateur donne le chemin absolu du fichier et l'agent l'envoie au serveur MCP. Le serveur décode le replay, écrit les données du match dans `data/games/` et renvoie un `game_id`. Cet identifiant s'utilise ensuite avec les autres outils (`get_match_summary`, `get_player_stats`...). Si la partie avait déjà été importée, rien n'est écrit et l'identifiant existant est renvoyé. L'outil sert surtout à démarrer à vide : quand `list_games` renvoie une liste vide, l'agent propose d'importer une partie (`backend/app/mcp_server.py:13`).

### Exemple concret
Contexte : `data/games/` est vide. L'utilisateur demande dans Claude Code : « Analyse ma dernière partie. »

1. L'agent appelle `list_games` et obtient `[]`. Les instructions du serveur lui demandent alors de proposer un import (`backend/app/mcp_server.py:13-18`).
2. L'agent répond : « Aucune partie n'est importée. Donnez-moi le chemin absolu d'un fichier .replay. »
3. L'utilisateur répond : `C:\Users\moi\Documents\My Games\Rocket League\TAGame\Demos\match.replay`.
4. L'agent appelle `import_replay` avec ce chemin. Résultat :
   ```json
   {"game_id": "UF_Day_P_Online-2v2_900DE226...", "already_imported": false}
   ```
   Le dossier `data/games/UF_Day_P_Online-2v2_900DE226.../` contient `stats.json` et `map.json`. Le `.replay` d'origine n'est ni copié, ni déplacé, ni modifié.
5. L'agent appelle `get_match_summary` avec ce `game_id` et commente le score, la durée et les stats des joueurs.

Cas déjà importé : l'utilisateur redonne le même fichier plus tard. L'outil renvoie le même `game_id` avec `"already_imported": true`. Aucun fichier n'est écrit : le dossier et sa date d'import restent inchangés. L'agent peut enchaîner directement sur `get_match_summary`.

Cas d'erreur : si l'utilisateur donne `match.replay` (chemin relatif), l'outil renvoie `{"error": "Chemin absolu requis."}` et l'agent redemande un chemin absolu.

## Description technique

### Entrées
Outil MCP `import_replay(file_path: str)` (`backend/app/mcp_server.py:36-41`), qui délègue à `coach.import_replay` (`backend/app/services/coach.py:274`).

| Nom | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `file_path` | chaîne | oui | Chemin **absolu** d'un fichier local, nom finissant par `.replay` (insensible à la casse), non vide, 50 Mo maximum (`MAX_UPLOAD_BYTES`, `backend/app/config.py:9`). Les espaces en début et fin sont retirés. Ni chemin réseau UNC, ni lien symbolique. |

### Sorties
- Succès : `{"game_id": "<nom du dossier>", "already_imported": <bool>}` (`backend/app/services/coach.py:306`).
  - `game_id` : nom du dossier dans `data/games/`, au format `<stade>_<mode>-<N>v<N>_<id replay>` avec un éventuel suffixe `_N` (même nommage que l'import web, voir `docs/replay-upload.md`).
  - `already_imported` : `true` si un dossier contient déjà ce replay (même `Id`) ; dans ce cas rien n'est écrit.
- Effets (nouvelle partie) : création de `data/games/<game_id>/stats.json` et `map.json`, par écriture atomique via un dossier temporaire `.tmp-<uuid>` renommé (`backend/app/services/storage.py:125-151`).
- Échec : `{"error": "<message>"}`. L'outil ne lève pas d'exception vers l'agent.

### Erreurs
Toutes renvoient `{"error": ...}`. Messages dans l'ordre d'évaluation (`backend/app/services/coach.py:274-305`) :

| Condition | Message |
|---|---|
| `file_path` absent, non textuel ou vide après `strip` | `Chemin du fichier manquant.` |
| Chemin non absolu | `Chemin absolu requis.` |
| Chemin commençant par `\\` (UNC) | `Les chemins réseau (UNC) sont refusés.` |
| Nom ne finissant pas par `.replay` | `Seuls les fichiers .replay sont acceptés.` |
| Le chemin est un lien symbolique | `Les liens symboliques sont refusés.` |
| Ce n'est pas un fichier existant (absent ou dossier) | `Fichier introuvable.` |
| Taille 0 | `Fichier vide.` |
| Taille > 50 Mo | `Fichier trop volumineux (50 Mo max).` |
| `OSError` (lecture, mais aussi écriture dans `data/games/`) | `Fichier illisible.` |
| `rrrocket` introuvable (`RuntimeError`) | `rrrocket introuvable : voir backend/bin/.` |
| Toute autre exception | `Erreur interne lors de l'import.` |

Les `ValueError` levées plus bas sont renvoyées telles quelles via `str(exc)`, **en anglais** (`coach.py:300-301`) :

| Origine | Message |
|---|---|
| `storage.py:53-58` (doublons des contrôles ci-dessus, utiles si le fichier change entre la vérification et la lecture) | `Only .replay files are accepted`, `Empty file`, `File too large` |
| `parser.py:32` | `Replay parsing timed out` (timeout `rrrocket`) |
| `parser.py:36` | `Replay parsing failed: <stderr rrrocket, 200 caractères max>` |
| `parser.py:41` | `Replay parsing returned invalid JSON` |
| `stats.py:406` | `Replay has no usable data` (pas de `PlayerStats` ou pas de frames réseau) |

### Garde-fous de sécurité
- **Chemin absolu obligatoire** : `Path.is_absolute()` (`coach.py:280`). Un chemin relatif est refusé avant tout accès disque.
- **Pas de chemin UNC** : refus si le texte commence par `\\` (`coach.py:282`), pour éviter un accès à un partage réseau.
- **Pas de lien symbolique** : `path.is_symlink()` (`coach.py:287`).
- **Extension** : le nom doit finir par `.replay`, vérifié dans `coach.py:284` puis à nouveau dans `storage.py:53`.
- **Taille** : contrôle via `stat()` avant lecture (`coach.py:291-295`), puis sur le contenu lu (`storage.py:55-58`). Limite : 50 Mo.
- **Seul le basename est stocké** : `storage.py:65` ne garde que `Path(filename).name`, sans caractères de contrôle, 255 caractères maximum. Il est écrit dans `original_filename` de `stats.json`. Le dossier parent du fichier n'est jamais enregistré.
- **Le `.replay` n'est jamais copié, déplacé, supprimé ni modifié** : il est seulement lu (`path.read_bytes()`, `coach.py:296`), puis les octets sont passés au parseur. Le seul fichier écrit est une copie temporaire de l'OS destinée à `rrrocket`, supprimée ensuite (`parser.py:15-46`). Il n'est jamais écrit dans `data/`.
- **Écriture limitée à `data/games/`** : le dossier final est vérifié (`final.resolve().parent == games_dir`, `storage.py:140`).

### Flux interne
1. `mcp_server.import_replay(file_path)` appelle `coach.import_replay(file_path)` (`mcp_server.py:41`). Contrairement aux autres outils, il ne passe pas par `_call` / `coach.run_tool`.
2. `coach.import_replay` valide le chemin (voir « Erreurs »), lit le fichier en mémoire (`read_bytes`) et appelle `storage.import_replay_bytes(content, path.name)` (`coach.py:297`).
3. `storage.import_replay_bytes` revérifie extension, taille nulle et taille maximale, puis appelle `parser.parse_replay` (`rrrocket -n`, timeout `RRROCKET_TIMEOUT_SECONDS`). Il lit `properties.Id` ; sans `Id`, un `uuid4().hex` est généré et le replay ne sera jamais dédoublonné (`storage.py:51-67`).
4. `_store_match` s'exécute sous le verrou `_STORE_LOCK` (`storage.py:70-83`) :
   - si `Id` présent et dossier existant (`_find_existing_folder`) : renvoie `(nom, True)` sans rien écrire ;
   - sinon `stats.build_match_files` puis `_write_match_folder` : renvoie `(nom, False)`.
5. `coach.import_replay` renvoie `{"game_id", "already_imported"}`.

Le chemin web partage le même cœur : `storage.save_replay` (`storage.py:30-48`) lit l'upload par blocs, puis appelle aussi `import_replay_bytes`. Le détail du nommage, de la déduplication et du contenu des fichiers est dans `docs/replay-upload.md`.

### Périmètre
- **Inclus** :
  - Import d'un seul `.replay` local, désigné par son chemin absolu.
  - Déduplication par `Id` du replay (`already_imported`).
  - Incitation côté agent à proposer l'import quand `list_games` est vide (`INSTRUCTIONS`, `mcp_server.py:13-18`, et description de `list_games`, `mcp_server.py:30-31`).
- **Exclu** :
  - Import en lot (un fichier par appel).
  - Envoi du contenu en base64.
  - Liste de dossiers autorisés (aucune restriction de dossier : tout chemin absolu hors UNC, non lien symbolique, est accepté).
  - Exposition au chat web : `import_replay` n'est **pas** dans `TOOLS` (`coach.py:137`) ni dans `_run_tool`, donc le LLM du chat ne peut pas l'appeler.
  - Suppression de partie via MCP.
- **Dépendances** : binaire `rrrocket` (`backend/bin/` ou `RRROCKET_PATH`), `services/coach.py`, `services/storage.py`, `services/parser.py`, `services/stats.py`, SDK `mcp>=2.0`, constantes de `backend/app/config.py` (`MAX_UPLOAD_BYTES`, `ALLOWED_EXTENSION`, `GAMES_DIR`).

### Limites constatées dans le code
- `is_symlink()` ne teste que le dernier élément du chemin : un lien symbolique dans un dossier parent n'est pas détecté.
- Le contrôle UNC est textuel (`\\` en début de chaîne). Sur Windows, ces chemins sont absolus et reçoivent le message UNC ; sur macOS/Linux, ils ne sont pas absolus et reçoivent `Chemin absolu requis.`
- Une `OSError` d'écriture dans `data/games/` est présentée comme `Fichier illisible.`
- Les messages issus de `storage`, `parser` et `stats` sont en anglais, contrairement aux autres.
