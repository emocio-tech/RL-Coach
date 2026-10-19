# RL-Coach

Application d'analyse de statistiques Rocket League à partir de fichiers `.replay` uploadés par l'utilisateur.

- **Front** : React (Vite), dans `frontend/`
- **Back** : Python / FastAPI, dans `backend/`
- **Stockage** : les replays sont sauvegardés dans `data/replays/` (ignoré par Git, créé au démarrage du back)

## Prérequis

- Python 3.10+
- Node.js 18+

## Installation

Depuis la racine du dépôt, en PowerShell.

### Back

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..
```

### Front

```powershell
cd frontend
npm install
cd ..
```

## Lancement

Deux terminaux sont nécessaires.

### Back (port 8000)

```powershell
cd backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

### Front (port 5173)

```powershell
cd frontend
npm run dev
```

Le proxy Vite redirige `/api` vers le back (port 8000).

### URLs

| Service | URL |
|---------|-----|
| Front | http://localhost:5173 |
| API | http://localhost:8000 |
| Documentation API (Swagger) | http://localhost:8000/docs |
| Health check | http://localhost:8000/api/health |

## Tests

```powershell
cd backend
pytest
```

## Fonctionnement

1. Le front envoie un `.replay` (multipart) à `POST /api/replays`.
2. Le back valide l'extension et la taille, puis sauvegarde le fichier dans `data/replays/` (nom UUID).
3. `services/parser.py` extrait les données du replay (point d'entrée prévu pour boxcars-py / rrrocket).
4. `services/stats.py` calcule les statistiques exposées via `GET /api/replays/{id}/stats`.

## Structure

```
RL-Coach/
├── backend/
│   ├── app/
│   │   ├── main.py            # app FastAPI, CORS, routers
│   │   ├── config.py          # chemins, taille max d'upload, origines CORS
│   │   ├── api/routes/        # endpoints HTTP (replays, stats)
│   │   ├── services/          # storage, parser, stats
│   │   └── schemas/           # modèles Pydantic
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/               # client HTTP vers le back
│       ├── components/        # composants réutilisables
│       └── pages/             # liste des replays, détail/stats
└── data/replays/              # non suivi par Git
```
