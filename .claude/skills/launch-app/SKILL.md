---
name: launch-app
description: Installe les dépendances manquantes et lance RL-Coach (back FastAPI sur 8000 + front React/Vite sur 5173) en PowerShell
---

# Lancer RL-Coach (front + back)

Depuis la racine du repo, en PowerShell. Les chemins sont relatifs à la racine.

## 1. Prérequis
Vérifier `python --version` (3.10+) et `node --version` (18+). Sinon, signaler à l'utilisateur.

## 2. Dépendances (seulement si manquantes)
- Back : si `backend\.venv` n'existe pas :
  `python -m venv backend\.venv`
  puis, dans tous les cas, `backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt`
- Front : si `frontend\node_modules` n'existe pas : `npm install --prefix frontend`

## 3. Lancement (deux processus en arrière-plan)
- Back : `backend\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --app-dir backend`
- Front : `npm run dev --prefix frontend`

Lancer chacun avec `run_in_background`.

## 4. Vérification
- `Invoke-RestMethod http://localhost:8000/api/health` doit renvoyer `status: ok`.
- Le front répond sur http://localhost:5173 (le proxy `/api` pointe vers le back).

## 5. Rapport
Donner à l'utilisateur les URLs : front http://localhost:5173, API http://localhost:8000, doc http://localhost:8000/docs. En cas d'échec, afficher l'erreur (port occupé, module manquant) sans relancer en boucle.

## Arrêt
Arrêter les deux tâches en arrière-plan.
