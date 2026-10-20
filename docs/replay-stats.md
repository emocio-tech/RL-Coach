# Stats d'une partie : match, joueurs et graphiques

## Résumé fonctionnel
Une fois un replay importé, le front appelle le back pour récupérer le rapport de la partie. Ce rapport réunit les stats du match (score, durée, mode, carte), les stats de base de chaque joueur, des stats détaillées calculées à partir des trajectoires (vitesse, positionnement, boost, démolitions) et la position de la balle au fil du temps. Le front en tire l'écran « Vue d'ensemble » : récap et tableaux par équipe, stats détaillées du joueur sélectionné, graphique de momentum (quelle équipe pousse) et radar de style de jeu.

### Exemple concret
```bash
curl http://localhost:8000/api/replays/UF_Day_P_Online-2v2_900DE226.../stats
```
Réponse `200` (valeurs illustratives et tronquées) :
```json
{
  "id": "UF_Day_P_Online-2v2_900DE226...",
  "original_filename": "match.replay",
  "match": {"match_type": "Online", "team_size": 2, "team0_score": 2,
            "team1_score": 5, "duration_seconds": 227.4,
            "map_name": "UF_Day_P", "date": "2026-06-21 19-01-08"},
  "players": [{
    "stats": {"name": "Pseudo", "team": 1, "score": 329, "goals": 1,
              "assists": 0, "saves": 2, "shots": 2,
              "demolitions": {"inflicted": 0, "received": 0},
              "boost": {"small_pads": 110, "big_pads": 9,
                        "consumed_per_minute": 515.2, "average_level": 42.5}},
    "detail": {"tracked_time_s": 302.0, "avg_speed": 1375.9,
               "supersonic_pct": 16.2, "slow_pct": 26.4, "zero_boost_pct": 14.4,
               "defensive_zone_pct": 54.6, "mid_zone_pct": 31.2,
               "offensive_zone_pct": 14.2, "behind_ball_pct": 80.9,
               "avg_ball_distance": 2848.5, "first_man_pct": 32.6,
               "second_man_pct": 67.4, "third_man_pct": 0.0}
  }],
  "ball_y": [0.0, 12.4, -80.1],
  "sample_seconds": 0.2
}
```
Le joueur de cet exemple passe 54,6 % du temps dans son tiers défensif et 32,6 % du temps comme joueur de son équipe le plus proche de la balle.

## Description technique

### Entrées
`GET /api/replays/{game_id}/stats` (`backend/app/api/routes/replays.py`).

| Nom | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `game_id` | chemin | oui | Nom d'un dossier de `data/games/`, tel que renvoyé par `POST /api/replays`. Il doit respecter `GAME_ID_PATTERN` (`backend/app/services/storage.py`) : les valeurs comme `..` ou `.hidden` sont refusées. |

### Sorties
`GameReport` (`backend/app/schemas/replay.py`), construit par `analysis.build_report` (`backend/app/services/analysis.py`).

| Champ | Contenu |
|---|---|
| `id`, `original_filename`, `match` | Repris de `stats.json`. |
| `players[].stats` | Stats de base, démolitions et boost de `stats.json`. |
| `players[].detail` (`PlayerDetail`) | Stats calculées à partir de `map.json`, voir ci-dessous. |
| `ball_y` | Position de la balle sur l'axe long du terrain, un échantillon par pas de temps (`null` quand elle est inconnue). Vide sans `map.json`. |
| `sample_seconds` | Durée entre deux échantillons (`1 / FRAME_SAMPLE_HZ`, soit 0,2 s). `null` sans `map.json`. |

#### `PlayerDetail`
Toutes les parts sont en pourcentage, arrondies à 0,1. Un champ vaut `null` quand il n'y a aucun échantillon exploitable.

| Champ | Définition |
|---|---|
| `tracked_time_s` | Durée avec une position connue. |
| `avg_speed` | Vitesse moyenne. |
| `supersonic_pct` | Part du temps à 2200 unités/s ou plus (`SUPERSONIC_SPEED`). |
| `slow_pct` | Part du temps sous 1000 unités/s (`SLOW_SPEED`). |
| `zero_boost_pct` | Part du temps avec 0 de boost. |
| `defensive_zone_pct`, `mid_zone_pct`, `offensive_zone_pct` | Terrain coupé en trois tiers sur l'axe long, vu depuis le camp du joueur. L'équipe 0 défend le côté négatif de y, l'équipe 1 le côté positif. |
| `behind_ball_pct` | Part du temps entre la balle et son propre but. |
| `avg_ball_distance` | Distance moyenne à la balle. |
| `first_man_pct`, `second_man_pct`, `third_man_pct` | Part du temps où le joueur est le plus proche, le 2e ou le 3e plus proche de la balle parmi son équipe. |

### Erreurs
| Cas | Réponse |
|---|---|
| `game_id` invalide ou dossier inconnu | `404`, `{"detail": "Replay not found"}`. |
| `map.json` absent | `200` : les `detail` sont vides (`tracked_time_s` à 0, le reste à `null`), `ball_y` vide, `sample_seconds` à `null`. |

### Affichage
Le momentum et le radar sont dessinés par le front (`frontend/src/components/Charts.jsx`) à partir de ce rapport. Le momentum utilise `ball_y` : une balle côté positif de y indique une pression de l'équipe bleue. Le radar compare les joueurs sur la vitesse moyenne, le boost moyen, `supersonic_pct`, `first_man_pct` et `behind_ball_pct`, chaque axe étant ramené au meilleur joueur de la partie.

### Périmètre et limites
- Les stats détaillées sont calculées à chaque appel, à partir de `stats.json` et `map.json`. Rien n'est stocké en plus.
- Pas de modèle de voiture, ni d'événements datés (buts, tirs, démolitions avec auteur et victime) : la Timeline n'est pas couverte.
- Pas de route pour lister les parties déjà importées.
