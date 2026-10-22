# Frise des événements du match, écran Replay (issue #9)

## Résumé fonctionnel
La frise de l'écran Replay (bloc « Frise du match », sous la rediffusion 3D) affiche le déroulé d'une partie sous forme de frise : une bande par joueur, regroupées par équipe, sur laquelle des icônes marquent les buts, passes décisives, tirs, arrêts, démolitions causées (« Démolition ») et subies (« Détruit »). Les instants sont les temps du replay, en secondes depuis le début de l'enregistrement : le compte à rebours et les ralentis après un but sont donc comptés, et la frise peut différer du chrono affiché en jeu. Chaque but est repéré par une barre verticale pointillée et une pastille de score. Le survol (ou le focus clavier) d'une icône ouvre un tooltip avec les détails (passeur, victime, score).

**Exemple** : un replay se termine sur 2-1. À 1:12 depuis le début du replay, un joueur tire, puis marque à 1:13 sur une passe de son coéquipier. Son tir, proche du but, n'est pas conservé : un seul événement `goal` est affiché, avec le coéquipier en `other` et le score 1-0. Le coéquipier reçoit un événement `assist` dont `other` est le buteur. Les valeurs sont illustratives.

## Description technique

### Entrées
Pas de nouvelle route : les événements bruts (`MatchEvent`, `stats.json`, ajoutés avec l'issue #10) sont calculés à l'import par `build_match_files` (`backend/app/services/stats.py`) et lus via `GET /api/replays/{game_id}/stats`. Leur format est décrit dans `docs/replay-stats.md`.

Le front transforme ces événements (`frontend/src/components/timelineEvents.js`, `buildTimelineEvents`) :
- Une démolition (`demolition`) produit deux événements au même instant : `demo_done` (attaquant) et `demo_taken` (victime).
- Passeur : passe de la même équipe, d'un autre joueur, à 0,5 s du but au plus (la plus proche, utilisée une seule fois).
- Score : buts dont l'instant est inférieur ou égal à celui de l'événement (le but lui-même inclus).
- Tri par instant puis par type : `goal`, `assist`, `shot`, `save`, `demo_done`, `demo_taken`.

### Sorties
- `3dmatch.json` reçoit `timeline_seconds` : le maximum entre le dernier temps de frame relatif (`frames[-1]["time"] - t0`) et le plus grand `seconds` des événements, arrondi à 0,01. `TotalSecondsPlayed` n'est pas utilisé.
- `GameReport` expose `events` (copie de `stats.json`) et `timeline_seconds` (`null` sans `3dmatch.json`).

Événement de frise (côté front) : `type` (`goal`, `assist`, `shot`, `save`, `demo_done`, `demo_taken`), `t` (secondes depuis le début du replay), `player`, `team` (0 = bleue, 1 = orange), `other` (`goal` : passeur ; `assist` : buteur ; `demo_done` : victime ; `demo_taken` : démolisseur ; sinon `null`), `score_team0`, `score_team1` (score après l'événement).

### Affichage
`frontend/src/pages/Match3DPage.jsx` (bloc « Frise du match ») et `frontend/src/components/Timeline.jsx` : légende des 6 types, une bande par joueur, équipes regroupées et joueurs triés par ordre alphabétique au sein de chaque équipe (bordure blanche pour le joueur sélectionné), légende interactive (un clic sur un type masque ou réaffiche ses événements ; masquer les buts masque aussi barres et pastilles de score), graduation à chaque minute entière, barres et pastilles de score pour les buts, tooltips au survol ou au focus (Échap pour fermer).

### Erreurs
| Cas | Comportement |
|---|---|
| `game_id` invalide ou inconnu | `404 Replay not found` |
| `3dmatch.json` absent ou sans `timeline_seconds`, ou partie importée avant la feature | `200`, `timeline_seconds = null` (et `events = []` pour une ancienne partie) ; le front affiche « Aucun événement disponible pour cette partie. Réimporte le replay pour afficher la frise. » |

### Périmètre
- **Inclus** : événements aux temps du replay (depuis le début de l'enregistrement), score après chaque événement, `timeline_seconds` dans `3dmatch.json`, frise avec tooltips.
- **Exclu** : recalcul des anciennes parties (réimport nécessaire), filtre par équipe, zoom, sélection d'un joueur depuis sa bande.
- **Limites connues** : une passe hors de 0,5 s reste un `assist` sans `other` ; les pastilles de score de deux buts très proches peuvent se chevaucher ; les noms de joueurs sont supposés uniques.
