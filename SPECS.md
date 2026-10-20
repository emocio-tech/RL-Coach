# Specs RL-Coach

## Présentation générale
RL-Coach est une application web d'analyse de statistiques Rocket League, à partir de fichiers de replay fournis par l'utilisateur.

L'application a un front en React avec TypeScript et un back en Python avec FastAPI. Le front communique avec le back via l'API HTTP exposée par ce dernier.

## Import d'un replay et extraction des statistiques
L'utilisateur ajoute un fichier `.replay` dans l'application. À l'import, le back extrait du replay les données du match et les enregistre dans deux fichiers JSON, `stats.json` et `map.json`, placés dans un même dossier de `data/games/`. Le fichier `.replay` n'est pas sauvegardé : seuls les JSON sont conservés.

Le dossier est nommé d'après le stade et le mode de jeu, suivis de l'id du replay. Si un dossier de même nom existe déjà, un élément discriminant est ajouté au nom pour ne pas écraser l'existant.

### Fichier `stats.json`
Il se compose de deux parties.

**Statistiques globales du match** : informations générales sur la partie, comme le mode de jeu et le score.

**Statistiques par joueur** : pour chaque joueur, on trouve :
- les statistiques de base : tirs, passes, buts, etc. ;
- les démolitions : nombre infligé et nombre reçu ;
- le boost : nombre de petits boosts récupérés, nombre de gros boosts récupérés, boost consommé par minute et niveau moyen de boost dans le réservoir.

### Fichier `map.json`
Il décrit le déroulé du match dans le temps : position 3D, vitesse et niveau de boost de chaque joueur, ainsi que position de la balle. Les positions des joueurs figurent uniquement dans ce fichier. Voir #15.

## Statistiques de la partie
Une fois un replay importé, l'application affiche les statistiques de la partie, lues depuis les fichiers JSON. Voir #4 et #5.

### Statistiques du match
L'application présente le résultat de la partie : score final des équipes bleue et orange, durée, mode de jeu, carte et vainqueur. Elle présente aussi, par équipe, les statistiques de base de chaque joueur : score, buts, passes décisives, arrêts et tirs.

### Statistiques détaillées par joueur
Pour un joueur choisi, l'application affiche des statistiques détaillées regroupées en quatre thèmes :
- le déplacement : vitesse moyenne, part du temps en vitesse supersonique et part du temps à vitesse lente ;
- le positionnement : part du temps dans les zones défensive, milieu et offensive, part du temps derrière la balle, part du temps en 1er, 2e et 3e homme de son équipe, et distance moyenne à la balle ;
- le boost : niveau moyen, part du temps sans boost, boost consommé par minute, petits et gros boosts récupérés ;
- les démolitions : nombre infligé et nombre reçu.

Le déplacement et le positionnement sont calculés à partir de `map.json`.

### Graphiques
L'application présente deux graphiques :
- **Momentum** : la position de la balle au fil de la partie, qui montre quelle équipe pousse et à quels moments.
- **Style de jeu** : un radar qui compare les joueurs sur cinq critères (vitesse moyenne, boost moyen, part du temps en supersonique, part du temps en 1er homme, part du temps derrière la balle). Chaque critère est comparé au meilleur joueur de la partie.

<details>
<summary>Historique des versions</summary>

| Version | Date | Auteur | Branche |
|---------|------|--------|---------|
| 1 | 2026-10-19 16:29 | iwao | main |
| 2 | 2026-10-20 10:33 | Dimitri FORT | issue-6-replay-upload-json-transcription |
| 3 | 2026-10-20 11:50 | Dimitri FORT | issue-15-improve-replay-export |
| 4 | 2026-10-20 14:54 | TatouGou | issue-4-core-match-stats |

</details>
