# Argonath — Pages & User Flows

Inventaire des écrans du frontend React, de ce que chacun contient, et des parcours
utilisateur de bout en bout.

**Stack UI** : React 18 + MUI v5, `BrowserRouter`. Cinq routes déclarées dans
[`app/src/AppRouter.jsx`](app/src/AppRouter.jsx). Shell commun (NavBar avec les liens et le
bouton *Connect Wallet*, Footer) dans [`app/src/App.jsx`](app/src/App.jsx).

| Route | Page | Gate d'accès |
|---|---|---|
| `/` | Home | aucun |
| `/depositary` | Interface dépositaire | mot de passe opérateur |
| `/investor` | Interface investisseur | wallet connecté |
| `/market` | Repo Market | lecture libre, wallet pour agir |
| `/docs` | Documentation & faucet | aucun (wallet pour le faucet) |

---

## 1. `/` — Home

[`app/src/pages/Home.jsx`](app/src/pages/Home.jsx) — 51 lignes, présentation pure, aucune
logique métier.

- Titre + pitch : « T-Bill tokenization and on-chain repo platform on Hedera »
- Trois cartes cliquables qui servent de sélecteur de rôle :

| Carte | Chip | Destination |
|---|---|---|
| Depositary | `Operator` | `/depositary` |
| Investor | `Holder` | `/investor` |
| Repo Market | `Public` | `/market` |

Pas de wallet requis. C'est l'entrée « choisis ton rôle ».

---

## 2. `/depositary` — Interface dépositaire

[`app/src/pages/Depositary.jsx`](app/src/pages/Depositary.jsx) — back-office opérateur.

**Accès par mot de passe, pas par wallet** : `PasswordGate` → `POST /auth/depositary` → token
stocké dans `localStorage.depositary_token`. Une réponse 401/403 sur n'importe quel appel
renvoie au formulaire avec « Session expired » (`handleAuthError`), au lieu de laisser
l'opérateur devant une interface vide et silencieuse.

### Onglet 0 — Allocations

- Tableau : Investisseur, Téléphone, Type d'obligation, Montant (MGA), Taux, Échéance,
  Batch ID, Statut, Actions
- Filtre par statut sur neuf valeurs : `available`, `published`, `redeemed`, `in_repo`,
  `repo_active`, `repaid`, `defaulted`, `expired`, `cancelled`
- Actions par ligne : **Publish** (si `available`), **Cancel** (si `available` ou `published`)
- Dialog « New Allocation » : prénom, nom, téléphone (normalisé — espaces, tirets et
  parenthèses supprimés), type (T-Bill / Government Bond / Commercial Paper / Certificate of
  Deposit), montant nominal, taux %, date d'échéance, Batch ID. Un bouton
  « Prefill (test) » remplit un jeu de données de démo.

### Onglet 1 — HCS Journal

- Journal notarial lu via `GET /hcs/messages?scope=depositary` (100 derniers). Vue
  privilégiée : contient le bloc `depositary` (données nominatives) en plus du bloc `public`.
- Chaque événement affiche un chip typé (14 types reconnus, de `wallet_phone_linked` à
  `repo_default_claimed`), le numéro de séquence, le timestamp, le wallet et le `phone_proof`
  tronqué.
- Lien sortant HashScan vers le topic. Si `REACT_APP_HCS_TOPIC_ID` est absent, un encart
  d'avertissement donne la commande à lancer.

### Onglet 2 — Proof Verifier

Outil d'audit entièrement côté client. On saisit téléphone / prénom / nom / batch ID, et il
recalcule en local les trois `keccak256` publiés sur HCS :

| Preuve | Formule |
|---|---|
| `phone_proof` | `keccak256(phone)` |
| `identity_proof` | `keccak256(first\|last\|phone)` |
| `claim_proof` | `keccak256(batch_id)` |

À comparer manuellement avec le journal pour prouver qu'un événement concerne bien telle
personne, sans qu'aucune donnée nominative n'ait jamais été publiée en clair.

---

## 3. `/investor` — Interface investisseur

[`app/src/pages/Investor.jsx`](app/src/pages/Investor.jsx)

**Gate : wallet connecté** (MetaMask ou WalletConnect). Sans wallet, un écran invite à
utiliser le bouton *Connect Wallet* de la navbar. La page surveille aussi `chainId` et
affiche une alerte rouge hors Hedera Testnet (296), avec les paramètres RPC à renseigner.

