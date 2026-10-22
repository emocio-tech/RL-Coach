# RL-Coach

Application d'analyse de statistiques Rocket League à partir de fichiers `.replay` uploadés par l'utilisateur.

## Stack
- **Front** : React (Vite) dans `frontend/`
- **Back** : Python / FastAPI dans `backend/`
- **Parsing des replays** : binaire rrrocket (dans `backend/bin/`, ignoré par Git)
- **Stockage** : JSON dans `data/games/` (ignoré par Git, créé au démarrage du back)

## Architecture
```
RL-Coach/
├── backend/
│   ├── app/
│   │   ├── main.py            # création de l'app FastAPI, CORS, routers
│   │   ├── config.py          # chemins, taille max d'upload, origines CORS, config LLM (.env)
│   │   ├── api/routes/        # endpoints HTTP (replays, chat)
│   │   ├── services/          # storage (fichiers), parser (.replay), stats (calculs), coach (LLM + outils)
│   │   └── schemas/           # modèles Pydantic (replay, chat)
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/               # client HTTP vers le back
│       ├── components/        # composants réutilisables (upload, tableaux, graphes)
│       └── pages/             # pages (liste des replays, détail/stats)
├── data/games/                # NON suivi par Git
└── CLAUDE.md
```

## Flux
1. Le front envoie un `.replay` (multipart) à `POST /api/replays`.
2. Le back extrait les données via rrrocket, puis sauvegarde uniquement `stats.json` et `map.json` dans un dossier de `data/games/` (nom `<stade>_<mode>_<id replay>`, suffixe `_N` en cas de collision entre deux matchs différents ; un replay déjà importé, même `Id`, renvoie le dossier existant sans rien écrire) ; le `.replay` n'est jamais conservé.

## Coach IA
- `POST /api/chat` (`routes/chat.py`, `schemas/chat.py`) : chat stateless, le front renvoie l'historique ; `services/coach.py` appelle le LLM (SDK OpenAI, function calling, 7 outils sans `game_id`, fixé côté serveur).
- Config via `.env` à la racine (ignoré par Git, modèle : `.env.example`) : `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL` (défaut `nova-lite`). Ne jamais committer le `.env`.

## Serveur MCP
- `backend/app/mcp_server.py` (stdio, SDK `mcp` 2.x) expose les parties importées à tout agent MCP : 8 outils (7 en lecture seule qui réutilisent `services/coach.py` avec `game_id` en argument, plus `import_replay` qui importe un `.replay` local par chemin absolu via `coach.import_replay`, absent du chat). Lancement : `cd backend; python -m app.mcp_server`. Aucun `print` (stdout = protocole).
- `.mcp.json` à la racine branche Claude Code ; autres agents : voir `docs/mcp.md`.

## Commandes
- Back : `cd backend; python -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements.txt; uvicorn app.main:app --reload` (port 8000)
- Front : `cd frontend; npm install; npm run dev` (port 5173, proxy `/api` vers 8000)
- Tests back : `cd backend; pytest`
- Tests front : `cd frontend; npm test`

## Hooks Git
- `.githooks/pre-commit` : si un commit modifie `SPECS.md` (hors historique), ajoute une ligne (version, date, auteur, branche) dans l'historique des versions en bas du fichier et la met dans le commit. Ne jamais éditer cet historique à la main ni via `/define-specs`.
- Activation : `git config core.hooksPath .githooks`, faite automatiquement par `npm install` dans `frontend/` (script `prepare`) et au démarrage de chaque session Claude Code (hook `SessionStart` de `.claude/settings.json`). Vérifier avec `git config core.hooksPath` avant de committer ; si vide, l'exécuter.
- Les scripts de `.githooks/` doivent rester en fins de ligne LF (`.gitattributes`).

## Conventions
- Code, noms de variables et commits en anglais ; échanges en français.
- Ne jamais committer de fichier `.replay` ni le contenu de `data/`.
- Toute la logique métier dans `services/`, les routes restent fines.
- Ne pas committer sans demande explicite.
