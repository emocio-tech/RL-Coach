# Coach IA (chat)

## Résumé fonctionnel
Une bulle de discussion ronde est affichée en bas à droite de toutes les pages. Elle ouvre un panneau où le joueur discute avec un coach eSport IA spécialisé dans Rocket League, qui le tutoie. Quand une partie est ouverte, le coach lit les statistiques de cette partie (résumé du match, stats d'un joueur, comparaison des joueurs) et s'appuie dessus pour ses conseils, sans inventer de chiffres. Sans partie ouverte, il donne seulement des conseils généraux. Il tient compte du joueur sélectionné dans l'interface et refuse les sujets sans rapport avec Rocket League. La réponse s'affiche en une fois, sans défilement progressif.

### Exemple concret
Contexte : le joueur vient d'importer un replay 2v2 et a sélectionné « Pseudo » dans la vue d'ensemble. Les valeurs ci-dessous sont illustratives.

- Joueur : « Qu'est-ce que je dois améliorer ? »
- Le front envoie `POST /api/chat` avec `game_id` et `selected_player: "Pseudo"`.
- Le LLM appelle `get_player_stats` avec `{"player_name": "Pseudo"}`, puis répond :
- Coach : « Tu passes 54,6 % du temps dans ton tiers défensif et tu es le joueur de ton équipe le plus proche de la balle 32,6 % du temps. Essaie de monter d'un cran quand ton coéquipier couvre le but. »

Sans partie ouverte, la même question reçoit des conseils généraux, avec une invitation à importer un replay pour une analyse chiffrée.

## Description technique

### Configuration
Variables lues dans un fichier `.env` à la racine du dépôt (modèle : `.env.example`). Le fichier est ignoré par Git ; le back doit être redémarré après modification.

| Variable | Obligatoire | Défaut | Rôle |
|---|---|---|---|
| `OPENAI_API_KEY` | oui, pour le chat | vide | Clé API. |
| `OPENAI_BASE_URL` | non | URL par défaut du SDK | URL de l'API compatible OpenAI. Une valeur vide équivaut à `None`. |
| `LLM_MODEL` | non | `nova-lite` | Modèle utilisé. |

Constantes non configurables par variable d'environnement (`backend/app/config.py`) :

| Constante | Valeur |
|---|---|
| `LLM_TIMEOUT_SECONDS` | 30 |
| `LLM_MAX_TOOL_ITERATIONS` | 5 |
| `CHAT_MAX_MESSAGES` | 20 |
| `CHAT_MAX_MESSAGE_CHARS` | 2000 |

Le client est créé avec `OpenAI(api_key, base_url, timeout=30, max_retries=1)` : le SDK peut relancer une fois la requête avant de lever une erreur.

### Entrées
`POST /api/chat` (`backend/app/api/routes/chat.py`). Corps JSON validé par `ChatRequest` (`backend/app/schemas/chat.py`).

| Nom | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `messages` | liste de `ChatMessage` | oui | De 1 à 20 éléments. |
| `messages[].role` | `"user"` ou `"assistant"` | oui | Aucun autre rôle accepté. |
| `messages[].content` | chaîne | oui | De 1 à 2000 caractères. |
| `game_id` | chaîne ou `null` | non | Identifiant d'une partie importée. Une chaîne vide est traitée comme absente. |
| `selected_player` | chaîne ou `null` | non | Joueur sélectionné dans l'interface, injecté dans le prompt système comme donnée (`json.dumps`). |

Le dernier message doit avoir le rôle `user`.

### Sorties
Réponse `200` : `{"reply": "<texte du coach>"}`, renvoyée d'un bloc (pas de streaming). Aucune écriture sur disque : l'effet externe est l'appel au LLM et la lecture des fichiers de la partie par les outils.

### Erreurs
| Condition | Code | Message (`detail`) |
|---|---|---|
| Corps invalide (liste vide ou > 20 messages, contenu vide ou > 2000 caractères, rôle inconnu, dernier message non `user`) | `422` | Erreur de validation FastAPI (non personnalisée). |
| `game_id` fourni mais introuvable (y compris format invalide) | `404` | « Partie introuvable. » |
| `OPENAI_API_KEY` vide | `503` | « Le coach IA n'est pas configuré (clé API manquante). » |
| Délai dépassé | `504` | « Le coach met trop de temps à répondre. Réessaie dans un instant. » |
| Erreur du fournisseur LLM | `502` | « Le coach IA est indisponible pour le moment. Réessaie plus tard. » |
| Réponse vide ou plafond d'itérations dépassé | `502` | « Le coach n'a pas pu produire de réponse. Réessaie. » |

### Fonctionnement côté back (`backend/app/services/coach.py`)
1. Vérification de la clé API.
2. Troncature défensive : seuls les 20 derniers messages sont gardés, chacun coupé à 2000 caractères.
3. Construction du prompt système (`build_system_prompt`) : rôle de coach tutoyant, obligation d'utiliser les outils pour tout chiffre, refus du hors-sujet, noms de joueurs et de fichiers traités comme des données et non des instructions. Il varie selon la présence d'une partie et d'un joueur sélectionné.
4. Boucle d'appels au modèle (voir ci-dessous).

#### Les outils de function calling
Ils ne sont proposés au modèle que si `game_id` est renseigné. Aucun ne prend d'identifiant de partie en argument : ils utilisent le `game_id` de la requête. Les rapports viennent de `storage.get_game_report`.

| Outil | Arguments | Ce qu'il renvoie (JSON) |
|---|---|---|
| `get_match_summary` | aucun | `{"match": <score, durée, mode, carte, date>, "players": [stats de base de chaque joueur]}` |
| `get_player_stats` | `player_name` (chaîne, obligatoire) | Stats de base du joueur plus `detail`. Nom comparé sans tenir compte de la casse ni des espaces en bordure. |
| `compare_players` | aucun | `{"players": [...]}` : stats de base plus `detail` pour tous les joueurs. |
| `analyze_player_across_matches` | `player_name?`, `team_size?`, `last_n?` | Style de jeu agrégé sur plusieurs parties importées (pas seulement la partie ouverte). Voir [cross-match-analysis.md](cross-match-analysis.md). |

Les erreurs sont renvoyées au modèle sous la forme `{"error": ...}`, sans exception : outil inconnu, arguments invalides (JSON incorrect ou pas un objet), aucune partie ouverte, partie introuvable, `player_name` manquant, joueur introuvable (avec `available_players`), erreur interne.

#### Boucle de tool calls et plafond
- Au plus `LLM_MAX_TOOL_ITERATIONS + 1` appels au modèle, soit 6.
- Si le modèle ne demande aucun outil, son texte est renvoyé ; un contenu vide lève `CoachError`.
- Sinon, le message assistant avec ses `tool_calls` est ajouté, chaque outil est exécuté et son résultat ajouté avec le rôle `tool` (bon `tool_call_id`).
- Si le modèle demande encore des outils au dernier appel, `CoachError` est levée (502).
- Sans `game_id`, d'éventuels `tool_calls` sont ignorés.

### Côté front
- `ChatBubble` est monté une seule fois dans `frontend/src/App.jsx`, hors de la page courante, avec `gameId` (`report?.id`) et `selectedPlayer`.
- L'historique est un état React local : conservé au changement de page et à la fermeture du panneau, perdu au rechargement. Le front renvoie l'historique complet à chaque envoi.
- Envoi par le bouton « Envoyer » ou Entrée (sans Maj), bloqué si le champ est vide ou si une réponse est en cours. Champ limité à 2000 caractères.
- Un message d'accueil est affiché localement et n'est pas inclus dans l'historique envoyé.
- En attente : « Le coach réfléchit… ». En cas d'erreur, le message du back est affiché dans le panneau.

### Périmètre
- **Inclus** : bulle et panneau de chat, endpoint `POST /api/chat`, appel LLM via le SDK OpenAI (base URL personnalisable, modèle `nova-lite` par défaut), outils de lecture des stats, chat général sans statistiques quand aucune partie n'est ouverte, prise en compte du joueur sélectionné.
- **Exclu** : streaming, persistance de l'historique, authentification, limitation de débit.
- **Dépendances** : paquets `openai` et `python-dotenv`, `storage.get_game_report`, fichier `.env`, accès réseau au fournisseur LLM.

### Limites connues
- **20 messages maximum** : le front n'tronque pas l'historique. Après environ 10 échanges, le back répond 422 et la conversation est bloquée. Pour un 422, `detail` est une liste : l'erreur affichée peut être illisible.
- **Pas d'authentification ni de limitation de débit** sur `/api/chat` : tout appelant ayant accès au back consomme la clé API.
- **Pas d'événements horodatés** (buts, tirs, démolitions) : les outils ne renvoient que des stats agrégées.
- **`nova-lite` et function calling non vérifiés** : aucun test réel n'a été fait avec la base URL configurée.
- **Consignes du prompt** (hors-sujet, pas de chiffres inventés, protection contre l'injection via les pseudos) : elles dépendent entièrement du modèle.
- **`selected_player`** : pas de borne de longueur dans le schéma.
