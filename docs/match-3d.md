# Replay du match

## Résumé fonctionnel
L'écran « Replay » rejoue une partie importée en 3D : terrain, balle et voitures de tous les joueurs, positionnés et orientés comme dans le replay. Le front récupère les trajectoires auprès du back, puis anime la scène dans le navigateur. Quand un joueur ramasse un boost pad, le pad clignote brièvement puis s'éteint, et il se rallume avec un petit flash quand le boost est de nouveau disponible. Quand un but est marqué, la balle disparaît et une explosion (étincelles, flash et onde de choc) aux couleurs de l'équipe qui gagne le point se déclenche à l'endroit du but ; la balle réapparaît quand elle revient en jeu, au coup d'envoi. Quand une voiture est démolie, elle disparaît jusqu'à sa réapparition (sa carte joueur affiche alors « · démoli ») et une explosion rouge, plus petite que celle des buts, se déclenche à l'endroit de la démolition. L'utilisateur lance, met en pause et déplace la lecture, change la vitesse (de ×0,25 à ×4) et choisit parmi cinq caméras : libre, diffusion, cam balle, poursuite et vue de dessus. Sous la rediffusion, la frise du match est celle décrite dans `docs/timeline-events.md` : cliquer sur un événement amène la rediffusion 3 secondes avant cet événement et la lance.

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
  "ball": {"t": [0.0, 0.2, 0.4], "x": [0.0, 0.0, 12.4], "y": [0.0, 0.0, 80.1], "z": [92.8, 92.8, 95.0]},
  "pads": [{"x": 0.0, "y": -4240.0, "big": false, "pickups": [{"t": 12.4, "back": 16.4}, {"t": 80.0, "back": null}]}]
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
| `pads[]` | Pads de boost localisés : `x`, `y` (position standard du pad), `big` (grand pad) et `pickups[]`, la liste triée des ramassages : `t` (secondes depuis le début du replay, comme `track.t`) et `back` (instant où le pad est de nouveau disponible, ou `null` s'il ne l'est pas avant le ramassage suivant ou la fin). Liste vide pour une partie importée avant cette fonction : un nouvel import d'un match déjà stocké ne réécrit rien (voir `replay-upload.md`), donc pour avoir les pads animés il faut d'abord supprimer le dossier du match dans `data/games/`, puis réimporter le replay. |

