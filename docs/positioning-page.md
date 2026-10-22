# Page Positionnement : position de la balle et distance à la balle

## Résumé fonctionnel
La page « Positionnement » montre comment la partie s'est déroulée dans l'espace. Un premier graphique indique où se trouvait la balle au fil du match, donc quelle équipe a mis la pression et à quels moments. Quand un joueur est sélectionné dans le menu du header, sa position est superposée à celle de la balle. Un second graphique, réservé au joueur sélectionné, montre sa distance à la balle. Elle sert à repérer les moments où il était trop loin de l'action, ou au contraire collé à elle. Ces graphiques remplacent le bloc « Momentum » de la Vue d'ensemble, qui a été retiré.

### Exemple concret
Tu importes un 2v2 de 227 s, puis tu ouvres « Positionnement » dans la sidebar (section « Déroulé »).

1. **Sans joueur sélectionné** : seul le bloc « Position de la balle » s'affiche. Il est suivi du message « Sélectionne un joueur dans le menu du header pour afficher sa position et sa distance à la balle. ». L'aire reste surtout orange (sous la ligne médiane) entre 1:00 et 2:00 : la balle est restée du côté orange, donc l'équipe bleue a mis la pression.
2. **Tu sélectionnes « Pseudo » (équipe bleue)** : une ligne blanche pointillée, la position de Pseudo, se superpose à l'aire. Une légende « Balle / Joueur : Pseudo · Équipe bleue » apparaît. Le bloc « Distance à la balle » s'ajoute en dessous.
3. **Lecture de la distance** : la courbe de Pseudo monte jusqu'à 4 000 vers 2:30, puis redescend sous 1 000. Son pic est à 3 480, donc l'axe va de 0 à 4 000 (graduations 0, 2 000 et 4 000). Pseudo est resté loin de la balle pendant une phase, puis est revenu dessus.
4. **Zoom** : tu molettes sur un graphique pour zoomer autour du pointeur, et tu glisses pour te déplacer dans le temps. Les deux graphiques restent alignés.

Les valeurs de cet exemple sont illustratives, elles ne viennent pas d'un vrai replay.

## Description technique

Le rapport servi par `GET /api/replays/{game_id}/stats` (champs, erreurs, mode sans `3dmatch.json`) est décrit dans `docs/replay-stats.md`. Ce document ne détaille que ce qui concerne la page : les deux séries ajoutées à `PlayerDetail` et les graphiques.

### Entrées

**Données du rapport utilisées par la page**

| Champ | Type | Obligatoire | Description / contraintes |
|---|---|---|---|
| `report.ball_y` | `list[float \| null]` | oui (peut être vide) | Position de la balle sur l'axe long (`backend/app/services/analysis.py`). Pas de graphique si moins de 2 éléments. |
| `report.sample_seconds` | `float \| null` | non | Pas de temps entre deux échantillons (0,2 s). |
| `players[].detail.y` | `list[float \| null]` | non | Position du joueur sur l'axe long, en unités Unreal (`backend/app/schemas/replay.py`). |
| `players[].detail.ball_distance` | `list[float \| null]` | non | Distance 3D joueur-balle, en unités Unreal (`backend/app/schemas/replay.py`). |
| `selectedPlayer` | `string \| null` | non | Nom du joueur choisi dans le header. Il est conservé entre les pages et remis à `null` à l'ouverture d'une partie (`frontend/src/App.jsx`). |

Les deux séries sont alignées sur les échantillons de la balle (`n_samples = len(ball.t)` dans `analysis.py`). Elles ont donc la même longueur que `ball_y` et le même axe de temps.

**Calcul des séries** (`backend/app/services/analysis.py`, fonction `_positioning`)
- `detail.y` : copie de `track.y` du joueur, `null` si l'échantillon n'existe pas dans la trajectoire. La valeur n'est pas inversée selon l'équipe, contrairement au calcul des zones.
- `detail.ball_distance` : `math.dist` entre la position du joueur et celle de la balle, en 3D (x, y, z), arrondie à 0,1. Un z `null` compte pour 0. `avg_ball_distance` est calculé sur les valeurs brutes de cette même série, avant arrondi.
- `ball_distance` vaut `null` quand la balle ou le joueur n'a pas de position (x ou y inconnu). Si la balle est inconnue, `detail.y` reste renseignée : les deux séries n'ont donc pas toujours les mêmes trous.

