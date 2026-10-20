# Upload d'un replay vers un JSON

## Résumé fonctionnel
L'utilisateur envoie un fichier `.replay` de Rocket League depuis l'interface. Le back le décode avec l'outil externe `rrrocket` et en tire un JSON compact : infos du match, stats de chaque joueur, heatmap de position par joueur et trajectoires (joueurs et balle) échantillonnées à 5 Hz. Le JSON est stocké sous un identifiant unique ; le `.replay` d'origine n'est jamais conservé. Pour l'instant, le front affiche seulement l'identifiant du replay importé.

### Exemple
```bash
curl -X POST http://localhost:8000/api/replays -F "file=@match.replay"
```
Réponse `201` :
```json
{"id": "3f2a9c1e5b7d4a08b6c1d2e3f4a5b6c7"}
```
Le fichier `data/games/3f2a9c1e5b7d4a08b6c1d2e3f4a5b6c7.json` est créé (valeurs illustratives, tronquées) :
```json
{
  "id": "3f2a9c1e...",
  "original_filename": "match.replay",
  "match": {"match_type": "Online", "team_size": 3, "team0_score": 4,
            "team1_score": 2, "duration_seconds": 312.0,
            "map_name": "Stadium_P", "date": "2026-10-01 20-14-05"},
  "players": [{
    "stats": {"name": "Pseudo", "team": 0, "score": 512, "goals": 2,
              "assists": 1, "saves": 3, "shots": 5},
    "heatmap": {"x_min": -4096.0, "x_max": 4096.0, "y_min": -5120.0,
                "y_max": 5120.0, "counts": [[0, 0, 3, "… 26 colonnes"], "… 20 lignes"]},
    "track": {"t": [0.0, 0.2, 0.4], "x": [0.0, 35.2, null],
              "y": [-4608.0, -4510.3, null], "z": [17.0, 17.0, null],
              "speed": [0.0, 412.5, null], "boost": [33, 33, null]}
  }],
  "ball": {"t": [0.0, 0.2, 0.4], "x": [0.0, 0.0, 12.4],
           "y": [0.0, 0.0, 80.1], "z": [92.8, 92.8, 95.0]}
}
```

## Description technique

### Entrées
`POST /api/replays` en multipart (`backend/app/api/routes/replays.py`).

| Nom | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `file` | fichier | oui | Nom finissant par `.replay` (insensible à la casse), non vide, 50 Mo maximum (`MAX_UPLOAD_BYTES`). |

### Sorties
- Réponse `201` : `{"id": "<uuid4 hex>"}` (`UploadResult`).
- Fichier `data/games/<uuid>.json` (`GAMES_DIR`), écrit via un `.tmp` puis `os.replace` ; le `.tmp` est supprimé en cas d'échec. Le dossier est créé à la volée.
- Le `.replay` est copié dans un fichier temporaire de l'OS pour `rrrocket` (`rrrocket -n <fichier>`, timeout 60 s), supprimé dans un `finally`. Il n'est jamais écrit dans `data/`.

### Format du JSON (`ReplayData`)
- `id`, `original_filename` : nom nettoyé (basename, caractères de contrôle retirés, 255 caractères maximum).
- `match` : `match_type`, `team_size`, `team0_score`, `team1_score`, `duration_seconds`, `map_name`, `date` (tous peuvent être `null`).
- `players[]` : un élément par entrée de `PlayerStats` du replay.
  - `stats` : `name`, `team`, `score`, `goals`, `assists` (= passes), `saves`, `shots` (0 si absent).
  - `heatmap` : bornes ±4096 en x et ±5120 en y, `counts[20][26]` indexé `counts[ix][iy]`. Chaque unité représente un échantillon (0,2 s).
  - `track` : tableaux colonnaires de même longueur `t`, `x`, `y`, `z`, `speed`, `boost`.
- `ball` : `t`, `x`, `y`, `z`, avec les mêmes `t` que les joueurs.

**Échantillonnage** : `FRAME_SAMPLE_HZ = 5` (pas de 0,2 s), `t` en secondes depuis la première frame. Une valeur est `null` quand la voiture ou la balle n'a pas de position connue.
**Unités** : positions en unités du jeu (arrondies à 0,1) ; `speed` = norme de la vitesse linéaire (unités du jeu par seconde) ; `boost` entier de 0 à 100.

### Erreurs
| Condition | Résultat |
|---|---|
| Extension autre que `.replay` | `400` |
| Fichier > 50 Mo | `400` |
| Fichier vide | `400` |
| `rrrocket` en erreur, timeout ou JSON invalide | `400` |
| Pas de `PlayerStats` ou pas de frames réseau | `400` |
| Binaire `rrrocket` introuvable | `500` |

### Configuration
`RRROCKET_PATH` (variable d'environnement) surcharge `backend/bin/rrrocket.exe`. Installation : voir `README.md`.

### Périmètre et limites
- Pas de route de lecture ni de liste : le front n'affiche que l'id importé.
- Les joueurs sont associés à leurs trajectoires par leur nom : deux joueurs homonymes entrent en collision.
- Pas de déduplication : un même replay envoyé deux fois donne deux ids.
- Le fichier est lu en mémoire (par blocs de 1 Mo) et le parsing s'exécute dans un thread.
