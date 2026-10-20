# RL-Coach

Application d'analyse de statistiques Rocket League à partir de fichiers `.replay` uploadés par l'utilisateur.

- **Front** : React (Vite), dans `frontend/`
- **Back** : Python / FastAPI, dans `backend/`
- **Stockage** : le replay est parsé à l'upload et seul le JSON résultant est sauvegardé dans `data/games/` (ignoré par Git, créé au démarrage du back)

## Prérequis

- Python 3.10+
- Node.js 18+
- rrrocket : binaire de parsing des replays

### Installer rrrocket (Windows)

Depuis la racine du dépôt : `.\scripts\install-rrrocket.ps1` (télécharge la version 0.11.8 et place `rrrocket.exe` dans `backend/bin/` ; `-Force` pour le réinstaller).

Manuellement : télécharger `rrrocket-0.11.8-x86_64-pc-windows-msvc.zip` depuis https://github.com/nickbabcock/rrrocket/releases/tag/v0.11.8, puis extraire `rrrocket.exe` dans `backend/bin/`. Le chemin peut être modifié via la variable d'environnement `RRROCKET_PATH`.

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

### Hooks Git (obligatoire avant le premier commit)

Un hook `pre-commit` (dans `.githooks/`) ajoute automatiquement une version (numéro, date, auteur, branche) à l'historique en bas de `SPECS.md` quand un commit modifie ce fichier. Git ne l'active pas tout seul. C'est fait automatiquement par `npm install` dans `frontend/` (script `prepare`) et à chaque session Claude Code (hook `SessionStart`). Sinon, à faire une fois après chaque clone :

```powershell
git config core.hooksPath .githooks
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
2. Le back valide l'extension et la taille.
3. `services/parser.py` extrait les données du replay via le binaire rrrocket.
4. `services/stats.py` construit les données du match (stats, trajectoires, heatmaps).
5. `services/storage.py` sauvegarde uniquement le JSON dans `data/games/` (nom UUID) ; le replay n'est jamais conservé.

## Structure

```
RL-Coach/
├── backend/
│   ├── app/
│   │   ├── main.py            # app FastAPI, CORS, routers
│   │   ├── config.py          # chemins, taille max d'upload, origines CORS
│   │   ├── api/routes/        # endpoints HTTP (replays)
│   │   ├── services/          # storage, parser, stats
│   │   └── schemas/           # modèles Pydantic
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/               # client HTTP vers le back
│       ├── components/        # composants réutilisables
│       └── pages/             # liste des replays, détail/stats
└── data/games/                # non suivi par Git
```