`pads` vient de `map.json` (`MapFile.pads`) ; son absence dans un ancien `map.json` donne une liste vide, sans erreur. Une valeur `null` signifie que la position est inconnue (voiture démolie, par exemple).

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
- Pads : `arena.js` crée un matériau par pad et expose ses poignées (`buildArena()` retourne `{ group, pads }`). `padState.js` (sans import de `three`) contient `padStateAt(pickups, t)`, fonction pure qui donne `{ intensity }`, le facteur appliqué à l'émissivité (et à l'opacité de la sphère des grands pads) d'origine, et `matchPads`, qui associe chaque pad des données au pad du décor le plus proche (tolérance 50 uu). `engine.js` applique `padStateAt` à chaque image : 3 éclats pendant 0,5 s après le ramassage, éteint (émissivité à 0,02 et couleur diffuse assombrie à 15 %) jusqu'à `back`, puis flash de rallumage (0,02, 1,6 puis 1 sur 0,35 s). Un pad du décor sans données reste allumé. L'état ne dépend que du temps, donc les retours en arrière et le rejeu donnent le même résultat.
- Localisation des pads (back) : les acteurs pad n'ont pas de position dans le replay. `backend/app/services/pads.py` prend, pour chaque pad, la médiane des positions (x, y) des voitures qui l'ont ramassé, puis fait une assignation globale optimale (algorithme hongrois) vers les 34 pads standard (`STANDARD_PADS`, mêmes valeurs que `BIG_PADS` et `SMALL_PADS` de `constants.js`). Un pad sans position ou assigné à plus de 900 uu est ignoré. Les ramassages viennent de `_State._on_pickup` (`stats.py`), l'instant `back` de l'événement « pad de nouveau disponible » (`picked_up == 255`).
- Explosion de but : `goalFx.js` (sans import de `three`) contient la logique pure, `engine.js` le rendu. `buildGoalWindows(goals, ballTrack)` reçoit les buts `[{ t }]` (`Match3DPage.jsx` passe `seconds` des événements `goal` via `engine.setGoals`, sans reconstruire le moteur) et les trajectoires BRUTES de la balle (avant le remplissage des trous de `fillHoles`). Pour chaque but elle donne `{ t, team, resume, origin }` : `origin` est la position de la balle à l'échantillon le plus proche (z au moins 60 uu), `team` l'équipe qui gagne le point et `resume` l'instant où la balle est de nouveau en jeu (premier échantillon brut après le but où elle est `null` ou à plus de 50 uu de l'origine en x, y ; sinon la fin du match ; borné à l'instant du but suivant). `goalFxAt(windows, t)` (recherche binaire du dernier but passé, sans état) renvoie `null` ou `{ goal, age, progress, ballHidden }` : `ballHidden` vaut vrai de `goal.t` à `goal.resume`, l'effet visuel dure `FX_DURATION` (1,8 s) et `progress` va de 0 à 1. `makeParticles(count, seed)` (PRNG mulberry32) et `particlePosition` donnent des étincelles déterministes. `engine.js` crée une seule fois un `THREE.Points` de 200 étincelles (matériau additif, couleur HDR pour passer le seuil du bloom), une sphère de flash (0,25 s) et une sphère d'onde de choc, sans lumière ponctuelle ni allocation par image ; pendant `ballHidden`, la balle et sa traînée sont masquées.
- Explosion de démolition : `demoFx.js` (sans import de `three`) contient la logique pure, `engine.js` le rendu. `buildDemoWindows(demos, playerTracks)` reçoit les démolitions `[{ t, victim }]` (`Match3DPage.jsx` passe `seconds` et `victim` des événements `demolition` via `engine.setDemolitions`, sans reconstruire le moteur) et les trajectoires BRUTES des joueurs (`name`, `t`, `x`, `y`, `z`, `speed`, avant `fillHoles`, conservées par `engine.js`). Pour chaque démolition elle donne, par victime, `{ t, resume, origin }` triés par `t`. `origin` est la position de la voiture au premier échantillon dont la vitesse est `null` et la position connue dans `[t − 0,4 s ; t + 1,0 s]` (la voiture reste figée après l'impact), sinon l'échantillon à position connue le plus proche de `t` ; z est borné à 30 uu au minimum. `resume` est l'instant du premier échantillon suivant dont la vitesse ET la position sont connues (réapparition), à défaut `t + 3 s` (`DEMO_RESPAWN_FALLBACK`), et il est borné à la démolition suivante de la même victime. Une victime inconnue ou sans position exploitable est ignorée. `demoFxAt(windows, victim, t)` (recherche binaire, sans état) renvoie `null` ou `{ demo, age, progress, carHidden }` : `carHidden` vaut vrai de `demo.t` à `demo.resume`, l'effet dure `DEMO_FX_DURATION` (1 s) et `progress` va de 0 à 1. `engine.js` crée une seule fois par voiture 60 étincelles (`THREE.Points`, même texture que celle du but, partagée entre les voitures), un flash (0,15 s) et une petite onde de choc, en rouge HDR (`0xff2a2a`, ×3), sans lumière ponctuelle ni allocation par image. Les étincelles réutilisent `particlePosition` avec l'option `{ duration, scale, gravity }` (`DEMO_SCALE` = 0,3 de la distance de celles du but ; sans option, la sortie de `particlePosition` est inchangée). Pendant `carHidden`, la voiture (et donc son étiquette), son anneau de sélection et sa traînée sont masqués, et l'état `visible` remonté à la page tient compte de cette période (carte « · démoli »).
- Frise : le composant `Timeline.jsx` accepte les options `onSelectEvent` (événements cliquables) et `currentTime` (curseur de lecture).

### Conventions de la scène
- L'équipe 0 (bleue) défend le côté négatif de y, l'équipe 1 (orange) le côté positif.
- Le décalage avant un événement est la constante `LEAD_IN` (3 s) de `Match3DPage.jsx`.
- La couleur de l'explosion est celle de l'équipe qui gagne le point, déduite de la ligne de but franchie par la balle figée : y < 0 donne le point à l'équipe 1, y > 0 à l'équipe 0. L'équipe du buteur (`team` de l'événement) n'est pas utilisée, ce qui gère les buts contre son camp.
- Le score et le bandeau « BUT ! » viennent des événements de type `goal` de `GameReport.events`, dans la même base de temps que les trajectoires.

