---
name: create-feature
description: Orchestre la création d'une feature de A à Z à partir d'une demande fonctionnelle - analyse d'impact, plan, validation, implémentation, tests, documentation, exécution des tests, validation finale et commit.
argument-hint: <demande fonctionnelle de la feature>
---

Tu orchestres le développement complet d'une feature. La demande fonctionnelle est : `$ARGUMENTS`

Si elle est vide ou trop vague pour être analysée, demande des précisions avant de commencer.

Tu coordonnes les agents `analyze-feature`, `implement-feature`, `generation-tests` et `documentation` via l'outil Agent. Suis les étapes **dans l'ordre**, sans en sauter. Annonce brièvement chaque étape au démarrage. Sois concis.

## Étape 1 : Analyse

Lance l'agent `analyze-feature` avec la demande fonctionnelle et le contexte utile. Récupère son rapport (zones touchées, dépendances, points d'attention, questions ouvertes).

## Étape 2 : Plan d'implémentation

À partir du rapport, rédige un plan d'implémentation **précis et sans ambiguïté**, car l'agent d'implémentation ne prendra aucune décision de conception :

- Étapes ordonnées, chacune avec fichier(s), fonction(s), signatures, comportements, valeurs et gestion d'erreurs attendus.
- Choix de conception tranchés explicitement.
- Points d'attention du rapport et la façon de les traiter.
- Périmètre : ce qui est exclu.
- Tests à prévoir (nominal, erreurs, limites).

Si des questions ouvertes de l'analyse empêchent de trancher, pose-les à l'utilisateur.

## Étape 3 : Validation n°1 (utilisateur)

Présente le résumé de l'analyse et le plan complet. **Arrête-toi et attends** la réponse de l'utilisateur (outil AskUserQuestion ou message).

- Modifications demandées : mets à jour le plan et re-présente-le.
- Refus : arrête le processus.
- N'avance qu'avec un accord explicite.

## Étape 4 : Implémentation

Lance l'agent `implement-feature` avec le plan validé, intégralement.

S'il revient avec des questions ou des contradictions, **ne réponds pas à sa place** pour les choix de conception : relaie-les à l'utilisateur, mets à jour le plan, puis relance l'agent (ou reprends-le via SendMessage). Si l'agent signale des remarques hors plan, garde-les pour le compte rendu final.

## Étape 5 : Génération des tests

Lance l'agent `generation-tests` en lui donnant la feature, les fichiers et méthodes créés ou modifiés, et le plan.

## Étape 6 : Génération de la documentation

Lance l'agent `documentation` sur la feature. Il rend la documentation en Markdown dans sa réponse : écris-la dans un fichier en suivant les conventions du dépôt (dossier `docs/`, README, etc.). S'il n'y en a pas, propose un emplacement à l'utilisateur à l'étape suivante.

Les étapes 5 et 6 sont indépendantes : tu peux les lancer en parallèle.

## Étape 7 : Lancement des tests

Exécute la suite de tests du dépôt (au minimum les nouveaux tests et ceux des zones touchées) avec Bash, en détectant la commande adaptée (pytest, npm test, dotnet test, mvn test, etc.).

- Tout passe : continue.
- Échec : analyse la cause. Test mal écrit ou erreur d'implémentation conforme au plan : corrige-la avec l'agent concerné (maximum 2 cycles de correction). Si l'échec vient d'un défaut du plan ou demande une décision de conception, ou persiste après 2 cycles, arrête-toi et demande à l'utilisateur.
- Ne désactive, ne supprime ni n'assouplis jamais un test pour le faire passer.
- Si aucune commande de test n'est détectable, demande-la.

## Étape 8 : Validation n°2 (utilisateur)

Présente :
- Fichiers créés/modifiés (`git status` / `git diff --stat`).
- Résumé de l'implémentation, des tests ajoutés et de la documentation.
- Résultat de l'exécution des tests (échecs inclus, sans minimiser).
- Remarques hors plan remontées par les agents.

**Arrête-toi et attends** une validation explicite. En cas de retouches demandées, applique-les (via l'agent adapté), relance les tests, puis re-présente.

## Étape 9 : Commit

Seulement après l'accord de l'étape 8 :

1. Vérifie avec `git status` que seuls les fichiers de la feature sont concernés ; n'ajoute pas de fichiers sans rapport (laisse-les de côté et signale-les).
2. Ajoute les fichiers de la feature par leur nom (pas de `git add -A`).
3. Commit avec un message clair suivant le style des commits récents du dépôt (`git log`), terminé par la ligne d'attribution requise par le contexte de la session.
4. Ne fais **pas** de push sauf demande explicite.

## Compte rendu final

Court : feature livrée, hash du commit, fichiers touchés, tests passés, documentation produite, remarques ou points restants.
