# Page Heatmaps : cartes de chaleur du ballon et du joueur

## Résumé fonctionnel
La page « Heatmaps » montre où se sont déroulées les actions sur le terrain pendant toute la partie. Une carte de chaleur indique les zones où le ballon est le plus souvent passé. Quand un joueur est sélectionné dans le menu du header, sa propre carte s'affiche à côté, dans la couleur de son équipe. On voit ainsi si un joueur occupait les bonnes zones par rapport au jeu. La carte du ballon est stockée à l'import ; pour les parties importées avant cette fonctionnalité, elle est recalculée à l'ouverture de la page.

### Exemple concret
Tu as importé un 3v3 et tu ouvres « Heatmaps » dans la sidebar (section « Déroulé »).

1. **Sans joueur sélectionné** : une seule carte, « Déplacements du ballon », sous-titre « Sur toute la durée du match ». La chaleur suit une échelle thermique (du fond du terrain au cyan, au vert, au jaune puis au rouge). Elle est concentrée côté orange (à droite) : le ballon a passé l'essentiel du match dans le camp orange.
2. **Tu sélectionnes « Pseudo » (équipe bleue)** : la carte « Déplacements du joueur » apparaît à droite, avec le sous-titre « Pseudo · Équipe bleue » et une échelle allant du bleu sombre à un turquoise-vert lumineux. La carte du ballon reste à gauche, à la même place et à la même taille. Si la zone chaude de Pseudo est loin de celle du ballon, il était souvent mal placé.
3. **Lecture** : la cage bleue est à gauche, la cage orange à droite. Plus la couleur est vive et opaque, plus la zone a été fréquentée. La légende en bas va de « Peu de passage » à « Beaucoup de passage ».

Cet exemple est illustratif, les valeurs ne viennent pas d'un vrai replay.

## Description technique

Le rapport des stats (`GET /api/replays/{game_id}/stats`) est décrit dans `docs/replay-stats.md`. Ce document ne couvre que la nouvelle route, le calcul de la grille et la page.

### Entrées

**Route**

| Nom | Type | Obligatoire | Description / contraintes |
|---|---|---|---|
| `game_id` (chemin) | `string` | oui | Nom du dossier de la partie. Doit respecter `GAME_ID_PATTERN`, sinon la partie est traitée comme introuvable (`backend/app/services/storage.py`). |

**Fonction `heatmap_from_points(xs, ys)`** (`backend/app/services/stats.py`)

| Nom | Type | Obligatoire | Description / contraintes |
|---|---|---|---|
| `xs` | itérable de `float \| None` | oui | Positions sur l'axe court. |
| `ys` | itérable de `float \| None` | oui | Positions sur l'axe long. Les deux sont parcourus avec `zip` : le plus court l'emporte. |

**Props de la page** (`frontend/src/pages/HeatmapsPage.jsx`)

| Nom | Type | Obligatoire | Description / contraintes |
|---|---|---|---|
| `report` | `GameReport` | oui | Fournit `report.id` (appel API) et `report.players` (nom et équipe). |
| `selectedPlayer` | `string \| null` | non | Nom choisi dans le header, conservé par `App.jsx`. |

**Props de `HeatmapChart`** (`frontend/src/components/Charts.jsx`)

| Prop | Type | Obligatoire | Description |
|---|---|---|---|
| `heatmap` | `Heatmap` | oui | Grille `counts`. |
| `player`, `team` | `string`, `number` | non | Sous-titre, pastille et rampe de couleurs. |
| `title` | `string` | non | Défaut « Déplacements du joueur ». |
| `subtitle` | `string` | non | Défaut `<joueur> · <équipe>`. |
| `variant` | `"ball"` | non | Rampe thermique (fond, cyan, vert, jaune, rouge), pas de pastille d'équipe. |
| `bare` | `boolean` | non | `true` : carte pleine taille de la page (`h2`, classe `card heatmap-panel`). Défaut `false` : bloc compact du chat (`h3`, classe `heatmap-card`). |

