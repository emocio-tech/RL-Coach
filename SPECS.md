# Specs RL-Coach

## Table des matières
- [Présentation générale](#présentation-générale)
- [Identité visuelle](#identité-visuelle)
- [Import et stockage des replays](#import-et-stockage-des-replays)
  - [Fichier `stats.json`](#fichier-statsjson)
  - [Fichier `map.json`](#fichier-mapjson)
- [Écrans](#écrans)
  - [Structure des écrans](#structure-des-écrans)
  - [Écran d'accueil](#écran-daccueil)
  - [Section Statistiques](#section-statistiques)
    - [Écran Vue d'ensemble](#écran-vue-densemble)
  - [Section Déroulé](#section-déroulé)
    - [Écran Timeline](#écran-timeline)
    - [Écran Heatmaps](#écran-heatmaps)
    - [Écran Vue 3D](#écran-vue-3d)
    - [Écran Positionnement](#écran-positionnement)
- [Maquettes](#maquettes)
- [Statistiques de la partie](#statistiques-de-la-partie)
  - [Statistiques du match](#statistiques-du-match)
  - [Statistiques détaillées par joueur](#statistiques-détaillées-par-joueur)
  - [Graphiques](#graphiques)
- [Coach IA (chat)](#coach-ia-chat)

## Présentation générale
RL-Coach est une application web d'analyse de statistiques Rocket League, à partir de fichiers de replay fournis par l'utilisateur.

L'application a un front en React avec TypeScript et un back en Python avec FastAPI. Le front communique avec le back via l'API HTTP exposée par ce dernier.

## Identité visuelle
L'interface est colorée et ludique. Elle reprend les couleurs de Rocket League, le bleu et l'orange, qui représentent aussi les deux équipes d'une partie. La typographie est de style « fun », en cohérence avec l'univers du jeu. Voir [#13](https://github.com/emocio-tech/RL-Coach/issues/13).

Les textes de l'interface s'adressent à l'utilisateur à la deuxième personne du singulier (par exemple « Tes stats », « Importe un nouveau replay »).

## Import et stockage des replays
L'application ne conserve pas les fichiers de replay. À l'import, le back extrait du replay les données du match et les enregistre dans deux fichiers JSON, `stats.json` et `map.json`, placés dans un même dossier de `data/games/`. Le fichier `.replay` n'est pas sauvegardé : seuls les JSON sont conservés. Ils ne contiennent que les informations utiles à l'application et sont plus compacts que le replay d'origine. Voir [#6](https://github.com/emocio-tech/RL-Coach/issues/6).

L'import a lieu quand l'utilisateur importe un nouveau fichier de replay depuis son ordinateur. Sélectionner une partie déjà importée dans le menu de l'écran d'accueil n'envoie aucun fichier. L'import se déroule ainsi :

1. L'utilisateur importe un fichier de replay depuis son ordinateur dans le front.
2. Le front envoie le fichier entier au back.
3. Le back convertit le replay en JSON et stocke les fichiers JSON.

Un match n'est stocké qu'une seule fois. Deux fichiers de replay qui concernent le même match sont considérés comme identiques, car ils ne diffèrent pas fonctionnellement. Quand le match du fichier importé est déjà stocké, le back ne crée pas de nouveau dossier et réutilise celui qui existe. L'utilisateur arrive alors sur l'écran Vue d'ensemble de cette partie, comme pour un nouvel import. Voir [#31](https://github.com/emocio-tech/RL-Coach/issues/31).

Le dossier est nommé d'après le stade et le mode de jeu, suivis de l'id du replay. Si un dossier de même nom existe déjà pour un autre match, un élément discriminant est ajouté au nom pour ne pas écraser l'existant.

### Fichier `stats.json`
Il se compose de deux parties.

**Statistiques globales du match** : informations générales sur la partie, comme le mode de jeu et le score. Voir [#4](https://github.com/emocio-tech/RL-Coach/issues/4).

**Statistiques par joueur** : pour chaque joueur, on trouve :
- les statistiques de base : tirs, passes, buts, etc. ;
- les démolitions : nombre infligé et nombre reçu ;
- le boost : nombre de petits boosts récupérés, nombre de gros boosts récupérés, boost consommé par minute et niveau moyen de boost dans le réservoir. Voir [#17](https://github.com/emocio-tech/RL-Coach/issues/17).

### Fichier `map.json`
Il décrit le déroulé du match dans le temps : position 3D, orientation, vitesse et niveau de boost de chaque joueur, ainsi que position de la balle. Les positions des joueurs figurent uniquement dans ce fichier. Voir [#15](https://github.com/emocio-tech/RL-Coach/issues/15).

## Écrans
Les écrans de l'application sont décrits dans l'ordre où l'utilisateur les rencontre : la structure commune à tous les écrans, l'écran d'accueil, puis les écrans regroupés par section comme dans la sidebar.

### Structure des écrans
Toutes les pages de l'application, sauf l'écran d'accueil, ont la même structure : un header en haut, une sidebar à gauche et la zone de contenu de la page.

Le header affiche le logo RL-Coach. Il reste fixe en haut de la page quand l'utilisateur fait défiler le contenu, sauf sur mobile où il défile avec la page. Il contient aussi un menu déroulant qui permet de sélectionner un joueur parmi tous ceux de la partie ouverte, listés par équipe (bleue puis orange), puis par ordre alphabétique des noms (insensible à la casse et aux accents). Le joueur sélectionné est utilisé par plusieurs pages de l'application. À l'arrivée sur une partie, aucun joueur n'est sélectionné : à chaque fois qu'une autre partie est chargée, le joueur sélectionné est réinitialisé. Voir [#21](https://github.com/emocio-tech/RL-Coach/issues/21) et [#38](https://github.com/emocio-tech/RL-Coach/issues/38).

La sidebar permet de naviguer entre les pages. Ses liens sont regroupés en sections. Le lien de la page courante a un style différent des autres, pour indiquer qu'il est sélectionné. Chaque lien est précédé d'une icône. La sidebar contient le lien « Accueil », hors section, qui ramène à l'écran d'accueil, la section « Statistiques », qui contient le lien « Vue d'ensemble », et la section « Déroulé », qui contient les liens « Timeline », « Heatmaps », « Vue 3D » et « Positionnement ». Voir [#13](https://github.com/emocio-tech/RL-Coach/issues/13).

### Écran d'accueil
L'écran d'accueil est la première page affichée au démarrage de l'application. L'utilisateur y a deux possibilités :

- Importer un nouveau fichier de replay depuis son ordinateur, selon le processus décrit dans « Import et stockage des replays ».
- Sélectionner une partie déjà importée dans un menu déroulant. Chaque entrée indique le nom du fichier d'origine, la date d'import et, quand ils sont disponibles, le score et la carte. La carte est affichée sous son nom dans le jeu, par exemple « DFH Stadium ». Une fois la partie choisie, le bouton « Voir les stats » ouvre l'écran Vue d'ensemble de cette partie. Ce bouton est grisé tant qu'aucune partie n'est choisie. Voir [#23](https://github.com/emocio-tech/RL-Coach/issues/23).

Pendant l'import, la zone d'import affiche un loader (cercle animé) et le texte « Analyse en cours… » jusqu'à la fin du traitement. Voir [#30](https://github.com/emocio-tech/RL-Coach/issues/30). Dès qu'un replay est importé, l'utilisateur arrive sur l'écran Vue d'ensemble de cette partie.

Le bouton « Revoir la dernière partie importée » rouvre l'écran Vue d'ensemble de la dernière partie importée ou ouverte depuis le démarrage de l'application. Il est grisé tant qu'aucune partie n'a été importée ou ouverte.

### Section Statistiques
La section « Statistiques » de la sidebar regroupe les écrans de statistiques de la partie.

#### Écran Vue d'ensemble
L'écran Vue d'ensemble est l'écran principal de statistiques de la partie sélectionnée, lues depuis ses fichiers JSON. Sa page s'intitule « Vue d'ensemble » et se compose de quatre blocs. Voir [#13](https://github.com/emocio-tech/RL-Coach/issues/13), [#3](https://github.com/emocio-tech/RL-Coach/issues/3) et [#4](https://github.com/emocio-tech/RL-Coach/issues/4).

Le premier bloc présente le résultat de la partie : score final des équipes bleue et orange, durée, mode de jeu, carte et vainqueur. Tant qu'aucun joueur n'est sélectionné dans le menu du header, le bloc se limite à ce résultat. Une fois un joueur sélectionné, le bloc affiche aussi « Tes stats », les statistiques de ce joueur : le modèle de voiture qu'il utilise, affiché sur sa propre ligne, puis son score, ses buts, ses passes décisives, ses arrêts et ses tirs. Voir [#25](https://github.com/emocio-tech/RL-Coach/issues/25).

Le second bloc présente les statistiques de tous les joueurs de la partie dans un tableau par équipe : modèle de voiture, score, buts, passes décisives, arrêts et tirs. Au sein de chaque tableau, les joueurs sont triés par ordre alphabétique des noms (insensible à la casse et aux accents). Les deux tableaux ont les mêmes colonnes, alignées et de même largeur. La ligne du joueur sélectionné est mise en évidence. Cliquer sur une ligne de ces tableaux sélectionne le joueur correspondant, comme le menu du header ; cliquer sur la ligne du joueur déjà sélectionné ne change rien. Voir [#21](https://github.com/emocio-tech/RL-Coach/issues/21) et [#38](https://github.com/emocio-tech/RL-Coach/issues/38).

Le troisième bloc, « Stats détaillées », présente les statistiques détaillées du joueur sélectionné. Tant qu'aucun joueur n'est sélectionné, il invite à en sélectionner un dans le menu du header. Une fois un joueur sélectionné, le titre du bloc cite son nom et le bloc affiche quatre groupes : « Déplacement », « Positionnement », « Boost » et « Démolitions », avec les statistiques décrites dans « Statistiques détaillées par joueur ». Une statistique indisponible s'affiche sous la forme « — ». Voir [#3](https://github.com/emocio-tech/RL-Coach/issues/3).

Le quatrième bloc, « Style de jeu », affiche le radar décrit dans « Graphiques », sous une phrase qui rappelle que chaque axe est comparé au meilleur des joueurs de la partie (100 %). Ce bloc ne dépend pas du joueur sélectionné dans le header. Voir [#32](https://github.com/emocio-tech/RL-Coach/issues/32).

### Section Déroulé
La section « Déroulé » de la sidebar regroupe les écrans qui présentent le déroulé de la partie.

#### Écran Timeline
L'écran Timeline présente le déroulé de la partie sélectionnée sous la forme d'une frise chronologique. Sa page s'intitule « Timeline » et contient un seul bloc, « Frise du match ». Voir [#9](https://github.com/emocio-tech/RL-Coach/issues/9).

Le bloc affiche d'abord une légende qui liste les types d'événements, chacun avec son icône et sa couleur : but, passe décisive, tir, arrêt, démolition (démolition causée) et détruit (démolition subie). Cliquer sur un type de la légende masque les événements de ce type sur la frise, et un nouveau clic les réaffiche ; un type masqué est grisé et barré dans la légende. Masquer les buts masque aussi leurs barres verticales et les pastilles de score. Tous les types sont affichés à l'arrivée sur l'écran.

La frise a une bande horizontale par joueur de la partie, avec le nom du joueur à gauche. Les bandes sont regroupées par équipe (bleue puis orange), triées par ordre alphabétique des noms (insensible à la casse et aux accents) au sein de chaque équipe, et teintées de la couleur de leur équipe. Si un joueur est sélectionné dans le menu du header, sa bande est mise en évidence. Voir [#38](https://github.com/emocio-tech/RL-Coach/issues/38).

La frise est graduée en temps, de 0:00 à la fin de la partie. Une graduation est affichée à chaque minute entière. La graduation de fin de partie n'est affichée que si elle a assez de place pour ne pas chevaucher la graduation de la dernière minute entière. La frise est graduée avec les temps contenus dans les données du replay, donc depuis le début de l'enregistrement, y compris les compte à rebours et ralentis, et non avec le chrono affiché en jeu (qui peut donc différer de la durée de la partie).

Sur la bande de chaque joueur, une icône est placée à l'instant de chacun de ses événements : ses buts, ses passes décisives, ses tirs, ses arrêts, les démolitions qu'il cause (icône « Démolition ») et celles qu'il subit (icône « Détruit »). Toutes les icônes d'une bande sont sur une même ligne. Un tir qui marque est affiché comme un but, pas comme un tir.

Chaque but est aussi marqué par une barre verticale en pointillés, de la couleur de l'équipe qui a marqué, qui traverse toutes les bandes. Sous la frise, alignée avec cette barre, une pastille affiche le score de la partie après ce but.

Quand l'utilisateur survole une icône, un tooltip s'affiche au-dessus d'elle. Il existe un tooltip par type d'événement. Chacun indique l'instant de l'événement et :

- But : le joueur qui a marqué, l'auteur de la passe décisive s'il y en a un, et le score après le but.
- Passe décisive : le passeur, le joueur qui a marqué sur cette passe et le score après le but.
- Tir : le tireur et le score à ce moment.
- Arrêt : le joueur qui a fait l'arrêt et le score à ce moment.
- Démolition : le joueur qui a démoli et sa victime.
- Détruit : le joueur démoli et celui qui l'a démoli.

#### Écran Heatmaps
L'écran Heatmaps présente, sous forme de cartes de chaleur sur le terrain, les déplacements des acteurs de la partie sélectionnée. Sa page s'intitule « Heatmaps ».

Tant qu'aucun joueur n'est sélectionné dans le menu du header, la page contient un seul bloc, « Déplacements du ballon ». Une fois un joueur sélectionné, elle contient deux blocs côte à côte : « Déplacements du joueur », à gauche, et « Déplacements du ballon », à droite.

Chaque bloc affiche une vue de dessus du terrain, aux proportions réelles de celui de Rocket League, avec les deux cages : la cage bleue à gauche, la cage orange à droite. Une carte de chaleur est superposée au terrain : plus une zone est fréquentée pendant toute la durée de la partie, plus sa couleur est intense. La heatmap du joueur prend la couleur de son équipe, celle du ballon a une couleur distincte de celles des équipes.

Pour chaque heatmap, la seule légende est l'échelle de couleur, de « Peu de passage » à « Beaucoup de passage ».

Les positions utilisées proviennent de `map.json`.

#### Écran Vue 3D
L'écran Vue 3D rejoue la partie sélectionnée en 3D, à partir des positions et des orientations de `map.json`. Sa page s'intitule « Vue 3D » et se compose de deux blocs : la rediffusion 3D, puis la frise du match. Voir [#8](https://github.com/emocio-tech/RL-Coach/issues/8). Des améliorations sont suivies dans [#41](https://github.com/emocio-tech/RL-Coach/issues/41).

Le premier bloc affiche le terrain, la balle et les voitures de tous les joueurs. Chaque voiture a la couleur de son équipe, l'orientation qu'elle avait dans la partie et le nom de son joueur au-dessus d'elle, affichage que l'utilisateur peut masquer. Une voiture démolie disparaît jusqu'à sa réapparition. Le terrain est le même pour toutes les cartes.

Le bloc affiche aussi :
- le score et le chrono de la rediffusion, calculés à partir des buts, et un bandeau « BUT ! » avec le buteur et le passeur pendant 4 secondes après chaque but ;
- une carte par joueur indiquant son niveau de boost et sa vitesse en km/h. Cliquer sur une carte sélectionne le joueur, comme le menu du header ;
- des commandes de lecture : lecture/pause, barre de temps avec les buts et les démolitions repérés, et vitesse de lecture de ×0,25 à ×4.

L'utilisateur choisit parmi cinq caméras : libre (à la souris), diffusion, cam balle, poursuite et vue de dessus. Cam balle et poursuite suivent le joueur sélectionné, ou le premier joueur de la liste si aucun n'est sélectionné.

Le second bloc, « Frise du match », reprend la frise de l'écran Timeline, avec un curseur qui indique l'instant de la rediffusion. Cliquer sur un événement amène la rediffusion 3 secondes avant cet événement et la lance. Si la caméra est cam balle ou poursuite, le joueur de l'événement est aussi sélectionné.

Si la partie n'a pas de données de position, un message l'indique à la place de la rediffusion.

#### Écran Positionnement
L'écran Positionnement présente l'évolution de la partie sélectionnée au fil du temps. Sa page s'intitule « Positionnement ». Tant qu'aucun joueur n'est sélectionné dans le menu du header, elle contient un seul bloc, « Position de la balle », suivi d'un message qui invite à sélectionner un joueur pour afficher sa position et sa distance à la balle. Une fois un joueur sélectionné, elle contient deux blocs empilés sur toute la largeur : « Position de la balle », qui superpose la position du joueur, et « Distance à la balle ». Les deux graphiques partagent le même axe de temps, gradué à chaque minute entière, et sont alignés. Voir [#35](https://github.com/emocio-tech/RL-Coach/issues/35).

Le bloc « Position de la balle » présente la position de la balle au fil de la partie, pour montrer quelle équipe pousse et à quels moments. Une phrase d'introduction l'explique : plus la zone est haute, plus la balle est proche de la cage bleue. Une fois un joueur sélectionné, cette phrase porte aussi sur lui, cite son nom et parle de « la zone ou la ligne pointillée ». Il prend la forme d'un graphique en aires : l'axe horizontal est le temps de la partie, gradué à chaque minute entière, et une ligne médiane représente le milieu du terrain. Quand la balle est dans la moitié de terrain de l'équipe orange, l'aire est orange et en dessous de la ligne médiane. Quand elle est dans la moitié de l'équipe bleue, l'aire est bleue et au-dessus. Plus la balle est proche d'une cage, plus l'aire est haute ou basse. Les libellés « Côté bleu » en haut et « Côté orange » en bas, à gauche du graphique, indiquent la moitié de terrain que représente chaque côté. Sans données de position, le bloc affiche « Pas de données de position pour cette partie. »

Une fois un joueur sélectionné, le bloc superpose à l'aire de la balle la position de ce joueur sur la longueur du terrain, sous la forme d'une ligne blanche fine en pointillés, entourée d'un contour sombre semi-transparent pour qu'elle reste lisible sans masquer l'aire, et qui suit la même échelle que l'aire. Plus le joueur est proche d'une cage, plus la ligne est haute ou basse. Cette représentation ne dépend pas de l'équipe du joueur. Une légende sous le graphique distingue la balle et le joueur, dont elle indique le nom et l'équipe. Elle n'apparaît que lorsqu'un joueur est sélectionné. Cliquer sur un élément de la légende masque la balle ou le joueur sur le graphique, et un nouveau clic le réaffiche ; un élément masqué est grisé et barré dans la légende. Tout est affiché à l'arrivée sur l'écran.

Le bloc « Distance à la balle » présente la distance entre le joueur sélectionné et la balle au fil de la partie, sous forme de courbe. Sous le titre, le bloc indique le nom et l'équipe du joueur. L'axe vertical est la distance, gradué, dans la même unité que la distance moyenne à la balle des statistiques détaillées. Une légende sous le graphique indique que la courbe est la distance entre le joueur et la balle, en unités du jeu. Sans données de position, le bloc affiche le même message.

Sur les deux graphiques, la molette de la souris zoome et dézoome sur l'axe du temps, autour de la position du pointeur, et cliquer puis glisser fait défiler le temps. Le zoom et le défilement sont synchronisés : les deux graphiques affichent toujours la même portion de la partie. Quand le zoom augmente, les graduations de temps se rapprochent (jusqu'à la seconde) pour rester lisibles. Dézoomer ramène au plus à la partie entière. Tant que le pointeur survole un graphique, la molette ne fait pas défiler la page.

Les positions utilisées proviennent de `map.json`.

## Maquettes
Les maquettes de l'écran d'accueil, de l'écran Vue d'ensemble (avec et sans joueur sélectionné), de l'écran Timeline et de ses tooltips, de l'écran Positionnement (avec un joueur sélectionné) et de l'écran Heatmaps (avec et sans joueur sélectionné) sont consultables ici : https://claude.ai/artifact/PjCxBTEKrxpNYJ88fa77kD

## Statistiques de la partie
Une fois un replay importé, l'application affiche les statistiques de la partie, lues depuis les fichiers JSON. Voir [#3](https://github.com/emocio-tech/RL-Coach/issues/3) et [#4](https://github.com/emocio-tech/RL-Coach/issues/4).

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
L'application présente trois graphiques :
- **Position de la balle** : la position de la balle au fil de la partie, qui montre quelle équipe pousse et à quels moments. Il s'affiche sur l'écran Positionnement, où la position du joueur sélectionné peut lui être superposée. Voir [#35](https://github.com/emocio-tech/RL-Coach/issues/35).
- **Distance à la balle** : la distance entre le joueur sélectionné et la balle au fil de la partie. Il s'affiche sur l'écran Positionnement. Voir [#35](https://github.com/emocio-tech/RL-Coach/issues/35).
- **Style de jeu** : un radar qui compare les joueurs sur cinq critères (vitesse moyenne, boost moyen, part du temps en supersonique, part du temps en 1er homme, part du temps derrière la balle). Chaque critère est comparé au meilleur joueur de la partie (100 % = meilleur joueur), l'échelle restant stable quels que soient les joueurs affichés. Voir [#32](https://github.com/emocio-tech/RL-Coach/issues/32) et [#38](https://github.com/emocio-tech/RL-Coach/issues/38).
  - Chaque joueur a une couleur propre à son équipe : nuances froides (bleu, cyan, violet, turquoise) pour l'équipe bleue, nuances chaudes (orange, jaune, rouge, rose) pour l'équipe orange. Les couleurs sont attribuées dans l'ordre alphabétique des noms (insensible à la casse et aux accents) au sein de l'équipe. Au-delà de 4 joueurs par équipe, les couleurs sont réutilisées avec un trait pointillé.
  - La légende liste les joueurs par équipe (bleue puis orange), puis par ordre alphabétique des noms (insensible à la casse et aux accents). Elle est cliquable : un clic sur un joueur le masque de la comparaison (il apparaît grisé et barré, comme dans la légende de la Timeline), un nouveau clic le réaffiche. Les axes ne changent pas quand on masque un joueur. Si tous les joueurs sont masqués, le message « Aucun joueur sélectionné » s'affiche. Ce choix est indépendant du joueur sélectionné dans l'en-tête de l'écran.
  - Un bouton « Comparaison » / « Un graphique par joueur » dans l'en-tête du graphique (absent s'il n'y a qu'un joueur) permet d'afficher un petit radar par joueur, bleus puis oranges, avec le nom dans sa couleur et les mêmes maxima. Tous les joueurs y sont affichés, les masquages ne s'appliquent pas. Ils sont conservés au retour sur la comparaison. Changer de partie réinitialise le mode d'affichage et les masquages.

## Coach IA (chat)
Une bulle de discussion ronde est affichée en bas à droite de l'écran, sur toutes les pages. Elle ouvre un panneau de discussion avec un coach eSport IA spécialisé dans Rocket League, qui s'adresse à l'utilisateur à la deuxième personne du singulier. Voir [#10](https://github.com/emocio-tech/RL-Coach/issues/10), [#29](https://github.com/emocio-tech/RL-Coach/issues/29) et [#2](https://github.com/emocio-tech/RL-Coach/issues/2).

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
| 12 | 2026-10-21 09:59 | Dimitri FORT | issue-30-replay-upload-loader |
| 13 | 2026-10-21 10:41 | TatouGou | issue-8-match-3d-visualization |
| 14 | 2026-10-21 10:44 | Dimitri FORT | issue-32-game-style-graphics |
| 15 | 2026-10-21 11:26 | Dimitri FORT | issue-38-sort-header-players |
| 16 | 2026-10-21 14:24 | iwao | issue-35-positioning-page-momentum |

</details>