### Performances
- Rendu à la demande : `engine.js` ne recalcule la scène (`update`) et ne redessine que si la lecture est en cours, si l'état a été invalidé (`invalidate()`, appelée par `setTime`, `setPlaying`, `setRate`, `setCamera`, `setTarget`, `setLabels`, `setGoals`, `setDemolitions`, `setBloom`, le redimensionnement et l'évènement `change` d'OrbitControls), si le temps a changé ou si la caméra a bougé de plus de 1e-4 (position, quaternion, fov) par rapport à la dernière image dessinée. La caméra continue de s'animer tant qu'elle n'a pas convergé. `onTick` n'est émis que si le temps, l'état de lecture ou une invalidation le justifient, au plus toutes les 90 ms, avec une dernière émission à la pause, à l'arrêt ou après un déplacement. Conséquence : la flamme des voitures (aléatoire) est figée en pause.
- Anti-aliasing : `antialias` est désactivé sur le `WebGLRenderer`, car la scène passe par l'`EffectComposer` (cibles hors écran) et le MSAA du canvas ne s'y applique pas. Aucune autre passe d'anti-aliasing n'est ajoutée.
- Ombres : carte d'ombre de 2048 (au lieu de 4096), `bias`, `normalBias` et caméra d'ombre inchangés. Seuls la carrosserie, la cabine et le toit des voitures (et la balle) projettent une ombre, pas les détails ni les roues. `shadowMap.autoUpdate` est désactivé : la carte n'est recalculée (`needsUpdate`) que lorsque `update` s'exécute, jamais sur une image sautée.
- Voitures : `makeCarKit()` (`car.js`) crée une seule fois par moteur les matériaux (pneu, jante, branches, vitre, pièces sombres, phares, feux) et les géométries des roues, partagés par toutes les voitures ; la peinture reste propre à chaque voiture. Les 5 branches d'une roue sont fusionnées (une roue = 3 meshes au lieu de 7) et les phares, feux, pare-chocs, bas de caisse et aileron sont fusionnés en un mesh par matériau. Mesuré sur une Octane : 44 meshes et 35 matériaux avant, 21 meshes et 10 matériaux après (6 voitures : 264 meshes et 210 matériaux avant, 126 et 25 après).
- Scène statique : les matrices du décor (`arena.group`) et du ciel sont calculées une fois puis figées (`matrixAutoUpdate = false`). La balle, les voitures, les effets, les anneaux et les traînées ne sont pas figés.
- Résolution adaptative : `adaptiveRatio.js` (sans import de `three`) démarre au ratio de pixels actuel (au plus 2) et, si la moyenne du temps d'image sur 90 images dépasse 28 ms, passe au palier inférieur parmi 2, 1,5, 1,25 et 1. Les 30 premières images, les images de plus de 250 ms et les valeurs non finies sont ignorées ; seules les images dessinées consécutivement en lecture sont mesurées. Limite : elle ne remonte jamais, même si la machine redevient disponible.
- Limites : les gains n'ont pas été mesurés (pas de FPS relevés), le rendu n'a pas été vérifié visuellement, et les ombres sont un peu plus floues qu'à 4096.
- Tests : `adaptiveRatio.test.js` (Vitest) couvre le contrôleur de résolution ; le reste (rendu à la demande, ombres, fusion des meshes, scène figée) n'est vérifié que par `npm test` et `npm run build`, sans test automatique du rendu.

### Périmètre et limites
- Les voitures sont des modèles dessinés par le code, avec la hitbox de leur famille (Octane, Dominus, Plank, Breakout, Hybrid ou Merc). Un modèle inconnu utilise celle de l'Octane.
- Le terrain est le même pour toutes les cartes.
- Les pads ne sont animés que pour le terrain standard (34 pads) ; les autres dispositions (Hoops, Dropshot, stades à pads différents) ne sont pas gérées. Un pad ramassé sans événement de rallumage (`back` à `null`) reste éteint jusqu'à la fin ; le temps de rallumage n'est jamais estimé. Les parties déjà importées n'ont pas de pads (le `.replay` n'est pas conservé).
- La rotation de la balle est estimée à partir de son déplacement, car elle n'est pas dans les données.
- L'explosion dure 1,8 s de temps de match : elle est donc plus lente à ×0,25 et plus rapide à ×4. Son rendu (taille, luminosité, bloom) n'a pas été vérifié visuellement. Elle suppose la disposition standard (lignes de but à |y| ≈ 5200). La balle n'est masquée qu'entre le but et sa reprise détectée dans les données à 5 Hz (3,7 à 7,6 s sur le match de référence).
- Tests de l'explosion : `goalFx.test.js` (Vitest) couvre `buildGoalWindows` (équipe déduite de y, reprise, fin du match, origine, piste vide), `goalFxAt` (avant, pendant, après l'effet, après la reprise, retour en arrière, buts rapprochés) et les étincelles (déterminisme, absence de NaN) ; le rendu `three.js` n'est pas testé.
- Explosion de démolition : elle dure 1 s de temps de match (plus lente à ×0,25, plus rapide à ×4). Elle repose sur l'heuristique « vitesse `null` = voiture figée après l'impact », vérifiée sur 5 démolitions réelles (2 replays) : vitesse `null` 0,1 à 0,2 s après l'impact, réapparition 3,1 à 3,7 s après (le délai standard est d'environ 3 s, la précision est celle des 5 Hz). Si les données n'ont pas de vitesse `null` près de la démolition, l'origine est l'échantillon connu le plus proche ; si la réapparition n'apparaît pas, la voiture revient 3 s après. Le rendu (taille, luminosité, bloom) n'a pas été vérifié visuellement.
- Tests de la démolition : `demoFx.test.js` (Vitest) couvre `buildDemoWindows` (origine, repli, réapparition, repli à 3 s, victimes simultanées, deux démolitions de la même victime, victime sans piste) et `demoFxAt` (voiture masquée jusqu'à la réapparition, effet terminé voiture encore masquée, retour en arrière, `progress` borné) ; `goalFx.test.js` couvre la compatibilité et les options de `particlePosition`. Le rendu `three.js` n'est pas testé.
- Pas de test automatique de la page elle-même (Vitest ne couvre que des utilitaires, dont `playerOrder.js`, `padState.js`, `goalFx.js` et `demoFx.js`) ; voir `docs/replay-improvements.md`.
