# Import d'un replay vers un dossier de JSON

## Résumé fonctionnel
L'utilisateur envoie un fichier `.replay` de Rocket League depuis l'interface. Le back le décode avec l'outil externe `rrrocket`, puis écrit dans `data/games/` un dossier propre au match. Son nom reprend le stade, le mode de jeu et l'id du replay. Ce dossier contient deux fichiers : `stats.json` (infos du match, stats de chaque joueur, démolitions, boost) et `map.json` (heatmap, trajectoires des joueurs et de la balle à 5 Hz). Pour chaque joueur, la trajectoire contient la position, la vitesse, le boost et l'orientation de la voiture (quaternion). Le `.replay` d'origine n'est jamais conservé. La réponse contient le nom du dossier final, qui sert d'identifiant. Pour l'instant, le front affiche seulement cet identifiant.

### Exemple concret
```bash
curl -X POST http://localhost:8000/api/replays -F "file=@match.replay"
```
Réponse `201` (le replay est un 2v2 en ligne sur le stade `UF_Day_P`) :
```json
{"id": "UF_Day_P_Online-2v2_900DE226..."}
```
Le dossier `data/games/UF_Day_P_Online-2v2_900DE226...` est créé. Il contient `stats.json` et `map.json`. Les valeurs ci-dessous sont illustratives et tronquées.

`stats.json` :
```json
{
  "replay_id": "900DE226...",
  "original_filename": "match.replay",
  "match": {"match_type": "Online", "team_size": 2, "team0_score": 3,
            "team1_score": 1, "duration_seconds": 312.0,
            "map_name": "UF_Day_P", "date": "2026-10-01 20-14-05"},
  "players": [{
    "name": "Pseudo", "team": 0, "score": 512, "goals": 2,
    "assists": 1, "saves": 3, "shots": 5,
    "demolitions": {"inflicted": 4, "received": 2},
    "boost": {"small_pads": 38, "big_pads": 6,
              "consumed_per_minute": 312.4, "average_level": 41.7}
  }]
}
```

