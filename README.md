# Argonath V3

On-chain tokenization platform for financial securities (T-Bills, government bonds) and bilateral repo market, deployed on **Hedera EVM testnet**.

---

## Architecture

```
Argonath V3/
├── contracts/          # Solidity smart contracts (Hardhat)
│   ├── ClaimRegistry.sol   — on-chain redemption rights registry
│   ├── BondToken.sol       — ARGN token (ERC-20, 0 decimals, HTS-compatible)
│   ├── BondMetadata.sol    — on-chain bond maturity registry per wallet
│   ├── RepoEscrow.sol      — bilateral repo escrow (Mode A + Mode B)
│   └── MockCash.sol        — wMGA stablecoin mock (testing / PoC)
├── scripts/            # Hardhat deployment scripts
│   ├── deploy.js           — deploys all contracts + updates .env files
│   ├── deploy-escrow.js    — redeploys RepoEscrow only
│   └── create-hcs-topic.js — creates the HCS notarization topic
├── test/               # Hardhat tests (Chai + hardhat-network-helpers)
│   ├── ClaimRegistry.test.js
│   └── RepoEscrow.test.js
├── backend/            # REST API Node.js/Express
│   └── src/
│       ├── routes/         — auth, claims, otp, repo, hcs
│       ├── services/       — hcs.js, hts.js, signer.js
│       ├── db/             — pool.js (PostgreSQL), schema.sql
│       └── index.js
└── app/                # React frontend
    └── src/
        ├── pages/          — Home, Investor, Market, Depositary, Docs
        ├── components/     — Navbar, Footer, WalletSelectionDialog
        ├── services/       — contracts.js, api.js, wallets/
        └── contexts/
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity 0.8.28, Hardhat 2.x, OpenZeppelin 5.x |
| EVM target | Hedera testnet (chainId `296` / `0x128`), Hardhat local (`31337`) |
| Token standard | ERC-20 (0 decimals) + HTS via HIP-218 |
| Notarization | Hedera Consensus Service (HCS) — immutable off-chain proofs |
| Backend | Node.js 20, Express 4, better-sqlite3 / PostgreSQL (pg) |
| Investor auth | WhatsApp OTP via Verifyway API |
| Frontend | React 18, Create React App + CRACO, MUI v5, ethers v5 |
| Wallets | MetaMask (window.ethereum) + WalletConnect / Hedera Wallet Connect |
| Deployment | Railway (backend + frontend as separate services) |

---

## Contracts

### ClaimRegistry
On-chain authorization registry. The backend (owner) authorizes a wallet to redeem a claim via `authorize(bytes32, address)`. The investor calls `redeem()` which emits an event — the backend listens and triggers the HTS mint.

### BondToken (ARGN)
ERC-20 with 0 decimals: 1 ARGN = 1 security unit. Mintable only by the `ClaimRegistry`. HTS-compatible via the standard ERC-20 interface (HIP-218).

### BondMetadata
On-chain bond maturity registry per wallet. Only the depositary (owner) can write via `setMaturity()` or `refreshMaturity()`. `RepoEscrow` reads this registry to validate repos without allowing users to forge maturity dates.

### RepoEscrow
Bilateral escrow for repo operations. Two modes:

**Mode A — Lending Offer**: lender locks wMGA → borrower accepts (atomic DvP).

**Mode B — Borrow Request**: borrower locks ARGN → lenders submit proposals → funding after on-chain whitelist (`setAcceptedLender`, anti-frontrunning).

State machine:
```
Open → Active → MarginCalled → Repaid
                             ↓
                         Defaulted  (after 4h grace period expires)
```

Interest calculation: **ACT/365** — `cashAmount × rateBps × durationSeconds / (10000 × 31536000)`

### MockCash (wMGA)
ERC-20 with 6 decimals simulating wMGA (tokenized Malagasy ariary). Freely mintable — PoC only.

---

## Prerequisites

- Node.js >= 18
- npm >= 9
- Hedera testnet account with HBAR (get some at [portal.hedera.com](https://portal.hedera.com/))
- Railway account (deployment)
- Verifyway API key (WhatsApp OTP)

---

## Installation

```bash
# Clone the repo
git clone <repo-url>
cd "Argonath V3"

