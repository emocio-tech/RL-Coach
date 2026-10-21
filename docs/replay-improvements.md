# Replay : tri des joueurs, ballcam au clic, bouton Lecture/Pause en icônes (issue #41)

## Résumé fonctionnel
- Les joueurs sont listés dans le même ordre partout : équipe bleue, équipe orange, joueurs sans équipe, puis ordre alphabétique (insensible à la casse et aux accents) dans chaque groupe. Le menu « Joueur » du header affiche en plus un en-tête par équipe.
- La page « Vue 3D » s'appelle désormais « Replay ». La page Timeline autonome est supprimée : la frise reste dans Replay (voir `docs/timeline-events.md`).
- Cliquer sur une carte joueur de Replay sélectionne le joueur et force la caméra en « Cam balle », y compris si ce joueur est déjà sélectionné.
- Le bouton Lecture/Pause affiche une icône (triangle ou double barre). Au survol, le fond clair laisse place au bleu sombre et l'icône devient blanche.

**Exemple** : un match avec Zoé et Émile (bleus), Adam (orange), Nina (sans équipe). Le menu du header montre « Équipe bleue » (Émile, Zoé), « Équipe orange » (Adam), « Sans équipe » (Nina). Les cartes de Replay suivent le même ordre. En caméra « Poursuite », un clic sur la carte d'Adam passe en « Cam balle » sur Adam.

## Description technique

### Entrées
| nom | type | description |
|---|---|---|
| `players`, `getStats` (`sortPlayers`, `groupByTeam`) | tableau, fonction | `getStats(p)` retourne `{ team, name }` (défaut : identité). `team` 0 = bleue, 1 = orange, autre ou absent = sans équipe. `frontend/src/components/playerOrder.js` |
| Clic sur une carte joueur | événement | `onSelectPlayer(p.name)` puis `setMode("ballcam")` (`frontend/src/pages/Match3DPage.jsx`) |
| Clic sur le bouton de lecture / Espace | événement | `togglePlay` |

### Sorties
- `sortPlayers` : copie triée, entrée non modifiée (équipe puis nom, locale `fr`, `sensitivity: "base"`).
- `groupByTeam` : `[{ team, players }]` dans l'ordre 0, 1, `null` ; seuls les groupes non vides ; toute équipe autre que 0 ou 1 est normalisée en `null` ; joueurs de chaque groupe triés.
- `PlayerSelect` (`frontend/src/components/Layout.jsx`) : un `role="group"` par équipe avec titre coloré, options inchangées.
- Cartes de Replay triées via `sortPlayers` ; `team` repris du rapport par nom si absent de `live.players`. Le joueur suivi par défaut est donc le premier de la liste triée.
- Navigation : « Replay » (id interne `match3d`) et « Positionnement ». Un `page` inconnu retombe sur la Vue d'ensemble.
- Bouton de lecture : SVG `aria-hidden` en `currentColor` ; `aria-label` et `title` valent « Pause », « Rejouer » (replay terminé) ou « Lecture ». Style : `.chip-main:hover { background: var(--blue); color: var(--text); }` (`frontend/src/styles.css`).

### Erreurs
Aucune gestion spécifique. Limite connue : `sortPlayers` suppose que `name` est défini ; un joueur sans nom a un comportement dépendant du moteur de tri.

### Tests
`frontend/src/components/playerOrder.test.js` (Vitest) : casse, accents, équipe manquante ou inconnue, non-mutation, `getStats`, liste vide, noms identiques. Pas de tests de composants (pas d'infrastructure front pour cela).

### Périmètre
- Inclus : les 4 points ci-dessus, docs et `SPECS.md` mis à jour.
- Exclu : renommage des ids et fichiers internes (`match3d`, `Match3DPage.jsx`, `viewer3d/`), backend (`timeline_seconds` reste utilisé par le coach), double bascule possible Espace + bouton quand le bouton a le focus.
