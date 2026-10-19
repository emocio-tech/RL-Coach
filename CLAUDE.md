# RL-Coach

Application d'analyse de statistiques Rocket League à partir de fichiers `.replay` uploadés par l'utilisateur.

## Stack
- **Front** : React (Vite) dans `frontend/`
- **Back** : Python / FastAPI dans `backend/`
- **Stockage des replays** : `data/replays/` (ignoré par Git, créé au démarrage du back)

## Architecture
```
RL-Coach/
├── backend/
│   ├── app/
│   │   ├── main.py            # création de l'app FastAPI, CORS, routers
│   │   ├── config.py          # chemins, taille max d'upload, origines CORS
│   │   ├── api/routes/        # endpoints HTTP (replays, stats)
│   │   ├── services/          # storage (fichiers), parser (.replay), stats (calculs)
│   │   └── schemas/           # modèles Pydantic des réponses
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/               # client HTTP vers le back
│       ├── components/        # composants réutilisables (upload, tableaux, graphes)
│       └── pages/             # pages (liste des replays, détail/stats)
├── data/replays/              # NON suivi par Git
└── CLAUDE.md
```

## Flux
1. Le front envoie un `.replay` (multipart) à `POST /api/replays`.
2. Le back valide l'extension/taille, sauvegarde dans `data/replays/` (nom UUID).
3. `services/parser.py` extrait les données du replay (point unique à brancher sur boxcars-py / rrrocket).
4. `services/stats.py` calcule les statistiques exposées via `GET /api/replays/{id}/stats`.

## Commandes
- Back : `cd backend; python -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements.txt; uvicorn app.main:app --reload` (port 8000)
- Front : `cd frontend; npm install; npm run dev` (port 5173, proxy `/api` vers 8000)
- Tests back : `cd backend; pytest`

## Conventions
- Code, noms de variables et commits en anglais ; échanges en français.
- Ne jamais committer de fichier `.replay` ni le contenu de `data/replays/`.
- Toute la logique métier dans `services/`, les routes restent fines.
- Ne pas committer sans demande explicite.