# Install root dependencies (Hardhat)
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd app && npm install && cd ..
```

---

## Environment Variables

### Backend — `backend/.env`

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/argonath

# Hedera
HEDERA_ACCOUNT_ID=0.0.XXXXX
HEDERA_PRIVATE_KEY=0x...          # ECDSA key of the Hedera account
ADMIN_PRIVATE_KEY=0x...           # same key — used to sign on-chain transactions

# Contracts
CLAIM_REGISTRY_ADDRESS=0x...
RPC_URL=https://testnet.hashio.io/api

# HCS
HCS_TOPIC_ID=0.0.XXXXX

# HTS
HTS_TOKEN_ID=0.0.XXXXX

# WhatsApp OTP (Verifyway)
VERIFYWAY_API_KEY=...

# CORS
FRONTEND_URL=https://your-frontend.railway.app

# Optional
PORT=3001
ALLOW_TEST_AUTHORIZE=true         # enables test mode without OTP (do not enable in prod)
```

### Frontend — `app/.env`

```env
REACT_APP_MOCK_CASH_ADDRESS=0x...
REACT_APP_CLAIM_REGISTRY_ADDRESS=0x...
REACT_APP_BOND_TOKEN_ADDRESS=0x...      # EVM address of the HTS token (via HIP-218)
REACT_APP_REPO_ESCROW_ADDRESS=0x...
REACT_APP_BOND_METADATA_ADDRESS=0x...
REACT_APP_HTS_TOKEN_ID=0.0.XXXXX
REACT_APP_RPC_URL=https://testnet.hashio.io/api
REACT_APP_CHAIN_ID=0x128                # 0x128 = Hedera testnet | 0x7a69 = Hardhat local
REACT_APP_HASHSCAN_URL=https://hashscan.io/testnet/transaction/
REACT_APP_API_URL=https://your-backend.railway.app
```

---

## Running Locally (Development)

### 1. Start a local Hardhat node

```bash
npx hardhat node
```

### 2. Deploy contracts (local)

```bash
npx hardhat run scripts/deploy.js --network localhost
```

The script automatically updates `app/.env` and `backend/.env` with the deployed contract addresses.

### 3. Start the backend

```bash
cd backend
npm run dev          # nodemon — hot reload
# or
npm start
```

API available at `http://localhost:3001`

### 4. Start the frontend

```bash
cd app
npm start
```

Frontend available at `http://localhost:3000`

---

## Deploying to Hedera Testnet

