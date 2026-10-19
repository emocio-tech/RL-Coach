---
name: kill-app
description: Arrête RL-Coach en tuant les processus qui écoutent sur les ports 8000 (back FastAPI) et 5173 (front Vite) en PowerShell
---

# Arrêter RL-Coach (front + back)

En PowerShell. Cible uniquement les processus qui écoutent sur les ports du projet.

## 1. Identifier
```powershell
Get-NetTCPConnection -State Listen -LocalPort 8000,5173 -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess
```
Si rien n'est retourné, répondre que l'app n'est pas lancée et s'arrêter.

## 2. Tuer
Pour chaque `OwningProcess` distinct, tuer le processus et ses enfants (uvicorn `--reload` et Vite lancent des sous-processus) :
```powershell
taskkill /PID <pid> /T /F
```
Ne tuer que ces PID, jamais `python` ou `node` en bloc.

## 3. Vérifier
Relancer la commande de l'étape 1 : elle ne doit plus rien retourner. Sinon, afficher les PID restants sans boucler.

## 4. Rapport
Indiquer quels ports ont été libérés (8000 back, 5173 front). Si des tâches de fond de la session existent encore, les arrêter aussi.