`map.json` :
```json
{
  "replay_id": "900DE226...",
  "players": [{
    "name": "Pseudo", "team": 0,
    "heatmap": {"x_min": -4096.0, "x_max": 4096.0, "y_min": -5120.0,
                "y_max": 5120.0, "counts": [[0, 0, 3, "… 26 colonnes"], "… 20 lignes"]},
    "track": {"t": [0.0, 0.2, 0.4], "x": [0.0, 35.2, null],
              "y": [-4608.0, -4510.3, null], "z": [17.0, 17.0, null],
              "speed": [0.0, 412.5, null], "boost": [33, 33, null],
              "qx": [0.0, -0.0034, null], "qy": [0.0, 0.0021, null],
              "qz": [0.7071, 0.7068, null], "qw": [0.7071, 0.7074, null]}
  }],
  "ball": {"t": [0.0, 0.2, 0.4], "x": [0.0, 0.0, 12.4],
           "y": [0.0, 0.0, 80.1], "z": [92.8, 92.8, 95.0]}
}
```
Si l'on réimporte le même replay, rien n'est écrit : la réponse `201` renvoie le même `{"id": "UF_Day_P_Online-2v2_900DE226..."}`, le dossier et son `stats.json` restent inchangés (date d'import comprise). Le front ouvre la Vue d'ensemble comme pour un nouvel import.

## Description technique

### Entrées
`POST /api/replays` en multipart (`backend/app/api/routes/replays.py`).

| Nom | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `file` | fichier | oui | Nom finissant par `.replay` (insensible à la casse), non vide, 50 Mo maximum (`MAX_UPLOAD_BYTES`, `backend/app/config.py`). |

### Sorties
- Réponse `201` : `{"id": "<nom du dossier>"}` (`UploadResult`). Pour un replay déjà importé, c'est le nom du dossier existant et rien n'est écrit (voir « Déduplication »). Pour un nouveau replay, le nom peut porter un suffixe `_N` si un autre match occupe déjà ce nom (voir ci-dessous).
- Dossier `data/games/<nom>/` (`GAMES_DIR`) contenant `stats.json` (`STATS_FILENAME`) et `map.json` (`MAP_FILENAME`). Le dossier `games` est créé à la volée.
- Écriture atomique : les deux fichiers sont d'abord écrits dans un dossier temporaire `data/games/.tmp-<uuid>`, puis ce dossier est renommé en nom final. En cas d'échec, le dossier temporaire est supprimé.
- Le `.replay` est copié dans un fichier temporaire de l'OS pour `rrrocket` (`rrrocket -n <fichier>`, timeout 60 s), supprimé ensuite. Il n'est jamais écrit dans `data/`.

#### Nom du dossier
Format : `<MapName>_<MatchType>-<N>v<N>_<Id>` (`backend/app/services/storage.py`).
- **MapName**, **MatchType** et **Id** viennent des propriétés du replay (`MapName`, `MatchType`, `Id`).
- **Nettoyage** (`_sanitize`) :
  - Tout caractère hors `A-Za-z0-9._-` devient `_`.
  - Les `.` en début et fin de partie sont retirés.
  - Chaque partie est limitée à 64 caractères.
- **Valeurs de repli** :
  - `UnknownMap` si `MapName` est absent ou vide.
  - `Unknown` si `MatchType` est absent ou vide.
  - `replay` si l'Id nettoyé est vide.
- **Taille d'équipe** : la partie `-<N>v<N>` n'existe que si `TeamSize` est un entier. Elle est omise sinon.
- **Id absent** : un `uuid4().hex` est généré. Le même id est écrit dans le champ `replay_id` des deux fichiers. Cet id n'est pas nettoyé, contrairement à la partie du nom de dossier.
- **Collision** : si le dossier existe déjà pour un autre match, le suffixe `_2`, `_3`… est ajouté, jusqu'à 1000 tentatives. Le renommage sert de test de disponibilité. Si le nom reste occupé après 1000 tentatives, une `OSError` est levée. Un chemin sortant de `GAMES_DIR` provoque aussi une `OSError`. Le suffixe ne sert donc plus aux réimports, seulement à deux matchs différents qui donnent le même nom (ex. `Id` différents mais identiques une fois nettoyés par `_sanitize`).

#### Déduplication
`save_replay` appelle `_store_match` (`backend/app/services/storage.py`), qui s'exécute dans un thread sous le verrou `_STORE_LOCK`.
- **Clé** : `properties["Id"]` du replay, comparé au `replay_id` brut de `stats.json` (non nettoyé).
- **Replay déjà présent** : `_find_existing_folder` renvoie le dossier trouvé. La route répond `201` avec son nom, sans créer de dossier ni toucher à `stats.json` (la date d'import, mtime de `stats.json`, reste inchangée). `rrrocket` a quand même été exécuté, car le parsing a lieu avant la recherche.
- **Recherche** : sur le disque, dans l'ordre alphabétique des noms de dossier : le dossier sans suffixe passe avant `_2`, `_3`. Les dossiers `.tmp-*`, les fichiers et les dossiers sans `stats.json` lisible ou valide sont ignorés.
- **`map.json` manquant** : n'empêche pas la détection du doublon, seul `stats.json` compte.
- **Replay sans `Id`** (`uuid4` généré) : jamais dédupliqué, chaque envoi crée un dossier.
- **Concurrence** : le verrou est en mémoire, il protège les imports simultanés d'un même processus uniquement.

### Contenu de `stats.json` (`StatsFile`)
- `replay_id` et `original_filename`. Ce dernier est nettoyé : basename, caractères de contrôle retirés, 255 caractères maximum.
- `match` : `match_type`, `team_size`, `team0_score`, `team1_score`, `duration_seconds`, `map_name`, `date`. Chaque champ peut être `null`, sauf les deux scores : le replay omet la propriété d'une équipe qui n'a pas marqué, elle vaut alors `0`.
- `players[]` : un élément par entrée `PlayerStats` du replay.
  - Stats de base : `name`, `team`, `score`, `goals`, `assists` (= passes), `saves`, `shots` (0 si absent).
  - `demolitions` : `inflicted`, `received`.
  - `boost` : `small_pads`, `big_pads`, `consumed_per_minute`, `average_level`.

#### Définitions
- **Démolitions reçues** (`received`) :
  - Elles viennent des événements de démolition réseau (`ReplicatedDemolishExtended` / `ReplicatedDemolish`).
  - Les auto-démolitions sont ignorées.
  - Les événements d'un même couple attaquant/victime espacés de moins de 3 s sont dédoublonnés (`DEMOLISH_DEDUP_WINDOW`, `backend/app/services/stats.py`).
- **Démolitions infligées** (`inflicted`) :
  - Elles viennent en priorité du compteur `TAGame.PRI_TA:MatchDemolishes` du joueur.
  - Sans ce compteur, on utilise le nombre d'événements dédoublonnés où il est attaquant.
- **Petits et gros pads** (`_State._on_pickup` et `_State.finalize_pads`, `backend/app/services/stats.py`) :
  - **Identité du pad** : chaque pad est identifié par le nom d'objet du pad (objet contenant `VehiclePickup_Boost`). Cette identité est conservée même si le replay recrée l'acteur. Sans nom de pad, l'identité retombe sur l'identifiant d'acteur.
  - **Dédoublonnage des ramassages** : le replay est un flux avec des keyframes environ toutes les 10 s, qui ré-annoncent l'état courant des acteurs. Un même ramassage ré-émis n'est donc compté qu'une fois. Le dédoublonnage se fait par pad sur le couple (`picked_up`, `instigator`). Il est réinitialisé quand le pad redevient disponible (événement `picked_up = 255`, `PICKUP_UNAVAILABLE`).
  - **Rattachement** : chaque ramassage est attribué au joueur propriétaire de la voiture qui l'a pris (`instigator`). Un ramassage dont la voiture n'est pas rattachée à un joueur est ignoré.
  - **Délai de réapparition** : délai entre le premier ramassage et l'événement « pad de nouveau disponible ». Il est enregistré par pad.
  - **Classification par pad, à la fin du replay** : un pad est gros si ses délais ≥ 7,0 s (`BIG_PAD_MIN_RESPAWN`) sont plus nombreux que ses délais < 7,0 s. Un petit pad réapparaît en 4 s, un gros en environ 10 s. Sinon il est petit : cela inclut un pad sans délai observé ou une égalité. Tous les ramassages du pad prennent cette classe.
  - **Ordres de grandeur** mesurés sur des replays réels : un 2v2 de 227 s donne 301 ramassages, dont 68 sur les 6 gros pads. Un match à 6 joueurs en donne 579, dont 127.
- **Boost consommé par minute** (`consumed_per_minute`) :
  - C'est la somme des baisses de niveau de boost (en % du réservoir), divisée par `duration_seconds / 60`.
  - Le résultat est `null` si la durée est absente ou nulle.
- **Niveau moyen** (`average_level`) :
  - C'est le niveau de boost, en % du réservoir (0 à 100), pondéré par le temps (`delta` des frames) sur les périodes où il est connu.
  - Il est arrondi à 0,1 et vaut `null` si aucune période n'est connue.

### Contenu de `map.json` (`MapFile`)
- `replay_id`.
- `players[]` : `name`, `team`, `heatmap`, `track`.
  - `heatmap` : bornes ±4096 en x et ±5120 en y, `counts[20][26]` indexé `counts[ix][iy]`. Chaque unité représente un échantillon de 0,2 s. Les positions hors bornes sont ramenées dans la cellule de bord. Les échantillons où le ballon est immobile depuis au moins 2 s (compte à rebours de l'engagement, ballon figé dans la cage après un but) ne sont pas comptés ; les `track` gardent tous les échantillons.
  - `track` : tableaux colonnaires de même longueur `t`, `x`, `y`, `z`, `speed`, `boost`, `qx`, `qy`, `qz`, `qw` (`PlayerTrack`, `backend/app/schemas/replay.py`).
    - `qx`, `qy`, `qz`, `qw` donnent l'orientation de la voiture : un quaternion unitaire dans le repère du jeu, avec la composante `w` en dernier.
    - Ces valeurs sont `null` quand la voiture est inconnue ou n'a pas de rotation.
    - Elles sont renseignées même quand la voiture est immobile ou endormie, alors que `speed` peut être `null`.
- `ball` : `t`, `x`, `y`, `z`, avec les mêmes `t` que les joueurs.
- `ball_heatmap` : même format que la `heatmap` d'un joueur, calculée à partir de `ball.x` et `ball.y`. Ce champ est optionnel : les fichiers importés avant son ajout ne l'ont pas et restent valides. `GET /api/replays/{game_id}/heatmaps` relit alors les valeurs stockées, ou recalcule toutes les heatmaps depuis les trajectoires à chaque appel si `ball_heatmap` est absent (voir `docs/heatmaps-page.md`).
- **Échantillonnage** : `FRAME_SAMPLE_HZ = 5` (pas de 0,2 s). `t` est en secondes depuis la première frame. Une valeur vaut `null` quand la voiture ou la balle n'a pas de position connue.
- **Unités** :
  - Les positions sont en unités du jeu, arrondies à 0,1.
  - `speed` est la norme de la vitesse linéaire, en unités du jeu par seconde.
  - `boost` est un entier de 0 à 100.
  - `qx`, `qy`, `qz`, `qw` sont des composantes de quaternion sans unité, arrondies à 4 décimales.
- **Taille indicative** : environ 0,4 Mo pour un 2v2 de 4 min (mesuré à 0,43 Mo sur un replay de 227 s).
- Les positions et orientations des joueurs ne figurent que dans `map.json`.

### Erreurs
| Condition | Résultat |
|---|---|
| Extension autre que `.replay` | `400` |
| Fichier > 50 Mo | `400` |
| Fichier vide | `400` |
| `rrrocket` en erreur, timeout ou JSON invalide | `400` |
| Pas de `PlayerStats` ou pas de frames réseau | `400` |
| Champ `file` absent | `422` (validation FastAPI) |
| Binaire `rrrocket` introuvable | `500` |
| Échec d'écriture ou plus de 1000 collisions de nom (`OSError`) | non interceptée par la route, donc `500` |

Dans tous les cas d'erreur, aucun dossier définitif n'est laissé : le dossier temporaire est supprimé.

### Configuration
`RRROCKET_PATH` (variable d'environnement) surcharge `backend/bin/rrrocket.exe`. Installation : voir `README.md`. Les autres constantes sont dans `backend/app/config.py` : `GAMES_DIR`, `STATS_FILENAME`, `MAP_FILENAME`, `FRAME_SAMPLE_HZ`, `RRROCKET_TIMEOUT_SECONDS`.

### Périmètre et limites
- **Inclus** :
  - Import d'un `.replay` vers un dossier `stats.json` + `map.json`.
  - Nommage du dossier avec gestion des collisions.
  - Déduplication des réimports par `Id` de replay.
  - Stats de base, démolitions, boost, heatmap, trajectoires (position, vitesse, boost, orientation) et balle.
- **Exclu** :
  - Aucune route de lecture ni de liste : le front affiche seulement l'id importé.
  - Aucune migration des anciens fichiers `data/games/<uuid>.json`. Ils restent tels quels et ne sont pas lus.
  - Pas de nettoyage des doublons déjà présents (dossiers `X_2`, `X_3` créés avant la déduplication) : le premier dossier dans l'ordre alphabétique est celui renvoyé au réimport.
  - Pas de déduplication par hash du contenu, pas de protection multi-workers, pas de message « déjà importé » dans le front.
  - Pas d'orientation pour la balle.
- **Limites** :
  - La classification petit/gros pad est une heuristique statistique par pad, fondée sur les temps de réapparition, pas sur le type réel de pad. Un pad jamais revu à l'état disponible (aucun délai observé) est classé petit.
  - La map est supposée avoir des pads identifiables par leur nom d'objet. Sans nom de pad, l'identité retombe sur l'identifiant d'acteur, ce qui est moins stable si le replay recrée l'acteur.
  - Les démolitions sont dédoublonnées sur 3 s. Deux vraies démolitions du même attaquant sur la même victime en moins de 3 s sont comptées une seule fois dans `received`. `inflicted` vient en priorité du compteur `MatchDemolishes`.
  - Les joueurs sont associés à leurs voitures, boosts et démolitions par leur nom. Deux joueurs homonymes entrent en collision : ce cas n'est pas géré.
  - La recherche de doublon parcourt tous les dossiers de `data/games/` et relit chaque `stats.json` à chaque import avec `Id` : le coût croît avec le nombre de matchs.
  - Le fichier est lu en mémoire (par blocs de 1 Mo) et le parsing s'exécute dans un thread.
- **Dépendances** : binaire `rrrocket`, FastAPI/Starlette (`run_in_threadpool`), Pydantic. Services `parser`, `stats` et `storage` (`backend/app/services/`).