### Prerequisites
- HBAR testnet funds (via [portal.hedera.com](https://portal.hedera.com/))
- `HEDERA_PRIVATE_KEY` and `HEDERA_ACCOUNT_ID` set in your environment

```bash
# Create an HCS topic (once only)
HEDERA_ACCOUNT_ID=0.0.XXXXX HEDERA_PRIVATE_KEY=0x... \
  node scripts/create-hcs-topic.js

# Deploy all contracts
HEDERA_PRIVATE_KEY=0x... HEDERA_ACCOUNT_ID=0.0.XXXXX \
  npx hardhat run scripts/deploy.js --network hedera_testnet
```

The script:
1. Deploys MockCash, ClaimRegistry, BondMetadata
2. Creates the ARGN HTS token via the Hedera SDK
3. Deploys RepoEscrow with the HTS token EVM address
4. Mints 1M wMGA to the deployer
5. Updates `app/.env` and `backend/.env`

---

## Contract Tests

```bash
# All tests
npx hardhat test

# Specific file
npx hardhat test test/RepoEscrow.test.js
npx hardhat test test/ClaimRegistry.test.js

# With coverage
npx hardhat coverage
```

Test coverage:
- **ClaimRegistry**: authorize, redeem, double-redeem prevention, unauthorized access
- **RepoEscrow Mode A**: createLendingOffer, accept (DvP), repay, triggerMarginCall, claimDefault, cancelOffer
- **RepoEscrow Mode B**: createBorrowRequest, setAcceptedLender (anti-frontrunning), fundRequest, repayRequest, triggerMarginCallRequest, claimDefaultRequest, cancelRequest
- ACT/365 interest calculation, collateralRequired (ceiling formula), full state machine

---

## Railway Deployment

Both services are deployed separately on Railway.

### Backend

```bash
cd backend
railway up
```

Set all variables from `backend/.env` in the Railway service environment.

### Frontend

```bash
cd app
railway up
```

Set all variables from `app/.env` in the Railway service environment.

> The frontend uses CRACO to resolve Node.js polyfills (buffer, crypto, stream) required in the browser context.

---

## User Flows

### Investor — Redeem a T-Bill
1. Connect wallet (MetaMask or WalletConnect)
2. Verify identity via WhatsApp OTP (Verifyway) → backend authorizes the wallet on-chain via `ClaimRegistry.authorize()`
3. Investor calls `ClaimRegistry.redeem()` on-chain
4. Backend listens for the `ClaimRedeemed` event and mints HTS ARGN tokens
5. ARGN tokens appear in the wallet

### Lender — Lending Offer (Mode A)
1. Approve wMGA on RepoEscrow
2. `createLendingOffer(cashAmount, repoRateBps, haircutBps, durationSeconds)`
3. Backend persists the offer in DB + notarizes on HCS
4. Borrower calls `accept()` → atomic DvP on-chain

### Borrower — Borrow Request (Mode B)
1. Approve ARGN on RepoEscrow
2. `createBorrowRequest(collateralAmount, desiredCash, maxRateBps, durationSeconds)`
3. Lenders submit proposals in the UI
4. Borrower accepts → `setAcceptedLender()` on-chain (anti-frontrunning)
5. Lender calls `fundRequest()` → wMGA sent to borrower

### Repo Lifecycle — Repayment / Default
- At maturity: lender can call `triggerMarginCall()` → state becomes `MarginCalled`
- Borrower has **4 hours** (MARGIN_CALL_GRACE) to repay via `repay()`
- After 4h with no repayment: lender calls `claimDefault()` → receives the ARGN collateral

---

## Financial Calculations

**Required collateral (Mode A)**
```
collateral = ceil(cashAmount / ((1 - haircut/10000) × 1e6))
```

**Repayment amount ACT/365**
```
repayAmount = cashAmount + (cashAmount × rateBps × durationSeconds) / (10000 × 31536000)
```

**Annual rate display**
```
annual rate (%) = rateBps / 100
e.g. 500 bps → 5%
```

---

## HCS Notarization

Every business event is published to a Hedera Consensus Service topic:

| Event | Trigger |
|---|---|
| `wallet_phone_linked` | Successful OTP verification |
| `allocation_created` | Depositary creates an allocation |
| `allocation_redeemed` | Investor redeems their securities |
| `repo_proposal_submitted` | Lender submits a funding proposal |
| `repo_proposal_accepted` | Borrower accepts + SHA-256 hash of agreed terms |
| `repo_lending_offer_created` | Lender creates an offer |
| `repo_borrow_request_created` | Borrower creates a request |
| `repo_offer_accepted` | Atomic DvP accepted |
| `repo_request_funded` | Request funded |
| `repo_repaid` | Repayment completed |
| `repo_default_claimed` | Default declared |

Personal data is never published in plaintext — only cryptographic proofs (`keccak256(phone)`, `keccak256(firstName|lastName|phone)`, `keccak256(batchId)`).

---

## Backend API

| Method | Route | Description |
|---|---|---|
| POST | `/api/otp/send` | Send a WhatsApp OTP |
| POST | `/api/otp/verify` | Verify code + authorize on-chain |
| POST | `/api/otp/authorize-test` | Test mode without OTP (dev only) |
| GET | `/api/claims` | List all allocations (depositary) |
| GET | `/api/claims/by-phone/:phone` | Investor allocations by phone |
| POST | `/api/claims` | Create an allocation (depositary) |
| PUT | `/api/claims/:id/status` | Update allocation status |
| POST | `/api/claims/confirm-redeem` | Confirm redeem + mint HTS |
| GET | `/api/repo/offers` | List lending offers |
| POST | `/api/repo/offers` | Persist an offer after on-chain tx |
| GET | `/api/repo/requests` | List borrow requests |
| POST | `/api/repo/requests` | Persist a request after on-chain tx |
| GET | `/api/repo/proposals/:requestId` | Proposals for a request |
| POST | `/api/repo/proposals` | Submit a proposal |
| PUT | `/api/repo/proposals/:id/accept` | Accept a proposal |
| PUT | `/api/repo/proposals/:id/reject` | Reject a proposal |
| GET | `/api/hcs/messages` | Public HCS messages |
| GET | `/api/health` | Health check |

---

## License

Apache-2.0