**Composants front**

| Élément | Rôle |
|---|---|
| `frontend/src/pages/PositioningPage.jsx` | Retrouve le joueur par nom, compose les deux blocs, gère les cas avec et sans joueur, et détient le zoom partagé. |
| `BallPositionChart` (`frontend/src/components/Charts.jsx`) | Aire de la balle, ligne pointillée du joueur, libellés « Côté bleu » / « Côté orange », légende cliquable. |
| `DistanceChart` (`frontend/src/components/Charts.jsx`) | Courbe et aire de la distance, axe gradué, légende. |
| `frontend/src/components/chartGeometry.js` | Fonctions pures (pas de JSX) : échelles, tracés, graduations de temps, calcul du zoom. Constantes partagées, donc graphiques alignés (`X0 = 96`, `X1 = 984`). |
| `frontend/src/components/useChartZoom.js` | Hook : molette (zoom autour du pointeur) et cliquer-glisser (défilement). |
| `App.jsx` et `Layout.jsx` | Route `positioning` et lien « Positionnement » dans la section « Déroulé ». |

### Sorties
Aucune écriture et aucun appel externe : la page est de l'affichage pur, en SVG (`role="img"` avec `aria-label`).

- **Sans joueur sélectionné** : titre « Positionnement », bloc « Position de la balle » (aire seule, sans légende), puis message d'invitation à sélectionner un joueur.
- **Avec joueur** : le bloc « Position de la balle » gagne la ligne pointillée et la légende « Balle / Joueur : <nom> · <équipe> ». Le bloc « Distance à la balle » s'ajoute, avec une pastille de la couleur de l'équipe, le nom et l'équipe.
- **Lecture de la position** : la ligne médiane est le milieu du terrain. L'aire bleue est au-dessus (y < 0), l'aire orange en dessous (y > 0). La hauteur est proportionnelle à `|y| / 5120`.
- **Axe de temps** : une graduation par minute entière (`0:00`, `1:00`…), identique sur les deux graphiques.

### Interactions
- **Légende du graphique de position** (avec un joueur sélectionné) : chaque entrée est un bouton (`aria-pressed`) qui masque ou réaffiche la balle ou le joueur. L'état est local au graphique. Sans joueur sélectionné, la légende n'existe pas et la balle est toujours affichée.
- **Zoom et défilement** : la molette zoome autour du pointeur, cliquer-glisser fait défiler. La portion visible (`view = { start, end }`, fractions de la partie) est un état de `PositioningPage`, partagé par les deux graphiques, donc toujours synchronisé. Le geste est géré par le hook `useChartZoom`, le calcul par des fonctions pures de `chartGeometry.js` (`zoomView`, `panView`, `clampView`, `timeFractionAt`, `panDelta`).
- **Graduations de temps** : une par minute sur la partie entière. Quand on zoome, le pas descend (30, 15, 10, 5, 2, 1 s) pour garder au moins 3 graduations visibles, et les libellés passent en `m:ss`.

### Erreurs et cas limites
| Condition | Comportement |
|---|---|
| `ball_y` de moins de 2 éléments (pas de `3dmatch.json`) | Position de la balle : « Pas de données de position pour cette partie. » |
| `ball_distance` vide ou entièrement `null` | Distance : même message. |
| `selectedPlayer` ne correspond à aucun joueur | Traité comme « aucun joueur sélectionné ». |
| Joueur absent de `3dmatch.json` (`detail.y` = `[]`) | La légende s'affiche, mais aucune ligne n'est tracée. |
| Durée totale nulle (1 seul échantillon) | Aucune graduation de temps. |

### Éléments surprenants

