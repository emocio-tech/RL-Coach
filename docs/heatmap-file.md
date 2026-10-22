# Fichiers d'import : `stats.json`, `3dmatch.json`, `heatmap.json`

## Résumé fonctionnel

À l'import d'un `.replay`, le back écrit trois fichiers JSON dans un dossier de `data/games/` (le `.replay` n'est jamais conservé) :
- `stats.json` : statistiques et événements du match (inchangé).
- `3dmatch.json` : données de la rediffusion 3D (trajectoires, ballon, pads, `timeline_seconds`, heatmaps). C'est l'ancien `map.json`, renommé sans changement de contenu.
- `heatmap.json` : nouveau fichier, uniquement les heatmaps (celle de chaque joueur et celle du ballon), temps morts du ballon écartés.

La page Heatmaps (`GET /api/replays/{game_id}/heatmaps`) et l'outil `show_heatmap` du coach (chat et MCP `get_player_heatmap`) lisent `heatmap.json` au lieu de charger tout `3dmatch.json`, volumineux à cause des trajectoires. Aucune migration : les anciens dossiers (avec `map.json`) ne sont pas modifiés et ne sont plus lus.

### Exemple

```
data/games/
└── UF_Day_P_Online-2v2_900DE226.../
    ├── stats.json
    ├── 3dmatch.json
    └── heatmap.json
```

Extrait de `heatmap.json` (valeurs illustratives, `counts` tronqué : la vraie grille fait 20 lignes de 26 entiers) :

```json
{
  "replay_id": "900DE226...",
  "players": [
    {
      "name": "Matt",
      "team": 0,
      "heatmap": {
        "x_min": -4096.0, "x_max": 4096.0,
        "y_min": -5120.0, "y_max": 5120.0,
        "counts": [[0, 0, 3, 12, "..."], ["..."]]
      }
    }
  ],
  "ball": { "x_min": -4096.0, "x_max": 4096.0, "y_min": -5120.0, "y_max": 5120.0, "counts": ["..."] }
}
```

## Description technique

### Constantes (`backend/app/config.py`)
`STATS_FILENAME = "stats.json"`, `MATCH3D_FILENAME = "3dmatch.json"`, `HEATMAP_FILENAME = "heatmap.json"`. `MAP_FILENAME` n'existe plus.

### Écriture
- `stats.build_match_files(...)` renvoie `(StatsFile, Match3DFile, HeatmapFile)`. Le `HeatmapFile` est dérivé des `PlayerMap.heatmap` déjà calculés (même ordre, même `replay_id`) et de la heatmap du ballon, calculée sans les temps morts ; `3dmatch.json` garde les heatmaps des joueurs mais pas celle du ballon.
- `storage._write_match_folder(folder_name, stats_file, match3d_file, heatmap_file)` écrit les trois fichiers dans `.tmp-<uuid>` puis renomme le dossier (suffixe `_N` en cas de collision). Si une écriture échoue, le dossier temporaire est supprimé et l'exception relancée.
- Un replay déjà importé (même `Id`) renvoie le dossier existant sans rien écrire.
- L'import MCP `import_replay` passe par le même chemin.

### Lecture
- `storage.get_game_heatmaps(game_id) -> MatchHeatmaps | None` lit uniquement `heatmap.json` ; `None` si l'id est invalide, le fichier absent ou invalide.
- `storage.get_player_heatmap(game_id, player_name) -> PlayerHeatmap | None` passe par `get_game_heatmaps` (donc la même heatmap que la page) ; `None` si les heatmaps sont indisponibles ou le joueur introuvable (nom comparé sans casse, avec `strip()`).
- `coach.show_heatmap` renvoie `{"error": "Heatmap indisponible pour ce joueur."}` quand le résultat est `None`, sinon ajoute un `ChatHeatmap(player, team, heatmap)` à la réponse.
- `get_game_tracks` et `get_game_report` lisent `3dmatch.json`. Les `zones_pct` de `show_heatmap` viennent du rapport, donc de `3dmatch.json`.

### Schémas (`backend/app/schemas/replay.py`)
- `Match3DFile` (ex-`MapFile`) : `replay_id`, `players: list[PlayerMap]`, `ball`, `timeline_seconds | None`, `pads`.
- `PlayerHeatmap` : `name`, `team`, `heatmap`.
- `HeatmapFile` : `replay_id`, `players: list[PlayerHeatmap]`, `ball: Heatmap`.
- `Heatmap` : `x_min`, `x_max`, `y_min`, `y_max`, `counts: list[list[int]]` (grille 20×26, échantillons à 5 Hz).

### Erreurs
| Condition | Comportement |
|---|---|
| `game_id` invalide, `heatmap.json` absent, joueur absent | `get_player_heatmap` renvoie `None` |
| `heatmap.json` invalide | `get_game_heatmaps` renvoie `None` (la route répond 404, `show_heatmap` signale l'erreur) |
| Ancien dossier avec `map.json` | ignoré : `/tracks` renvoie 404, le rapport passe en mode dégradé, `show_heatmap` signale l'erreur ; un réimport renvoie le dossier existant sans rien écrire |

### Périmètre
Exclu : migration des anciens dossiers, repli sur `map.json`, déduplication des heatmaps entre `3dmatch.json` et `heatmap.json` (écrites deux fois), génération de `heatmap.json` pour un replay déjà importé.