### Onglet 0 — My T-Bills (`ClaimsSection`)

Machine à trois états :

1. **`phone`** — saisie du numéro WhatsApp → `POST /otp/send`. Un bouton secondaire
   « ⚡ Test mode (no OTP) » appelle `/otp/authorize-test` pour bypasser l'OTP en dev.
2. **`otp`** — saisie du code → `POST /otp/verify` avec `(phone, code, walletAddress)`. Le
   backend autorise le wallet on-chain via `ClaimRegistry.authorize()`.
3. **`verified`** — la liaison wallet ↔ téléphone est persistée dans `localStorage`
   (`verified_phone_<accountId>`), donc pas de nouvel OTP aux visites suivantes. Bouton
   « Unlink » pour la rompre.

En état vérifié : la liste des titres (type, montant MGA, taux, échéance, batch), chacun avec
un bouton **Redeem on-chain** qui enchaîne association HTS (silencieuse si déjà associé) →
`ClaimRegistry.redeem(keccak256(batch_id), 1)` → `POST /claims/:id/confirm-redeem` → le
backend mint 1 ARGN en HTS. Le succès affiche deux liens HashScan (tx EVM + tx HTS), retire
le titre de la liste et bascule vers l'onglet Portfolio après 2,5 s.

**Ré-autorisation** : si des claims n'ont pas de `wallet_address` (changement de wallet,
redeploy), `reauthorize()` est appelé puis l'état est poll jusqu'à 15 × 3 s. Un échec efface
la liaison locale et force un nouveau cycle OTP.

### Onglet 1 — Portfolio

Solde ARGN lu par `eth_call balanceOf(address)` direct (via `window.ethereum`, sinon le RPC
public). Distingue explicitement « solde 0 », « contrats non déployés » et « lecture
impossible ».

### Onglet 2 — HCS History

Les événements notariés filtrés sur le wallet connecté (`GET /hcs/messages?wallet=…`), vue
publique uniquement. Un 503 s'affiche en `info` (« HCS non configuré ») et non en erreur :
un déploiement local normal ne doit pas passer pour cassé.

---

## 4. `/market` — Repo Market

[`app/src/pages/Market.jsx`](app/src/pages/Market.jsx) — 1310 lignes, la page centrale. Liste
unifiée des deux côtés du marché, lisible sans wallet ; le wallet n'est requis que pour agir.

**En-tête** : compteurs `N open · N active`, bouton Refresh, bouton « + New Position » qui
déplie les deux formulaires de création côte à côte.

**Filtres** : type (All / Lending Offers / Borrow Requests) × statut (All / Open / Active /
Margin Call).

**La chaîne est la source de vérité.** `loadPositions()` énumère systématiquement
`offerCount()` / `requestCount()` et lit chaque position on-chain. La base ne sert plus qu'à
deux choses : retrouver les positions d'un escrow précédent — affichées en `Archived` — et
servir de repli ligne à ligne si une lecture on-chain échoue. Une erreur de chargement
s'affiche en rouge avec un bouton Retry, jamais comme « marché vide ».

### Mode A — Lending Offer (le prêteur vient avec du cash)

**Création** (`CreateLendingOfferSection`) : montant à prêter (MGA → wMGA ×1e6), haircut %,
taux repo %/an, durée en jours. Le collatéral requis est prévisualisé en direct. Enchaînement :
contrôle du solde wMGA → `approve` sur MockCash → `createLendingOffer(...)` → notarisation HCS
→ polling de l'`offerId` → persistance en base. Si la persistance échoue, un message explicite
dit que l'offre est publiée on-chain mais non enregistrée, et la saisie est conservée.

**Carte** (`RepoCard`) : montant, durée, taux, haircut, collatéral requis, lender/borrower,
échéance, remboursement estimé (ACT/365 calculé côté client). Actions conditionnées au rôle
et au statut :

| Condition | Action |
|---|---|
| `Open`, pas le prêteur | **Accept (DvP)** — `approve` ARGN via le précompile HTS puis `accept(offerId)` |
| `Open`, prêteur | **Cancel Offer** |
| `Active` / `MarginCalled`, emprunteur | **Repay** — `repayAmount()` → approve wMGA → `repay()` |
| `Active` échu, prêteur | **Trigger Margin Call** |
| `MarginCalled`, prêteur | **Claim Default** |