- **Convention d'axe : bleu en haut, pour tous les joueurs.** L'équipe 0 (bleue) défend le côté y négatif, représenté en haut. Plus une courbe est haute, plus elle est proche de la cage bleue. La ligne d'un joueur orange n'est pas retournée : pour lui, une ligne haute signifie qu'il est près de la cage bleue, donc loin de sa propre cage. Le joueur et la balle sont ainsi comparables dans le même repère. À ne pas confondre avec les zones « défensive/offensive » de `PlayerDetail`, qui sont, elles, relatives à l'équipe du joueur.
- **Distance en 3D et en unités Unreal.** La distance inclut la hauteur z (une balle en l'air éloigne le joueur) et n'est pas convertie en mètres. Elle est de même nature que `avg_ball_distance`.
- **Courbes interrompues aux données manquantes, sauf l'aire de la balle.**
  - La ligne du joueur et la courbe de distance sont coupées à chaque `null` : un tracé par suite de points consécutifs. Une suite d'un seul point n'est pas tracée, donc un échantillon isolé est invisible.
  - L'aire de la balle ne se coupe pas : les trous de `ball_y` sont comblés par la dernière valeur connue, ou 0 au départ (`fillGaps`). Une balle inconnue au début apparaît donc au milieu du terrain.
- **Échelle de distance arrondie au millier.** Le maximum de l'axe est `max(1000, plafond du pic au millier supérieur)`. Les graduations sont 0, max/2 et max, formatées en `fr-FR` (ex. `2 000`). L'échelle dépend du joueur : deux joueurs ne se comparent pas à l'œil sans lire l'axe. Un pic exactement égal à un millier ne change pas le maximum (3 000 donne 3 000).
- **La molette ne fait jamais défiler la page au survol d'un graphique.** Même quand la partie entière est affichée et qu'il n'y a plus rien à dézoomer, le geste est absorbé par le graphique. Pour faire défiler la page, il faut placer le pointeur hors des graphiques.
- **Durée minimale visible.** Le zoom s'arrête à 2 % de la partie (`MIN_VIEW_SPAN`).
- **Position écrêtée.** Les valeurs de y sont ramenées dans ±5120 pour le dessin. Une balle dans le fond d'une cage atteint donc le bord du graphique. La constante est dupliquée dans `analysis.py` et `chartGeometry.js`.
- **Couleur de la courbe de distance.** Elle est fixée à `#5EEAD4`, indépendante de l'équipe. L'équipe est indiquée par la pastille du sous-titre.
- **Page Heatmaps séparée.** La page Heatmaps (dernière entrée de la section « Déroulé ») est décrite dans `docs/heatmaps-page.md`.

### Périmètre et limites
- **Inclus** :
  - Page « Positionnement » (route `positioning`, lien dans la sidebar).
  - Séries `detail.y` et `detail.ball_distance`.
  - `BallPositionChart`, `DistanceChart` et les helpers de `chartGeometry.js`.
  - Retrait du bloc Momentum de la Vue d'ensemble.
- **Exclu** :
  - Page Heatmaps (voir `docs/heatmaps-page.md`).
  - Comparaison de plusieurs joueurs sur un même graphique.
  - Survol ou tooltips sur les graphiques.
  - Zoom sur l'axe vertical : seul l'axe du temps se zoome.
  - Marqueurs d'événements (buts, démolitions) sur ces graphiques : voir `docs/timeline-events.md` pour la frise de l'écran Replay.
- **Limites** :
  - Toutes les données viennent de `3dmatch.json` (5 Hz). Sans lui, la page affiche uniquement des messages d'absence de données.
  - Un seul joueur à la fois pour la ligne de position et la distance.
  - Les composants JSX ne sont pas testés (pas de jsdom) : seules les fonctions pures de `chartGeometry.js` le sont (Vitest, `cd frontend; npm test`).
- **Dépendances** : `GET /api/replays/{id}/stats` (`docs/replay-stats.md`), `analysis.build_report`, schémas `PlayerDetail` et `GameReport`, React, variables CSS du thème (`--blue`, `--orange`, `--bg`, `--muted`), `TEAM_NAMES` exporté par `Layout.jsx`.
