# Specs RL-Coach

## Présentation générale
RL-Coach est une application web d'analyse de statistiques Rocket League, à partir de fichiers de replay fournis par l'utilisateur.

L'application a un front en React avec TypeScript et un back en Python avec FastAPI. Le front communique avec le back via l'API HTTP exposée par ce dernier.

## Identité visuelle
L'interface est colorée et ludique. Elle reprend les couleurs de Rocket League, le bleu et l'orange, qui représentent aussi les deux équipes d'une partie. La typographie est de style « fun », en cohérence avec l'univers du jeu.

Les textes de l'interface s'adressent à l'utilisateur à la deuxième personne du singulier (par exemple « Tes stats », « Importe un nouveau replay »).

## Import et stockage des replays
L'application ne conserve pas les fichiers de replay. À l'import, le back extrait du replay les données du match et les enregistre dans deux fichiers JSON, `stats.json` et `map.json`, placés dans un même dossier de `data/games/`. Le fichier `.replay` n'est pas sauvegardé : seuls les JSON sont conservés. Ils ne contiennent que les informations utiles à l'application et sont plus compacts que le replay d'origine.

L'import a lieu quand l'utilisateur importe un nouveau fichier de replay depuis son ordinateur. Sélectionner une partie déjà importée dans le menu de l'écran d'accueil n'envoie aucun fichier. L'import se déroule ainsi :

1. L'utilisateur importe un fichier de replay depuis son ordinateur dans le front.
2. Le front envoie le fichier entier au back.
3. Le back convertit le replay en JSON et stocke les fichiers JSON.

Un match n'est stocké qu'une seule fois. Deux fichiers de replay qui concernent le même match sont considérés comme identiques, car ils ne diffèrent pas fonctionnellement. Quand le match du fichier importé est déjà stocké, le back ne crée pas de nouveau dossier et réutilise celui qui existe. L'utilisateur arrive alors sur l'écran Vue d'ensemble de cette partie, comme pour un nouvel import.

Le dossier est nommé d'après le stade et le mode de jeu, suivis de l'id du replay. Si un dossier de même nom existe déjà pour un autre match, un élément discriminant est ajouté au nom pour ne pas écraser l'existant.

### Fichier `stats.json`
Il se compose de deux parties.

**Statistiques globales du match** : informations générales sur la partie, comme le mode de jeu et le score.

**Statistiques par joueur** : pour chaque joueur, on trouve :
- les statistiques de base : tirs, passes, buts, etc. ;
- les démolitions : nombre infligé et nombre reçu ;
- le boost : nombre de petits boosts récupérés, nombre de gros boosts récupérés, boost consommé par minute et niveau moyen de boost dans le réservoir.

### Fichier `map.json`
Il décrit le déroulé du match dans le temps : position 3D, orientation, vitesse et niveau de boost de chaque joueur, ainsi que position de la balle. Les positions des joueurs figurent uniquement dans ce fichier. Voir #15.

## Écran d'accueil
L'écran d'accueil est la première page affichée au démarrage de l'application. L'utilisateur y a deux possibilités :

- Importer un nouveau fichier de replay depuis son ordinateur, selon le processus décrit dans « Import et stockage des replays ».
- Sélectionner une partie déjà importée dans un menu déroulant. Chaque entrée indique le nom du fichier d'origine, la date d'import et, quand ils sont disponibles, le score et la carte. La carte est affichée sous son nom dans le jeu, par exemple « DFH Stadium ». Une fois la partie choisie, le bouton « Voir les stats » ouvre l'écran Vue d'ensemble de cette partie. Ce bouton est grisé tant qu'aucune partie n'est choisie.

Dès qu'un replay est importé, l'utilisateur arrive sur l'écran Vue d'ensemble de cette partie.

Le bouton « Revoir la dernière partie importée » rouvre l'écran Vue d'ensemble de la dernière partie importée ou ouverte depuis le démarrage de l'application. Il est grisé tant qu'aucune partie n'a été importée ou ouverte.

## Structure des pages
Toutes les pages de l'application, sauf l'écran d'accueil, ont la même structure : un header en haut, une sidebar à gauche et la zone de contenu de la page.

