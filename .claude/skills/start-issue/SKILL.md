---
name: start-issue
description: Démarre le cycle de développement d'une issue GitHub - se place sur main, pull, crée la branche issue-numero-court-descriptif et passe l'issue en "In progress". Entrée - un numéro d'issue ou un résumé de ce qu'elle fait.
argument-hint: <numéro d'issue | résumé>
---

# Démarrer une issue

Entrée : `$ARGUMENTS` (numéro d'issue, ex. `42` ou `#42`, ou résumé en texte libre). Si vide, demander à l'utilisateur et s'arrêter.

En PowerShell, depuis la racine du repo. Ne jamais committer ni pusher.

## 1. Résoudre l'issue
- Numéro : `gh issue view <n> --json number,title,state,url`.
- Résumé : `gh issue list --state open --search "<résumé>" --json number,title --limit 10`.
  - Un seul résultat clair : le prendre.
  - Plusieurs ou aucun : présenter les candidats et demander lequel (ne pas deviner, ne pas créer d'issue).
- Si l'issue est fermée ou introuvable, le signaler et s'arrêter.

## 2. Se placer sur main et mettre à jour
- `git status --porcelain` : si des modifications sont en cours, prévenir l'utilisateur et s'arrêter (ne pas stash ni écraser).
- `git checkout main`
- `git pull --ff-only`. En cas d'échec, afficher l'erreur et s'arrêter.

## 3. Créer la branche
Nom : `issue-<numero>-<court-descriptif>`
- Descriptif tiré du titre, en anglais, minuscules, ASCII, mots séparés par `-`, 3 à 5 mots max (ex. `issue-42-upload-replay-validation`).
- Si la branche existe déjà (`git branch --list`), proposer de s'y placer au lieu de la recréer.
- `git checkout -b <branche>`

## 4. Passer l'issue à "In progress"
Repose sur GitHub Projects v2.
1. Trouver le projet et l'item :
   `gh issue view <n> --json projectItems` donne le projet lié (numéro, titre) et l'`id` de l'item.
2. Si l'issue n'est dans aucun projet : le signaler, ne pas l'ajouter sans demande.
3. Récupérer les ids :
   - `gh project field-list <projet> --owner <owner> --format json` : id du champ `Status` et id de l'option `In progress`.
   - `gh project view <projet> --owner <owner> --format json` : id du projet.
4. `gh project item-edit --project-id <id> --id <item-id> --field-id <status-field-id> --single-select-option-id <option-id>`
5. Relire l'état pour confirmer.

Si les commandes `gh project` échouent avec `missing required scopes`, dire à l'utilisateur de lancer `! gh auth refresh -s project` (puis relancer l'étape 4). Les étapes 1 à 3 restent valables.

## 5. Rapport (concis)
Numéro et titre de l'issue, branche créée, statut du projet. Signaler toute étape non faite (scope manquant, issue hors projet).
