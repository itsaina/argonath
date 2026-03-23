# Argonath V3

Plateforme de tokenisation de titres financiers (T-Bills, obligations gouvernementales) et de marché repo bilatéral on-chain, déployée sur **Hedera EVM testnet**.

---

## Architecture

```
Argonath V3/
├── contracts/          # Smart contracts Solidity (Hardhat)
│   ├── ClaimRegistry.sol   — registre on-chain des droits de redeem
│   ├── BondToken.sol       — token ARGN (ERC-20, 0 décimales, HTS-compatible)
│   ├── BondMetadata.sol    — registre on-chain des maturités par wallet
│   ├── RepoEscrow.sol      — séquestre repo bilatéral (Mode A + Mode B)
│   └── MockCash.sol        — wMGA stablecoin (tests / PoC)
├── scripts/            # Scripts de déploiement Hardhat
│   ├── deploy.js           — déploie tous les contrats + met à jour les .env
│   ├── deploy-escrow.js    — redéploie uniquement RepoEscrow
│   └── create-hcs-topic.js — crée le topic HCS de notarisation
├── test/               # Tests Hardhat (Chai + hardhat-network-helpers)
│   ├── ClaimRegistry.test.js
│   └── RepoEscrow.test.js
├── backend/            # API REST Node.js/Express
│   └── src/
│       ├── routes/         — auth, claims, otp, repo, hcs
│       ├── services/       — hcs.js, hts.js, signer.js
│       ├── db/             — pool.js (PostgreSQL), schema.sql
│       └── index.js
└── app/                # Frontend React
    └── src/
        ├── pages/          — Home, Investor, Market, Depositary, Docs
        ├── components/     — Navbar, Footer, WalletSelectionDialog
        ├── services/       — contracts.js, api.js, wallets/
        └── contexts/
```

---

## Stack technique

| Couche | Technologie |
|---|---|
| Smart contracts | Solidity 0.8.28, Hardhat 2.x, OpenZeppelin 5.x |
| EVM cible | Hedera testnet (chainId `296` / `0x128`), Hardhat local (`31337`) |
| Token standard | ERC-20 (0 décimales) + HTS via HIP-218 |
| Notarisation | Hedera Consensus Service (HCS) — preuves immuables off-chain |
| Backend | Node.js 20, Express 4, better-sqlite3 / PostgreSQL (pg) |
| Auth investisseur | OTP WhatsApp via Verifyway API |
| Frontend | React 18, Create React App + CRACO, MUI v5, ethers v5 |
| Wallets | MetaMask (window.ethereum) + WalletConnect / Hedera Wallet Connect |
| Déploiement | Railway (backend + frontend séparés) |

---

## Contrats

### ClaimRegistry
Registre d'autorisation on-chain. Le backend (owner) autorise un wallet à redeem un claim via `authorize(bytes32, address)`. L'investisseur appelle `redeem()` qui émet un event — le backend écoute et déclenche le mint HTS.

### BondToken (ARGN)
ERC-20 avec 0 décimales : 1 ARGN = 1 titre. Mintable uniquement par le `ClaimRegistry`. Compatible HTS via l'interface ERC-20 standard (HIP-218).

### BondMetadata
Registre on-chain des maturités de bonds par wallet. Seul le dépositaire (owner) peut écrire via `setMaturity()` ou `refreshMaturity()`. `RepoEscrow` lit ce registre pour valider les repos sans que l'user puisse falsifier la date.

### RepoEscrow
Séquestre bilatéral pour opérations repo. Deux modes :

**Mode A — Lending Offer** : le prêteur bloque du wMGA → l'emprunteur accepte (DvP atomique).

**Mode B — Borrow Request** : l'emprunteur bloque des ARGN → les prêteurs proposent → financement après whitelist on-chain (`setAcceptedLender`).

Machine d'états :
```
Open → Active → MarginCalled → Repaid
                             ↓
                         Defaulted  (après expiration de la grace period 4h)
```

Calcul des intérêts : **ACT/365** — `cashAmount × rateBps × durationSeconds / (10000 × 31536000)`

### MockCash (wMGA)
ERC-20 à 6 décimales simulant le wMGA (ariary malgache tokenisé). Mintable librement — PoC uniquement.

---

## Prérequis