**Calcul de la grille** (`backend/app/services/stats.py`)
- Grille de 20 colonnes en x (`GRID_X`) sur 26 en y (`GRID_Y`), stockée dans `counts[ix][iy]`.
- Bornes : x de -4096 à 4096, y de -5120 à 5120.
- Un point dont une coordonnée est `None` est ignoré.
- Un point hors bornes est ramené dans la cellule du bord.
- Chaque point est un échantillon, pas une durée.
- Les échantillons « temps mort » sont écartés, pour toutes les cartes (ballon et joueurs) : `stats.dead_ball_mask` repère les séquences d'au moins 10 échantillons consécutifs (2 s) où le ballon bouge de moins de 5 unités entre deux échantillons (`DEAD_BALL_MIN_SAMPLES`, `DEAD_BALL_MAX_STEP`). Ce sont le compte à rebours de l'engagement (ballon figé au centre) et le ballon figé au fond de la cage après un but. Sans cela, le centre du terrain et le fond des cages écrasent la carte. `heatmap_from_points` les ignore via son paramètre `skip`. Les trajectoires (`track`, `ball`) gardent tous les échantillons.

### Sorties

**Réponse de `GET /api/replays/{game_id}/heatmaps`** (schéma `MatchHeatmaps`, `backend/app/schemas/replay.py`)

```
{
  "players": [ { "name": str, "team": int, "heatmap": Heatmap }, ... ],
  "ball": Heatmap
}
```