Le header affiche le logo RL-Coach. Il reste fixe en haut de la page quand l'utilisateur fait défiler le contenu, sauf sur mobile où il défile avec la page. Il contient aussi un menu déroulant qui permet de sélectionner un joueur parmi tous ceux de la partie ouverte. Le joueur sélectionné est utilisé par plusieurs pages de l'application. À l'arrivée sur une partie, aucun joueur n'est sélectionné : à chaque fois qu'une autre partie est chargée, le joueur sélectionné est réinitialisé.

La sidebar permet de naviguer entre les pages. Ses liens sont regroupés en sections. Le lien de la page courante a un style différent des autres, pour indiquer qu'il est sélectionné. La sidebar contient le lien « Accueil », hors section, qui ramène à l'écran d'accueil, la section « Statistiques », qui contient le lien « Vue d'ensemble », et la section « Déroulé », qui contient les liens « Timeline » et « Heatmaps ».

## Écran Vue d'ensemble
L'écran Vue d'ensemble est l'écran principal de statistiques de la partie sélectionnée, lues depuis ses fichiers JSON. Sa page s'intitule « Vue d'ensemble » et se compose de deux blocs.

Le premier bloc présente le résultat de la partie : score final des équipes bleue et orange, durée, mode de jeu, carte et vainqueur. Tant qu'aucun joueur n'est sélectionné dans le menu du header, le bloc se limite à ce résultat. Une fois un joueur sélectionné, le bloc affiche aussi « Tes stats », les statistiques de ce joueur : le modèle de voiture qu'il utilise, affiché sur sa propre ligne, puis son score, ses buts, ses passes décisives, ses arrêts et ses tirs.

Le second bloc présente les statistiques de tous les joueurs de la partie dans un tableau par équipe : modèle de voiture, score, buts, passes décisives, arrêts et tirs. Les deux tableaux ont les mêmes colonnes, alignées et de même largeur. La ligne du joueur sélectionné est mise en évidence. Cliquer sur une ligne de ces tableaux sélectionne le joueur correspondant, comme le menu du header ; cliquer sur la ligne du joueur déjà sélectionné ne change rien.

## Écran Timeline
L'écran Timeline présente le déroulé de la partie sélectionnée sous la forme d'une frise chronologique. Sa page s'intitule « Timeline » et contient un seul bloc, « Frise du match ».

Le bloc affiche d'abord une légende qui liste les types d'événements, chacun avec son icône et sa couleur : but, passe décisive, tir, arrêt, Kill (démolition causée) et Mort (démolition subie).

La frise a une bande horizontale par joueur de la partie, avec le nom du joueur à gauche. Les bandes sont regroupées par équipe et teintées de la couleur de leur équipe. Si un joueur est sélectionné dans le menu du header, sa bande est mise en évidence.

La frise est graduée en temps, de 0:00 à la fin de la partie. Une graduation est affichée à chaque minute entière. La graduation de fin de partie n'est affichée que si elle a assez de place pour ne pas chevaucher la graduation de la dernière minute entière.

Sur la bande de chaque joueur, une icône est placée à l'instant de chacun de ses événements : ses buts, ses passes décisives, ses tirs, ses arrêts, les démolitions qu'il cause (Kill) et celles qu'il subit (Mort). Toutes les icônes d'une bande sont sur une même ligne. Un tir qui marque est affiché comme un but, pas comme un tir.

Chaque but est aussi marqué par une barre verticale en pointillés, de la couleur de l'équipe qui a marqué, qui traverse toutes les bandes. Sous la frise, alignée avec cette barre, une pastille affiche le score de la partie après ce but.

Quand l'utilisateur survole une icône, un tooltip s'affiche au-dessus d'elle. Il existe un tooltip par type d'événement. Chacun indique l'instant de l'événement et :

- But : le joueur qui a marqué, l'auteur de la passe décisive s'il y en a un, et le score après le but.
- Passe décisive : le passeur, le joueur qui a marqué sur cette passe et le score après le but.
- Tir : le tireur et le score à ce moment.
- Arrêt : le joueur qui a fait l'arrêt et le score à ce moment.
- Kill : le joueur qui a démoli et sa victime.
- Mort : le joueur démoli et celui qui l'a démoli.