### Mode B — Borrow Request (l'emprunteur vient avec du collatéral)

**Création** (`CreateBorrowRequestSection`) : collatéral ARGN, cash souhaité, taux max, durée.

**Carte** (`BorrowRequestCard`) : collatéral verrouillé, taux max, cash souhaité, puis une
fois la position active le taux réel, le cash reçu, l'échéance et le remboursement estimé.
Si un **Repo Receipt NFT** existe (`ownerOf(requestId)`), un bandeau indique qui le détient,
avec un « (you) » vert pour le prêteur.

**Panneau de propositions** (`ProposalsPanel`, visible sur les requests `Open`) — le marché
off-chain :

1. Un prêteur ouvre le dialog **Make a Proposal** (montant ≥ souhaité, taux ≤ max, validés
   côté client avant envoi).
2. L'emprunteur voit les propositions `pending` et peut **Accept** / **Reject**.
   L'acceptation fait d'abord `setAcceptedLender()` on-chain — garde anti-front-running :
   tant que `acceptedLender` vaut `0x0`, n'importe quel wallet lisant la mempool peut appeler
   `fundRequest` — puis seulement l'acceptation off-chain.
3. Le prêteur retenu voit l'encart « Your proposal was accepted! » et un bouton
   **Confirm Funding** (`approve` wMGA + `fundRequest`), qui déclenche le mint du NFT.

---

## 5. `/docs` — Documentation & faucet

[`app/src/pages/Docs.jsx`](app/src/pages/Docs.jsx)

- **Overview** — le pitch en un paragraphe
- **How it works** — les cinq étapes numérotées : le dépositaire enregistre les droits →
  l'investisseur vérifie son identité par OTP → redeem on-chain → collatéral en repo →
  remboursement et récupération du collatéral
- **Contracts (Hedera Testnet)** — table des cinq adresses lues depuis les variables
  `REACT_APP_*`, avec « not configured » en gris si absentes : utile comme diagnostic de
  déploiement
- **Testnet Faucet** — mint de wMGA de test sur `MockCash`, avec solde affiché, bouton de
  rafraîchissement et lien HashScan. Un solde illisible affiche « Balance unavailable »
  plutôt qu'un zéro trompeur.

---

## User flows de bout en bout

### A. Émission → détention (dépositaire + investisseur)

`/depositary` mot de passe → *New Allocation* avec le téléphone de l'investisseur → *Publish*.
Puis l'investisseur sur `/investor` connecte son wallet → OTP WhatsApp → le backend autorise
son adresse dans `ClaimRegistry` → *Redeem on-chain* → 1 ARGN minté en HTS → visible dans
Portfolio, traçable dans HCS History.

### B. Prêteur, Mode A

`/docs` faucet pour obtenir des wMGA → `/market` → *+ New Position* → *Post a Lending Offer*
(wMGA verrouillés en escrow) → attente → un emprunteur fait *Accept* (DvP atomique) → à
l'échéance : *Trigger Margin Call* → période de grâce → *Claim Default* si pas de
remboursement.

### C. Emprunteur, Mode B

Détenir des ARGN (flow A) → `/market` → *Post a Borrow Request* (ARGN verrouillés) → les
prêteurs déposent des propositions → l'emprunteur *Accept* celle qu'il veut (whitelist
on-chain d'abord) → le prêteur *Confirm Funding* et reçoit le NFT de dépôt → à l'échéance
l'emprunteur *Repay* (NFT brûlé, ARGN rendus) ou subit le défaut.

### D. Audit / conformité

`/depositary` → *HCS Journal* (vue nominative) + *Proof Verifier* pour recalculer les
hachages et prouver le lien entre un événement notarié et une personne réelle, sans que la
donnée personnelle n'ait jamais été publiée.

---

## Points relevés à la lecture

**Incohérence de période de grâce** — le README documente 4 h de `MARGIN_CALL_GRACE`, le
front définit `GRACE_MS = 24h`
([`app/src/pages/Market.jsx:42`](app/src/pages/Market.jsx:42)), et cette constante n'est en
fait utilisée nulle part dans le fichier. C'est le contrat qui arbitre ; l'UI se contente
d'afficher le bouton dès l'état `MarginCalled`.