`Heatmap` contient `x_min`, `x_max`, `y_min`, `y_max` et `counts` (liste de listes d'entiers).

**Provenance des données** (`storage.get_game_heatmaps`)
Les heatmaps des joueurs et du ballon, calculées à l'import sans les temps morts, sont stockées dans `heatmap.json` (`HeatmapFile`) et relues telles quelles. `3dmatch.json` n'est pas lu. Les anciens dossiers (avec `map.json`) ne sont plus lus et ne sont pas migrés.

Aucune écriture et aucun appel externe : lecture de `heatmap.json` seule.

**Page**
- Titre « Heatmaps », puis une grille à deux colonnes égales (`.heatmap-grid`, `frontend/src/styles.css`).
- **Sans joueur sélectionné** : une seule carte, le ballon, dans la colonne de gauche. Elle a exactement la taille qu'elle a avec un joueur sélectionné ; la colonne de droite reste vide.
- **Avec joueur** : carte du ballon à gauche (échelle thermique), carte du joueur à droite (échelle bleue ou orange selon l'équipe).
- **Fenêtre étroite** (1 100 px ou moins) : une seule colonne, les cartes passent l'une sous l'autre, le ballon en premier, chacune sur toute la largeur.
- **Rendu SVG** (`role="img"`, `aria-label`) : terrain en octogone, et une seule image (`<image>`) de la chaleur, rognée au contour du terrain. L'image est calculée pixel par pixel sur un canvas (691×553 pixels, soit 1,5 pixel par unité de la vue, nette sur un écran 2×) puis encodée en PNG ; il n'y a ni rectangles par case ni flou SVG. Ligne médiane, rond central, cage bleue à gauche, cage orange à droite.
- **Sidebar** : l'entrée « Heatmaps » est la dernière de la section « Déroulé », après « Replay » et « Positionnement ».

**Éléments touchés**

| Élément | Rôle |
|---|---|
| `frontend/src/api/client.js` | `getReplayHeatmaps(id)`, appel de la route. |
| `frontend/src/App.jsx` | Route interne `heatmaps` vers `HeatmapsPage`. |
| `frontend/src/components/Layout.jsx` | Entrée « Heatmaps » dans la section « Déroulé ». |
| `frontend/src/components/heatmapGeometry.js` | Fonctions pures : rampes, couleurs, opacité, lissage (`smoothCounts`), interpolation bicubique (`sampleCubic`), calcul des pixels de l'image (`buildHeatImage`), constantes du terrain. Le passage au canvas et au PNG est dans `Charts.jsx` (`heatImageUrl`). |
| `frontend/src/styles.css` | Styles `.heatmap-grid` et `.heatmap-panel`. |

### Erreurs

| Condition | Comportement |
|---|---|
| `game_id` invalide, `heatmap.json` absent, ou `heatmap.json` non valide pour le schéma (`ValueError` ou `OSError`) | Le service retourne `None`, la route répond **404** `{"detail": "Heatmap data not found"}`. |
| Échec de la requête côté page | « Impossible de charger les heatmaps de cette partie (<erreur>). Réessaie en rouvrant la partie. » (`role="alert"`). |
| Chargement en cours | « Chargement des heatmaps… ». |
| Joueur sélectionné absent des heatmaps | « Pas de données de position pour <joueur>. » à la place de sa carte. La carte du ballon reste affichée. |
| Grille entièrement à 0 | `HeatmapChart` affiche « Pas de données de position pour le ballon / pour <joueur>. » |
| `selectedPlayer` ne correspond à aucun joueur du rapport | Traité comme « aucun joueur sélectionné ». |

### Éléments surprenants
- **Orientation : cage bleue à gauche, pour tous les joueurs.** L'axe long (y) est à l'horizontale, l'extrémité négative (cage bleue) à gauche. La carte d'un joueur orange n'est pas retournée. Même convention que la page Positionnement (`docs/positioning-page.md`).
- **Indices inversés par rapport au dessin.** `ix` (axe court) donne la ligne et `iy` (axe long) la colonne (`heatmapGeometry.js`).
- **Relues, sans repli.** Les cartes sont relues dans `heatmap.json`, jamais recalculées. Un ancien dossier (sans `heatmap.json`) donne un 404 : il faut supprimer son dossier puis réimporter la partie.
- **`heatmap.json` ne porte pas de version.** Un fichier écrit par une version intermédiaire du code, qui ne retirait pas les temps morts, est relu tel quel : il faut le réimporter pour qu'il en profite.
- **Un `heatmap.json` invalide donne un 404**, pas une 500 : le `ValueError` de validation est capturé. `get_game_tracks` a le même comportement.
- **Lissage avant la couleur.** Les comptes sont clairsemés (la médiane est de quelques échantillons par case) : colorés tels quels, deux cases voisines auraient des couleurs sans rapport, comme semées au hasard. La densité est donc lissée (gaussienne de 0,5 case, `SMOOTH_SIGMA`, renormalisée aux bords : assez pour relier les échantillons d'une trajectoire sans étaler la chaleur sur les zones voisines ; en dessous, vers 0,4, l'interpolation bicubique fait apparaître des anneaux et des trous autour des points chauds) puis interpolée en bicubique (Catmull-Rom, `sampleCubic`) en chaque pixel de l'image, et c'est cette valeur continue qui est coloriée, pixel par pixel. Colorier après lissage garde les transitions de couleur franches, alors que flouter l'image coloriée mélangeait le cyan et le rouge en vert boueux, et que des rectangles par case donnaient un rendu pixellisé. Le chat (`HeatmapChart` sans `bare`) profite du même rendu.
- **Échelle sur le 98ᵉ centile.** Le haut de l'échelle de couleurs est le 98ᵉ centile des cases du champ lissé (`SCALE_PERCENTILE`, `heatScale`), pas le maximum : les cases plus chargées saturent. Un point chaud isolé n'écrase donc pas le reste de la carte.
- **Courbe de couleur en puissance.** Le rapport entre une valeur et l'échelle ne donne pas directement la couleur : il est élevé à la puissance 1,8 (`HEAT_GAMMA`, `heatRatio`). Une zone voisine d'une zone très fréquentée retombe ainsi plus vite vers le bleu sombre qu'avec une courbe linéaire, les trajectoires se détachent comme des lignes et le rendu reste net. Par exemple, une valeur à la moitié de l'échelle donne un rapport d'environ 0,29, dans la moitié froide de la rampe, pas au milieu. La valeur est un compromis. Un chemin suivi une seule fois par le ballon pèse typiquement environ un quart de l'échelle : à 2,5 son rapport tombait à 0,03, presque sur la couleur de fond, et les trajectoires semblaient coupées ; à 1,8 il est de 0,08, assez pour sortir du fond. À 1,4, le fond se remplit et l'image redevient molle.
- **Opacité.** Elle monte linéairement de 0 à 1 sur le premier dixième du rapport de chaleur (`FULL_OPACITY_AT`), puis les pixels sont pleinement opaques : les couleurs gardent leur éclat au lieu de se délaver sur le fond, et le bord de la chaleur reste net.
- **Ni plancher ni seuil de visibilité.** Tout pixel qui a un peu de chaleur est dessiné, même la plus faible. Comme l'opacité part de 0, le bord de la chaleur apparaît sans marche. Seuls les pixels sans aucune chaleur (hors de portée du lissage) sont transparents.
- **Coût.** Environ 380 000 pixels, avec une interpolation bicubique chacun : de l'ordre de 100 ms par carte à froid. Le résultat (une chaîne `data:` PNG) est mémoïsé : il ne se recalcule pas quand le chat se redessine. Le DOM ne contient qu'un seul élément `<image>`.
- **Réglage.** Le rendu se règle avec quatre constantes de `heatmapGeometry.js` : `SMOOTH_SIGMA` (étalement et douceur), `HEAT_GAMMA` (rapidité de la descente vers le bleu), `FULL_OPACITY_AT` (netteté du bord) et `SCALE_PERCENTILE` (quantité de rouge).
- **Normalisation par carte.** Chaque carte a sa propre échelle. L'intensité ne se compare donc pas entre deux cartes, ni entre joueurs, ni avec le ballon.
- **Rampes de couleur.** Le ballon a une échelle thermique à 5 couleurs (fond du terrain, cyan, vert, jaune, rouge). Le cyan est assombri (`[0,124,136]`) pour que sa luminosité soit intermédiaire entre celle du fond et celle du vert : un cyan pur serait plus clair que le vert et la rampe ne s'éclaircirait pas régulièrement. Une équipe inconnue retombe sur le bleu (`rampFor`).
- **Rampes d'équipe : deux échelles écrites à la main** (`BLUE_RAMP`, `ORANGE_RAMP`, indexées par équipe dans `HEAT_RAMPS`). Toutes partent de la couleur de fond du terrain, comme celle du ballon.
  - **Équipe bleue.** Du bleu sombre du fond à un turquoise-vert lumineux, en six couleurs, fond compris : fond, bleu, azur, cyan, turquoise, turquoise-vert. La luminosité (luma) augmente à chaque couleur (23, 67, 106, 147, 186, 218) pendant que la teinte se réchauffe, de 230° (bleu) à 143° (turquoise-vert). La teinte ne remonte jamais le long de la rampe.
  - **Équipe orange.** Construite comme la bleue : du fond du terrain à un brun-rouge sombre qui tire légèrement vers le violet (344°), puis un rouge, un orange moyen et un jaune-orangé vif, en sept couleurs, fond compris. La luminosité (luma) augmente à chaque couleur (23, 42, 60, 79, 121, 164, 205, et la luminosité HSL aussi) pendant que la teinte se réchauffe de 344° à 45°. Elle ne contient aucun vert, donc ne peut pas tourner à l'olive. Au début, le fondu depuis le fond bleu nuit passe par un violet sombre ; les zones peu fréquentées ressortent donc en braise sombre, comme les zones peu fréquentées du bleu ressortent en bleu sombre.
- **Correspondance joueur par nom exact** (`===`, casse respectée) sur la page. Le chat passe par `storage.get_player_heatmap`, qui ignore la casse et les espaces autour du nom.
- **Le chat affiche la même heatmap que la page, avec les mêmes calculs et les mêmes couleurs.** Côté données, l'outil `show_heatmap` du coach appelle `storage.get_player_heatmap`, construit sur `get_game_heatmaps` : la carte du chat est celle de la page, temps morts écartés, lue dans `heatmap.json`. Côté rendu, le chat utilise le même `HeatmapChart` (`ChatBubble.jsx`), donc les mêmes fonctions de `heatmapGeometry.js` : lissage, interpolation, échelle, courbe, opacité et rampe de l'équipe. Seule la mise en page diffère : sans la prop `bare`, le composant rend le bloc compact historique du chat. Le résumé par zones du chat (`zones_pct`) vient des stats du joueur, pas de la heatmap.
- **Rechargement.** Les heatmaps sont rechargées au changement de `report.id`, avec une garde `cancelled` contre les réponses tardives. Changer de joueur ne refait pas d'appel : tout est déjà dans la réponse.

### Périmètre et limites
- **Inclus** :
  - Route `GET /api/replays/{game_id}/heatmaps`.
  - `stats.heatmap_from_points`, `storage.get_game_heatmaps`, schémas `PlayerHeatmap` et `MatchHeatmaps`.
  - Page « Heatmaps » et son entrée dans la sidebar.
  - Extension de `HeatmapChart` (`title`, `subtitle`, `variant="ball"`, `bare`).
  - `heatmapGeometry.js`, `getReplayHeatmaps`, styles `.heatmap-grid*`.
- **Exclu** :
  - Comparaison de plusieurs joueurs (un joueur à la fois, plus le ballon).
  - Tooltips et valeurs au survol.
  - Deep link : la page est une route interne (`page === "heatmaps"` dans `App.jsx`), sans URL dédiée.
  - Filtre par période du match : les cartes couvrent toute la durée.
- **Limites** :
  - Toutes les données viennent de `heatmap.json` (échantillons à 5 Hz, voir `docs/heatmap-file.md`). Sans lui, la route répond 404.
  - La grille 20×26 est grossière et fixée côté back.
- **Dépendances** : `heatmap.json` (`HeatmapFile`, `PlayerHeatmap`), `config.GAMES_DIR`, `config.HEATMAP_FILENAME`, `GAME_ID_PATTERN`, FastAPI, React, `TEAM_NAMES` exporté par `Layout.jsx`, variables CSS du thème.
