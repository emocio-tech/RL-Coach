# Tool `analyze_player_across_matches` (issue #46)

## Résumé fonctionnel
Ce tool analyse le style de jeu d'un joueur sur plusieurs parties déjà importées, et plus seulement sur la partie ouverte. Il sert au chat du coach IA et à tout agent MCP. Il renvoie des totaux, des moyennes par partie, des pourcentages de positionnement et de vitesse, le détail de chaque partie et une tendance récente. Il répond à des questions comme « mon évolution » ou « mon style en général », et signale quand l'échantillon est trop petit ou quand plusieurs modes de jeu sont mélangés.

### Exemple
Six parties importées contiennent le joueur « Dimi » (4 en 2v2, 2 en 3v3) et une partie est ouverte dans le chat. Le joueur demande : « Comment j'ai évolué sur mes derniers matchs en 2v2 ? ».

Le LLM appelle le tool avec `{"team_size": 2, "last_n": 10}` ; `player_name` est omis, donc le joueur sélectionné est utilisé. Le résultat contient `games_analyzed: 4`, `modes.games_by_team_size: {"2": 4}` et un bloc `trend` qui compare les 2 parties les plus anciennes aux 2 plus récentes (`older`, `recent`, `delta` par métrique). Il n'y a pas de `note`, car il y a au moins 3 parties. Le coach cite uniquement ces chiffres et mentionne « sur 4 parties ».

## Description technique

### Entrées
| Nom | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `player_name` | chaîne | non dans le chat (défaut : joueur sélectionné), oui côté MCP | Pseudo comparé avec `strip()` et `casefold()`. Vide ou non textuel : erreur. |
| `team_size` | entier | non | Entier ≥ 1 (booléens refusés). Ne garde que les parties de cette taille d'équipe. |
| `last_n` | entier | non | De 1 à 20, défaut 20 (`MAX_LAST_N`). Hors plage : refusé dans le chat, borné silencieusement si `analyze_player` est appelée directement. |

Points d'entrée :
- Chat : entrée dans `TOOLS`, validation dans `_analyze_across_matches`, aiguillage dans `_run_tool` (avant le garde `game_id`) — `backend/app/services/coach.py`. Les tools ne sont fournis au LLM que si une partie est ouverte.
- MCP : 8e outil de `backend/app/mcp_server.py`, sans `game_id`.
- Calcul : `backend/app/services/crossmatch.py` (`analyze_player`), lecture via `storage.iter_game_reports`.

### Sorties
Un dict, sans écriture ni appel externe.

- `player` : pseudo tel qu'écrit dans la partie la plus récente analysée.
- `games_analyzed` : nombre de parties prises en compte.
- `games_skipped` : `[{game_id, reason}]` pour les parties de la fenêtre où le joueur est absent.
- `modes` : `games_by_team_size` (clé `"unknown"` si inconnue), plus `note` si les formats sont mélangés.
- `totals` : sommes des compteurs (score, goals, assists, saves, shots, demolitions_inflicted, demolitions_received, small_pads, big_pads).
- `averages` : moyenne par partie des compteurs ; moyenne pondérée par `tracked_time_s` des taux et pourcentages (boost_consumed_per_minute, boost_average_level, avg_speed, avg_ball_distance, supersonic_pct, slow_pct, zero_boost_pct, zones défensive/milieu/offensive, behind_ball_pct, first/second/third_man_pct). Les `None` et poids ≤ 0 sont ignorés ; valeurs arrondies à 2 décimales.
- `per_game` : `game_id`, `date`, `team_size`, `score` (équipe du joueur - adversaire), `result` (win, loss, draw ou null), `player_score` (points du joueur), goals, assists, saves, shots, demolitions_inflicted.
- `trend` : si `games_analyzed` ≥ 4. Première moitié (`older`) contre dernière moitié (`recent`), `half = n // 2`, pour score, goals, saves, shots, supersonic_pct, behind_ball_pct, offensive_zone_pct (`older`, `recent`, `delta`).
- `note` : si `games_analyzed` < 3 (échantillon insuffisant).

Règles :
- Parties triées par date croissante (celles sans date d'abord, donc écartées en premier), puis seules les `last_n` dernières sont gardées.
- Les pourcentages 1er/2e/3e homme sont omis si `team_size == 1` ou si toutes les parties analysées sont en 1v1.

### Erreurs
Toujours un dict `{"error": ...}`, jamais d'exception.

| Condition | Message |
|---|---|
| `player_name` absent (ni argument ni joueur sélectionné) ou invalide | « Argument player_name manquant ou invalide. » |
| `team_size` non entier ou < 1 | « Argument team_size invalide… » |
| `last_n` non entier ou hors 1 à 20 (chat) | « Argument last_n invalide… » |
| Aucune partie (ou aucune à ce `team_size`) | « Aucune partie importée correspondante. » |
| Joueur absent de toutes les parties filtrées | « Joueur introuvable… » + `available_players` (50 pseudos max, triés) |
| Joueur absent des `last_n` parties les plus récentes | « Joueur absent des parties les plus récentes. » |

### Périmètre
- **Inclus** : analyse multi-parties par pseudo (casse ignorée), filtre par mode, fenêtre des N dernières parties, tendance, notes de fiabilité ; chat (avec partie ouverte) et MCP.
- **Exclu** : identification par id plateforme (deux joueurs de même pseudo sont confondus), usage dans le chat sans partie ouverte, affichage structuré côté front, cache (relecture des fichiers à chaque appel), écriture de données.
