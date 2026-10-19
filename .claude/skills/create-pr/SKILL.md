---
name: create-pr
description: Crée la pull request liée à l'issue de la branche courante (branche issue-numero-descriptif) avec le titre "[Issue #N] <résumé>" et passe l'issue en "In review". S'arrête si la branche n'est pas une branche de feature.
---

# Créer la pull request d'une issue

En PowerShell, depuis la racine du repo. Aucune entrée : tout est déduit de la branche courante.

## 1. Vérifier la branche (arrêt immédiat sinon)
- `git branch --show-current`
- Elle doit correspondre à `^issue-(\d+)-[a-z0-9-]+$`. Sinon (main, autre nom, HEAD détaché) : dire que ce n'est pas une branche de feature et **s'arrêter tout de suite**, sans autre commande.
- Le numéro capturé est le numéro d'issue `<n>`.

## 2. Vérifier l'état
- `git status --porcelain` : si des modifications non commitées existent, prévenir et s'arrêter (ne jamais committer sans demande explicite).
- `git log main..HEAD --oneline` : si aucun commit d'avance, le signaler et s'arrêter.
- `gh pr list --head <branche> --state open --json url` : si une PR existe déjà, donner son URL et s'arrêter.

## 3. Préparer le contenu
- `gh issue view <n> --json title,body,url` et `git log main..HEAD --format=%s`.
- Titre : `[Issue #<n>] <résumé en une phrase courte>` (en anglais, impératif, ~60 caractères, sans point final), ex. `[Issue #42] Validate replay extension and size on upload`.
- Description : 2 à 4 puces sur ce qui change, puis `Closes #<n>`, puis la ligne `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## 4. Pousser et créer la PR
- `git push -u origin <branche>`
- `gh pr create --base main --head <branche> --title "<titre>" --body "<description>"` (utiliser un fichier temporaire du scratchpad pour le corps si multi-ligne : `--body-file`).
- Récupérer l'URL de la PR.

## 5. Passer l'issue à "In review"
Repose sur GitHub Projects v2.
1. `gh issue view <n> --json projectItems` : projet lié et `id` de l'item. Si l'issue n'est dans aucun projet, le signaler sans l'ajouter.
2. `gh project field-list <projet> --owner <owner> --format json` : id du champ `Status` et de l'option `In review`.
3. `gh project view <projet> --owner <owner> --format json` : id du projet.
4. `gh project item-edit --project-id <id> --id <item-id> --field-id <status-field-id> --single-select-option-id <option-id>`
5. Relire l'état pour confirmer.

Si `gh project` échoue avec `missing required scopes`, dire à l'utilisateur de lancer `! gh auth refresh -s project` puis refaire cette étape (la PR est déjà créée, ne pas la recréer).

## 6. Rapport (concis)
URL de la PR, titre, statut de l'issue. Signaler toute étape non faite.