- Node.js >= 18
- npm >= 9
- Compte Hedera testnet avec HBAR (obtenir sur [portal.hedera.com](https://portal.hedera.com/))
- Compte Railway (déploiement)
- Clé API Verifyway (OTP WhatsApp)

---

## Installation

```bash
# Cloner le repo
git clone <repo-url>
cd "Argonath V3"

# Installer les dépendances root (Hardhat)
npm install

# Installer le backend
cd backend && npm install && cd ..

# Installer le frontend
cd app && npm install && cd ..
```

---

## Variables d'environnement

### Backend — `backend/.env`

```env
# Base de données
DATABASE_URL=postgresql://user:password@host:5432/argonath

# Hedera
HEDERA_ACCOUNT_ID=0.0.XXXXX
HEDERA_PRIVATE_KEY=0x...          # clé ECDSA du compte Hedera
ADMIN_PRIVATE_KEY=0x...           # même clé — utilisée pour signer les tx on-chain

# Contrats
CLAIM_REGISTRY_ADDRESS=0x...
RPC_URL=https://testnet.hashio.io/api

# HCS
HCS_TOPIC_ID=0.0.XXXXX

# HTS
HTS_TOKEN_ID=0.0.XXXXX

# OTP WhatsApp (Verifyway)
VERIFYWAY_API_KEY=...

# CORS
FRONTEND_URL=https://votre-frontend.railway.app

# Optionnel
PORT=3001
ALLOW_TEST_AUTHORIZE=true         # active le mode test sans OTP (ne pas activer en prod)
```

### Frontend — `app/.env`

```env
REACT_APP_MOCK_CASH_ADDRESS=0x...
REACT_APP_CLAIM_REGISTRY_ADDRESS=0x...
REACT_APP_BOND_TOKEN_ADDRESS=0x...      # adresse EVM du token HTS (via HIP-218)
REACT_APP_REPO_ESCROW_ADDRESS=0x...
REACT_APP_BOND_METADATA_ADDRESS=0x...
REACT_APP_HTS_TOKEN_ID=0.0.XXXXX
REACT_APP_RPC_URL=https://testnet.hashio.io/api
REACT_APP_CHAIN_ID=0x128                # 0x128 = Hedera testnet | 0x7a69 = Hardhat local
REACT_APP_HASHSCAN_URL=https://hashscan.io/testnet/transaction/
REACT_APP_API_URL=https://votre-backend.railway.app
```

---

## Lancer en local (développement)

### 1. Démarrer un nœud Hardhat local

```bash
npx hardhat node
```

### 2. Déployer les contrats (local)

```bash
npx hardhat run scripts/deploy.js --network localhost
```

Le script met à jour automatiquement `app/.env` et `backend/.env` avec les adresses des contrats.

### 3. Lancer le backend

```bash
cd backend
npm run dev          # nodemon — hot reload
# ou
npm start
```

API disponible sur `http://localhost:3001`

### 4. Lancer le frontend

```bash
cd app
npm start
```

Frontend disponible sur `http://localhost:3000`

---

## Déploiement sur Hedera testnet

### Prérequis
- Avoir des HBAR testnet (via [portal.hedera.com](https://portal.hedera.com/))
- `HEDERA_PRIVATE_KEY` et `HEDERA_ACCOUNT_ID` dans l'environnement

```bash
# Créer un topic HCS (une seule fois)
HEDERA_ACCOUNT_ID=0.0.XXXXX HEDERA_PRIVATE_KEY=0x... \
  node scripts/create-hcs-topic.js

# Déployer tous les contrats
HEDERA_PRIVATE_KEY=0x... HEDERA_ACCOUNT_ID=0.0.XXXXX \
  npx hardhat run scripts/deploy.js --network hedera_testnet
```

Le script :
1. Déploie MockCash, ClaimRegistry, BondMetadata
2. Crée le token HTS ARGN via le SDK Hedera
3. Déploie RepoEscrow avec l'adresse EVM du token HTS
4. Mint 1M wMGA au deployer
5. Met à jour `app/.env` et `backend/.env`

---

## Tests des contrats

```bash
# Tous les tests
npx hardhat test

# Fichier spécifique
npx hardhat test test/RepoEscrow.test.js
npx hardhat test test/ClaimRegistry.test.js

# Avec coverage
npx hardhat coverage
```

Les tests couvrent :
- **ClaimRegistry** : authorize, redeem, double-redeem, accès non autorisé
- **RepoEscrow Mode A** : createLendingOffer, accept (DvP), repay, triggerMarginCall, claimDefault, cancelOffer
- **RepoEscrow Mode B** : createBorrowRequest, setAcceptedLender (anti-frontrunning), fundRequest, repayRequest, triggerMarginCallRequest, claimDefaultRequest, cancelRequest
- Calcul ACT/365, collateralRequired (formule plafond), machine d'états complète

---

## Déploiement Railway

Les deux services sont déployés séparément sur Railway.

### Backend

```bash
cd backend
railway up
```

Variables Railway à configurer : toutes les variables de `backend/.env` (section ci-dessus).

### Frontend

```bash
cd app
railway up
```

Variables Railway à configurer : toutes les variables de `app/.env`.

> Le frontend utilise CRACO pour résoudre les polyfills Node.js nécessaires (buffer, crypto, stream) dans le contexte browser.

---

## Flux utilisateur

### Investisseur — Redeem d'un T-Bill
1. Connexion wallet (MetaMask ou WalletConnect)
2. Vérification identité via OTP WhatsApp (Verifyway) → le backend autorise le wallet on-chain via `ClaimRegistry.authorize()`
3. L'investisseur appelle `ClaimRegistry.redeem()` on-chain
4. Le backend écoute l'event `ClaimRedeemed` et mint les tokens HTS ARGN
5. Les ARGN apparaissent dans le wallet

### Prêteur — Lending Offer (Mode A)
1. Approuver wMGA sur RepoEscrow
2. `createLendingOffer(cashAmount, repoRateBps, haircutBps, durationSeconds)`
3. Le backend persiste l'offre en DB + notarise sur HCS
4. L'emprunteur appelle `accept()` → DvP atomique on-chain

### Emprunteur — Borrow Request (Mode B)
1. Approuver ARGN sur RepoEscrow
2. `createBorrowRequest(collateralAmount, desiredCash, maxRateBps, durationSeconds)`
3. Les prêteurs soumettent des propositions dans l'UI
4. L'emprunteur accepte → `setAcceptedLender()` on-chain (anti-frontrunning)
5. Le prêteur appelle `fundRequest()` → wMGA envoyés à l'emprunteur

### Lifecycle repo — Remboursement / Défaut
- À maturité : le prêteur peut appeler `triggerMarginCall()` → état `MarginCalled`
- L'emprunteur dispose de **4h** (MARGIN_CALL_GRACE) pour rembourser via `repay()`
- Après 4h sans remboursement : le prêteur appelle `claimDefault()` → il reçoit le collatéral ARGN

---

## Calculs financiers

**Collatéral requis (Mode A)**
```
collateral = ceil(cashAmount / ((1 - haircut/10000) × 1e6))
```

**Remboursement ACT/365**
```
repayAmount = cashAmount + (cashAmount × rateBps × durationSeconds) / (10000 × 31536000)
```

**Affichage du taux annuel**
```
taux annuel (%) = rateBps / 100
ex: 500 bps → 5%
```

---

## Notarisation HCS

Chaque événement métier est publié sur un topic Hedera Consensus Service :

| Événement | Déclencheur |
|---|---|
| `wallet_phone_linked` | Vérification OTP réussie |
| `allocation_created` | Dépositaire crée une allocation |
| `allocation_redeemed` | Investisseur redeeme ses titres |
| `repo_proposal_submitted` | Prêteur soumet une proposition |
| `repo_proposal_accepted` | Emprunteur accepte + hash SHA-256 des termes |
| `repo_lending_offer_created` | Prêteur crée une offre |
| `repo_borrow_request_created` | Emprunteur crée une demande |
| `repo_offer_accepted` | DvP atomique accepté |
| `repo_request_funded` | Demande financée |
| `repo_repaid` | Remboursement effectué |
| `repo_default_claimed` | Défaut déclaré |

Les données personnelles ne sont jamais publiées en clair — uniquement des preuves cryptographiques (`keccak256(phone)`, `keccak256(firstName|lastName|phone)`, `keccak256(batchId)`).

---

## API Backend

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/otp/send` | Envoie un OTP WhatsApp |
| POST | `/api/otp/verify` | Vérifie le code + autorise on-chain |
| POST | `/api/otp/authorize-test` | Mode test sans OTP (dev uniquement) |
| GET | `/api/claims` | Liste toutes les allocations (dépositaire) |
| GET | `/api/claims/by-phone/:phone` | Allocations d'un investisseur |
| POST | `/api/claims` | Crée une allocation (dépositaire) |
| PUT | `/api/claims/:id/status` | Met à jour le statut |
| POST | `/api/claims/confirm-redeem` | Confirme le redeem + mint HTS |
| GET | `/api/repo/offers` | Liste les offres de prêt |
| POST | `/api/repo/offers` | Persiste une offre après tx on-chain |
| GET | `/api/repo/requests` | Liste les demandes d'emprunt |
| POST | `/api/repo/requests` | Persiste une demande après tx on-chain |
| GET | `/api/repo/proposals/:requestId` | Propositions pour une demande |
| POST | `/api/repo/proposals` | Soumet une proposition |
| PUT | `/api/repo/proposals/:id/accept` | Accepte une proposition |
| PUT | `/api/repo/proposals/:id/reject` | Rejette une proposition |
| GET | `/api/hcs/messages` | Messages HCS publics |
| GET | `/api/health` | Health check |

---

## License

Apache-2.0
