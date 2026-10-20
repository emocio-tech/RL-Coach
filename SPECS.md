# Specs RL-Coach

## Présentation générale
RL-Coach est une application web d'analyse de statistiques Rocket League, à partir de fichiers de replay fournis par l'utilisateur.

L'application a un front en React avec TypeScript et un back en Python avec FastAPI. Le front communique avec le back via l'API HTTP exposée par ce dernier.

## Import d'un replay et extraction des statistiques
L'utilisateur ajoute un fichier `.replay` dans l'application. À l'import, le back extrait du replay les statistiques du match et les enregistre dans un fichier JSON placé dans `data/games/`. Le fichier `.replay` n'est pas sauvegardé : seul le JSON est conservé.

Le JSON se compose de deux parties.

**Statistiques globales du match** : informations générales sur la partie, comme le mode de jeu et le score.

**Statistiques par joueur** : pour chaque joueur, on trouve :
- les statistiques de base : tirs, passes, buts, etc. ;
- le positionnement sur le terrain ;
- le suivi tout au long de la partie : position 3D, vitesse et niveau de boost du joueur, ainsi que la position de la balle.

<details>
<summary>Historique des versions</summary>

| Version | Date | Auteur | Branche |
|---------|------|--------|---------|
| 1 | 2026-10-19 16:29 | iwao | main |
| 2 | 2026-10-20 10:33 | Dimitri FORT | issue-6-replay-upload-json-transcription |

</details>
