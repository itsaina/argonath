# Railway Deployment — Lessons Learned

Toutes les erreurs rencontrées lors du déploiement sur Railway et leurs solutions.

---

## Structure du projet (monorepo)

```
Argonath V3/
├── app/        ← service Railway "frontend"
└── backend/    ← service Railway "argonath"
```

Chaque sous-dossier a son propre `railway.toml`. On déploie séparément :
```bash
cd backend && railway up --service argonath
cd app     && railway up --service frontend
```

---

## 1. `better-sqlite3` — échec de compilation native

**Erreur :** `node-pre-gyp` ne trouve pas de binaire précompilé pour l'environnement Railway → build fail.

**Cause :** `better-sqlite3` compile du code C++ natif et nécessite Python + build tools.

**Solution :** `backend/nixpacks.toml`
```toml
[phases.setup]
aptPkgs = ["python3", "python3-dev", "build-essential"]
```

> **Piège :** ne PAS utiliser `nixPkgs = ["nodejs_20", "python3", ...]` — ça entre en conflit avec le Node auto-détecté par nixpacks et casse le build.

---

## 2. React build bloqué par les warnings ESLint

**Erreur :** `CI=true` (défaut sur Railway) transforme tous les warnings ESLint en erreurs → build fail.

**Solution :** ajouter l'env var sur le service frontend Railway :
```
CI=false
```

---

## 3. `npm install` échoue sur les peer deps

**Erreur :** conflits de peer dependencies dans `app/` (hedera-wallet-connect, wagmi, etc.) → `npm ci` fail.

**Solution :** `app/.npmrc`
```
legacy-peer-deps=true
```

---

## 4. `Cannot GET /` sur le frontend déployé

**Erreur :** le frontend s'affiche mais retourne 404 sur toutes les routes React (SPA).

**Cause :** il faut un serveur statique qui redirige tout vers `index.html`.

**Solution :** `app/railway.toml`
```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npx serve -s build --listen $PORT"
```

> Le flag `-s` (single-page app mode) est indispensable.

---

## 5. Variables d'environnement REACT_APP_* non prises en compte

**Erreur :** le frontend appelle `localhost:3001` au lieu du backend Railway.

**Cause :** les variables `REACT_APP_*` sont bakées dans le bundle JS **au moment du build**, pas au runtime.
Elles doivent être définies dans Railway **avant** de lancer le build.

**Variables frontend à configurer avant le build :**
```
REACT_APP_API_URL=https://<backend>.up.railway.app/api
REACT_APP_RPC_URL=https://testnet.hashio.io/api
REACT_APP_CHAIN_ID=0x128
REACT_APP_MOCK_CASH_ADDRESS=0x...
REACT_APP_CLAIM_REGISTRY_ADDRESS=0x...
REACT_APP_BOND_TOKEN_ADDRESS=0x...
REACT_APP_REPO_ESCROW_ADDRESS=0x...
REACT_APP_BOND_METADATA_ADDRESS=0x...
REACT_APP_HASHSCAN_URL=https://hashscan.io/testnet/transaction/
REACT_APP_HTS_TOKEN_ID=0.0.XXXXX
REACT_APP_HCS_TOPIC_ID=0.0.XXXXX
CI=false
```

---

## 6. CORS bloqué en production

**Erreur :** le frontend Railway est bloqué par CORS lors des appels au backend.

**Cause :** `FRONTEND_URL` n'était pas défini sur le backend, donc seul `localhost:3000` était autorisé.

**Solution :** après avoir obtenu l'URL frontend (`railway domain --service frontend`), la définir sur le backend :
```bash
railway variables set FRONTEND_URL="https://frontend-production-xxxx.up.railway.app" --service argonath
```

Le backend accepte plusieurs origines (séparées par virgule) :
```js
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',').map(o => o.trim());
```

---

## 7. Variables contenant des caractères spéciaux (`$`, `!`, etc.)

**Erreur :** `invalid apikey` — la clé API était tronquée après un `$`.

**Cause :** le shell interprète `$` comme le début d'une variable lors du `railway variables set`.

**Solution :** toujours utiliser des guillemets **simples** pour les valeurs avec caractères spéciaux :
```bash
railway variables set 'VERIFYWAY_API_KEY=1803$gBWA...' --service argonath
```

---

## 8. `app/.git` imbriqué

**Erreur :** Railway ne trackait pas `app/` correctement car il avait son propre `.git`.

**Solution :**
```bash
rm -rf app/.git
git add app/
git commit -m "include app/ in monorepo"
```

---

## 9. Fichiers sensibles committés par erreur

**Fichiers à ne jamais committer :** `.env`, `*.db`, `*.log`, `artifacts/`, `cache/`

**`.gitignore` racine :**
```
.env
.env.*
!.env.example
*.db
*.log
artifacts/
cache/
.claude/
node_modules/
```

---

## Ordre de déploiement recommandé

```bash
# 1. Déployer le backend
cd backend
railway variables set KEY=value ...   # toutes les vars backend
railway up --service argonath

# 2. Récupérer l'URL backend
# → https://argonath-production-xxxx.up.railway.app

# 3. Configurer les vars frontend (REACT_APP_API_URL notamment)
cd ../app
railway variables set REACT_APP_API_URL=https://argonath-production-xxxx.up.railway.app/api --service frontend
railway variables set CI=false --service frontend
# ... autres REACT_APP_* ...

# 4. Déployer le frontend
railway up --service frontend

# 5. Générer le domaine public frontend
railway domain --service frontend
# → https://frontend-production-xxxx.up.railway.app

# 6. Mettre à jour FRONTEND_URL sur le backend (CORS)
cd ../backend
railway variables set FRONTEND_URL=https://frontend-production-xxxx.up.railway.app --service argonath
```
