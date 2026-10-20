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

<details>
<summary>Historique des versions</summary>

| Version | Date | Auteur | Branche |
|---------|------|--------|---------|
| 1 | 2026-10-19 16:29 | iwao | main |
| 2 | 2026-10-20 10:33 | Dimitri FORT | issue-6-replay-upload-json-transcription |
| 3 | 2026-10-20 11:50 | Dimitri FORT | issue-15-improve-replay-export |

</details>
