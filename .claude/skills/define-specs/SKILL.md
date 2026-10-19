---
name: define-specs
description: Convertit des idées en vrac en specs fonctionnelles (descriptives, sans exigences ni critères d'acceptation, avec renvois possibles vers des issues GitHub) dans SPECS.md (créé à la racine s'il n'existe pas), en s'appuyant sur les specs existantes. Soumet un draft, pose des questions sur les zones floues, demande confirmation sur toute incohérence, puis écrit dans SPECS.md après validation.
---

# Définir les specs de RL-Coach

Entrée : les idées en vrac de l'utilisateur (arguments du skill ou message qui suit). Sortie : `SPECS.md` à la racine du repo, mis à jour **uniquement après validation explicite** de l'utilisateur.

Échanges en français ; le fichier de specs est rédigé en français.

## 1. Lire l'existant
- Lire `SPECS.md` s'il existe (sinon, noter qu'il sera créé).
- Lire `CLAUDE.md` (stack, architecture, flux, conventions) et au besoin `README.md` pour rester cohérent avec le projet.
- Ne rien écrire à ce stade.

## 2. Analyser les inputs
Pour chaque idée, la rattacher à une section existante (à compléter ou modifier) ou à une nouvelle section. Repérer :
- **Zones floues** : comportement, données, cas particuliers manquants ou ambigus pour décrire correctement la fonctionnalité.
- **Contenu de type ticket** : exigences fines, critères d'acceptation, tâches (voir « Nature de SPECS.md ») : à écarter de la spec.
- **Incohérences** : contradiction interne entre les inputs, ou avec les specs existantes / l'architecture du `CLAUDE.md`.
- **Frictions** : une idée qui obligerait à modifier ou supprimer une spec existante.

## 3. Poser les questions (avant le draft si bloquant)
- Utiliser `AskUserQuestion` pour les points flous qui changent le contenu des specs (2-4 questions max par tour, options concrètes, recommandation en premier).
- Pour chaque incohérence ou friction, **ne jamais trancher seul** : exposer la spec existante, la nouvelle idée, le conflit, et demander quoi garder.
- Ne pas poser de question dont la réponse est déductible du repo ou des specs existantes. Pour les détails mineurs, choisir une valeur par défaut raisonnable et la signaler dans le draft.

## 4. Soumettre le draft
Présenter dans la conversation (sans toucher au fichier) :
1. **Résumé des changements** : sections ajoutées / modifiées / supprimées.
2. **Le contenu proposé** des sections concernées, au format ci-dessous.
3. **Hypothèses retenues** (valeurs par défaut choisies) et **points ouverts** restants.
4. Demander validation ou corrections. Itérer (retour à l'étape 3 si besoin) jusqu'à accord explicite. Un silence ou une réponse ambiguë n'est pas une validation.

## 5. Écrire dans SPECS.md
Après validation uniquement :
- Créer `SPECS.md` à la racine s'il n'existe pas, sinon l'éditer (Edit) : modifier les sections concernées, ne pas réécrire ni reformater ce qui n'a pas été discuté.
- Ne contenir que ce qui a été validé. Pas de commit (conventions du projet : pas de commit sans demande explicite).
- Si le fichier est créé, y ajouter aussi la section « Historique des versions » (voir plus bas) en toute fin. Les nouvelles sections de specs s'insèrent **au-dessus** de cette section, qui reste toujours en bas du fichier.
- Confirmer à l'utilisateur ce qui a été écrit (sections touchées).

## Historique des versions dans SPECS.md
Section toujours placée **tout en bas** du fichier, dépliable (balises HTML `<details>`), une ligne de tableau par version :

```markdown
<details>
<summary>Historique des versions</summary>

| Version | Date | Auteur | Branche |
|---------|------|--------|---------|
| 1 | 2026-10-19 14:32 | iwao | main |

</details>
```

Règles :
- Ce skill **ne crée, ne modifie et ne supprime jamais d'entrée** dans cette liste, et ne demande pas à l'utilisateur d'en créer une : les entrées sont gérées en dehors de ce skill.
- Quand il écrit dans `SPECS.md`, il laisse la section intacte et reste en bas du fichier.
- Si le fichier est créé, ou existe sans cette section, la créer en bas avec un tableau vide (en-têtes seulement).
- Format d'une entrée (pour référence) : version incrémentale à partir de 1, date `yyyy-MM-dd HH:mm`, auteur (`git config user.name`), nom de la branche (`git branch --show-current`).

## Nature de SPECS.md : une spec fonctionnelle, pas un ticket
`SPECS.md` décrit l'application et son comportement du point de vue fonctionnel : à quoi elle sert, ce qu'elle fait, comment les parties s'articulent. Ce n'est **ni une US ni un ticket**.

À **ne pas** y mettre, car cela relève des US/tickets :
- exigences numérotées (« le système doit… ») et leurs IDs ;
- critères d'acceptation, cases à cocher, conditions de recette ;
- détails de périmètre (« hors périmètre », « à faire », écarts avec le code actuel, plan de migration) ;
- détails techniques d'implémentation, sauf contrainte réelle qui structure l'application (stack, architecture générale).

Si un input de l'utilisateur est de cette nature (exigence fine, critère d'acceptation, tâche), ne pas l'écrire dans la spec : le signaler dans le draft et suggérer d'en faire une issue GitHub.

**Références aux issues** : la spec peut référencer des issues GitHub du repo (`#12` ou lien complet) pour renvoyer vers le détail d'une évolution, mais ne recopie pas leur contenu.

## Format de SPECS.md
Document descriptif, une section par fonctionnalité/domaine, en prose. Le niveau de détail suit celui demandé par l'utilisateur : une présentation générale peut tenir en quelques phrases.

```markdown
# Specs RL-Coach

## <Domaine ou fonctionnalité>
Quelques phrases décrivant ce que c'est et ce que ça fait.

- Point fonctionnel plus précis, uniquement quand l'utilisateur veut ce niveau de détail.
- Renvoi éventuel vers une issue : voir #12.
```

Règles de rédaction : phrases courtes, présent de l'indicatif (« L'application a… », « Le front communique… »), aucun terme vague (« rapide », « joli »… → valeur mesurable si une valeur est donnée), vocabulaire fonctionnel. Les puces sont réservées aux points précis demandés par l'utilisateur ; ne pas en ajouter pour structurer artificiellement.
