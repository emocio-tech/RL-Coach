# Replay du match

## Résumé fonctionnel
L'écran « Replay » rejoue une partie importée en 3D : terrain, balle et voitures de tous les joueurs, positionnés et orientés comme dans le replay. Le front récupère les trajectoires auprès du back, puis anime la scène dans le navigateur. L'utilisateur lance, met en pause et déplace la lecture, change la vitesse (de ×0,25 à ×4) et choisit parmi cinq caméras : libre, diffusion, cam balle, poursuite et vue de dessus. Sous la rediffusion, la frise du match est celle décrite dans `docs/timeline-events.md` : cliquer sur un événement amène la rediffusion 3 secondes avant cet événement et la lance.

### Exemple concret
```bash
curl http://localhost:8000/api/replays/UF_Day_P_Online-2v2_900DE226.../tracks
```
Réponse `200` (valeurs illustratives, tronquées à trois échantillons) :
```json
{
  "id": "UF_Day_P_Online-2v2_900DE226...",
  "duration_seconds": 227.4,
  "players": [{
    "name": "Pseudo", "team": 1, "car": "Fennec",
    "track": {"t": [0.0, 0.2, 0.4],
              "x": [0.0, 35.2, null], "y": [-4608.0, -4510.3, null], "z": [17.0, 17.0, null],
              "speed": [0.0, 412.5, null], "boost": [85, 85, null],
              "qx": [0.0, 0.0, null], "qy": [0.0, 0.0, null],
              "qz": [0.7, 0.7, null], "qw": [0.7, 0.7, null]}
  }],
  "ball": {"t": [0.0, 0.2, 0.4], "x": [0.0, 0.0, 12.4], "y": [0.0, 0.0, 80.1], "z": [92.8, 92.8, 95.0]}
}
```
Quand le joueur Pseudo est démoli (valeurs `null`), sa voiture disparaît de la scène jusqu'à sa réapparition. En cliquant sur le but de Pseudo à 1:30 dans la frise, la rediffusion se place à 1:27 et se lance. Si la caméra est « Cam balle » ou « Poursuite », Pseudo est aussi sélectionné et la caméra le suit. Cliquer sur la carte d'un joueur le sélectionne et passe la caméra en « Cam balle » sur lui, même s'il était déjà sélectionné.

## Description technique

### Entrées
`GET /api/replays/{game_id}/tracks` (`backend/app/api/routes/replays.py`).

| Nom | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `game_id` | chemin | oui | Nom d'un dossier de `data/games/` respectant `GAME_ID_PATTERN` (`backend/app/services/storage.py`). |

### Sorties
`MatchTracks` (`backend/app/schemas/replay.py`), construit par `storage.get_game_tracks` à partir de `stats.json` et `map.json`, sans les heatmaps.

| Champ | Contenu |
|---|---|
| `id` | Identifiant de la partie. |
| `duration_seconds` | Durée du match d'après `stats.json`. |
| `players[]` | `name`, `team`, `car` (nom du modèle, ou `null`) et `track` : temps `t`, position `x`, `y`, `z`, `speed`, `boost` et quaternion d'orientation `qx`, `qy`, `qz`, `qw`, à 5 Hz. |
| `ball` | Temps `t` et position `x`, `y`, `z`. |

Une valeur `null` signifie que la position est inconnue (voiture démolie, par exemple).

### Erreurs
| Cas | Réponse |
|---|---|
| `game_id` invalide ou dossier inconnu | `404`, `{"detail": "Tracking data not found"}`. |
| `map.json` absent | `404`, même message. |
| `map.json` à l'ancien format (sans les orientations) | `404`, même message. Il faut réimporter le replay. |

Dans ces trois cas, le front affiche le message à la place de la rediffusion.

### Front
- Page : `frontend/src/pages/Match3DPage.jsx` (chargée à la demande, car `three` pèse environ 640 Ko). Elle gère l'interface : score, cartes des joueurs, commandes, caméras et frise.
- Moteur : `frontend/src/viewer3d/engine.js`. Il prépare les données, interpole les positions (Catmull-Rom, avec coupure sur les téléportations) et les orientations (slerp), puis anime la scène et les caméras.
- Décor et objets : `arena.js` (terrain, murs, buts, pads, tribunes, ciel), `car.js` (voitures) et `ball.js` (balle). Les constantes (dimensions, pads, hitbox par modèle) sont dans `constants.js`.
- Repère : le décor utilise les coordonnées de Rocket League (z vers le haut). Un groupe racine échange les axes y et z pour three.js.
- Frise : le composant `Timeline.jsx` accepte les options `onSelectEvent` (événements cliquables) et `currentTime` (curseur de lecture).

### Conventions de la scène
- L'équipe 0 (bleue) défend le côté négatif de y, l'équipe 1 (orange) le côté positif.
- Le décalage avant un événement est la constante `LEAD_IN` (3 s) de `Match3DPage.jsx`.
- Le score et le bandeau « BUT ! » viennent des événements de type `goal` de `GameReport.events`, dans la même base de temps que les trajectoires.

### Périmètre et limites
- Les voitures sont des modèles dessinés par le code, avec la hitbox de leur famille (Octane, Dominus, Plank, Breakout, Hybrid ou Merc). Un modèle inconnu utilise celle de l'Octane.
- Le terrain est le même pour toutes les cartes.
- L'état des pads de boost (récupéré ou non) n'est pas affiché, car les données ne le contiennent pas.
- La rotation de la balle est estimée à partir de son déplacement, car elle n'est pas dans les données.
- Pas de test automatique de la page elle-même (Vitest ne couvre que des utilitaires, dont `playerOrder.js`) ; voir `docs/replay-improvements.md`.
