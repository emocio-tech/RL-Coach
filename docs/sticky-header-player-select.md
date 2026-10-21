# Header fixe et sélection du joueur depuis le tableau (issue #21)

## Résumé fonctionnel
Le header (logo + menu de sélection du joueur) reste visible en haut de l'écran quand on fait défiler la page. Sous 640px de large, il défile normalement avec la page.

Dans la Vue d'ensemble, cliquer sur une ligne d'un tableau des scores (ou appuyer sur Entrée / Espace quand elle a le focus) sélectionne ce joueur, comme le menu du header. Cliquer sur la ligne du joueur déjà sélectionné ne change rien.

**Exemple** : une partie 3v3 est ouverte, l'utilisateur scrolle : le header reste collé en haut. Il clique sur la ligne d'un joueur du tableau bleu : le menu du header affiche ce joueur, la ligne est mise en évidence et le bloc « Tes stats » apparaît.

## Description technique

### Entrées
| nom | type | description |
|---|---|---|
| `onSelectPlayer` (prop de `TeamTable`) | `(name: string) => void` | Appelée avec `stats.name` de la ligne (`frontend/src/pages/OverviewPage.jsx`) |
| Clic, Entrée ou Espace sur un `<tr>` | événement | Appelle `onSelectPlayer` (Espace et Entrée avec `preventDefault()`) |

### Sorties
- `.header` : `position: sticky; top: 0; z-index: 5`, repassé en `static` sous 640px (`frontend/src/styles.css`).
- `html { scroll-padding-top: 90px }` : le focus clavier ne passe pas sous le header.
- Lignes `tbody tr` : `cursor: pointer`, hover (si `hover: hover`) et `:focus-visible`, `tabIndex={0}`.
- État partagé : `setSelectedPlayer` (`App.jsx`) est la même fonction pour le menu du header et pour les lignes du tableau.
- Ordre des joueurs : les tableaux d'équipe utilisent `sortPlayers` et le menu du header utilise `groupByTeam` (`frontend/src/components/playerOrder.js`) : tri par équipe (bleue puis orange, puis sans équipe), puis par nom, ordre alphabétique insensible à la casse et aux accents (locale `fr`). Le menu affiche un en-tête non sélectionnable par équipe (« Équipe bleue », « Équipe orange », « Sans équipe ») ; voir `docs/replay-improvements.md`.

### Erreurs
Aucune gestion spécifique. Recliquer sur le joueur sélectionné rappelle `setSelectedPlayer` avec la même valeur : l'état ne change pas.

### Périmètre
- Inclus : header sticky, sélection par clic ou clavier dans les tableaux d'équipe.
- Exclu : sidebar sticky, désélection par clic, scroll automatique après sélection, header sticky sur mobile, tests front automatisés.
- Spécifications : `SPECS.md` (« Structure des pages » et « Écran Vue d'ensemble »).