## Écran Heatmaps
L'écran Heatmaps présente, sous forme de cartes de chaleur sur le terrain, les déplacements des acteurs de la partie sélectionnée. Sa page s'intitule « Heatmaps ».

Tant qu'aucun joueur n'est sélectionné dans le menu du header, la page contient un seul bloc, « Déplacements du ballon ». Une fois un joueur sélectionné, elle contient deux blocs côte à côte : « Déplacements du joueur », à gauche, et « Déplacements du ballon », à droite.

Chaque bloc affiche une vue de dessus du terrain, aux proportions réelles de celui de Rocket League, avec les deux cages : la cage bleue à gauche, la cage orange à droite. Une carte de chaleur est superposée au terrain : plus une zone est fréquentée pendant toute la durée de la partie, plus sa couleur est intense. La heatmap du joueur prend la couleur de son équipe, celle du ballon a une couleur distincte de celles des équipes.

Pour chaque heatmap, la seule légende est l'échelle de couleur, de « Peu de passage » à « Beaucoup de passage ».

Les positions utilisées proviennent de `map.json`.

## Maquettes
Les maquettes de l'écran d'accueil, de l'écran Vue d'ensemble (avec et sans joueur sélectionné), de l'écran Timeline et de ses tooltips, et de l'écran Heatmaps (avec et sans joueur sélectionné) sont consultables ici : https://claude.ai/artifact/PjCxBTEKrxpNYJ88fa77kD

## Statistiques de la partie
Une fois un replay importé, l'application affiche les statistiques de la partie, lues depuis les fichiers JSON. Voir #3 et #4.

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

## Coach IA (chat)
Une bulle de discussion ronde est affichée en bas à droite de l'écran, sur toutes les pages. Elle ouvre un panneau de discussion avec un coach eSport IA spécialisé dans Rocket League, qui s'adresse à l'utilisateur à la deuxième personne du singulier.

- La conversation est conservée tant que la page n'est pas rechargée, y compris quand l'utilisateur change de page. Elle n'est pas sauvegardée au-delà.
- L'utilisateur envoie son message avec le bouton « Envoyer » ou la touche Entrée. L'envoi est impossible si le champ est vide ou si une réponse est en cours. La réponse s'affiche en une fois.
- Les 20 derniers messages sont pris en compte, chacun limité à 2000 caractères.
- Quand une partie est ouverte, le coach s'appuie sur ses statistiques (résumé du match, statistiques d'un joueur, comparaison des joueurs) et ne donne aucun chiffre qu'il n'a pas lu. Il tient compte du joueur sélectionné.
- Sans partie ouverte, le coach donne uniquement des conseils généraux, sans statistiques.
- Le coach refuse les sujets sans rapport avec Rocket League.
- En cas de problème (coach non configuré, indisponible ou trop lent), un message d'erreur en français s'affiche dans le panneau.

<details>
<summary>Historique des versions</summary>

| Version | Date | Auteur | Branche |
|---------|------|--------|---------|
| 1 | 2026-10-19 16:29 | iwao | main |
| 2 | 2026-10-20 10:33 | Dimitri FORT | issue-6-replay-upload-json-transcription |
| 3 | 2026-10-20 11:50 | Dimitri FORT | issue-15-improve-replay-export |
| 4 | 2026-10-20 12:20 | iwao | issue-13-interface-design |
| 5 | 2026-10-20 14:35 | Dimitri FORT | issue-17-fix-boost-calculation |
| 6 | 2026-10-20 14:54 | TatouGou | issue-4-core-match-stats |
| 7 | 2026-10-20 14:55 | iwao | issue-13-interface-design |
| 8 | 2026-10-20 15:00 | TatouGou | issue-4-core-match-stats |
| 9 | 2026-10-21 08:51 | Chauvin Matthieu | issue-10-llm-chat-precision |
| 10 | 2026-10-20 15:32 | Dimitri FORT | issue-21-sticky-header-player-select |
| 11 | 2026-10-20 16:22 | iwao | issue-23-select-imported-game |

</details>
