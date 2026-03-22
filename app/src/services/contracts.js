/**
 * ABIs et adresses des contrats déployés.
 * Remplacer les adresses après déploiement avec Hardhat ou sur Hedera testnet.
 */

export const CONTRACT_ADDRESSES = {
  MockCash:      process.env.REACT_APP_MOCK_CASH_ADDRESS       || '',
  ClaimRegistry: process.env.REACT_APP_CLAIM_REGISTRY_ADDRESS  || '',
  BondToken:     process.env.REACT_APP_BOND_TOKEN_ADDRESS      || '', // adresse EVM du token HTS ARGN (HIP-218)
  RepoEscrow:    process.env.REACT_APP_REPO_ESCROW_ADDRESS     || '',
  BondMetadata:  process.env.REACT_APP_BOND_METADATA_ADDRESS   || '',
};

// HTS
export const HTS_TOKEN_ID       = process.env.REACT_APP_HTS_TOKEN_ID || '';        // "0.0.XXXXX"
export const HTS_PRECOMPILE     = '0x0000000000000000000000000000000000000167';    // Hedera HTS System Contract
export const HASHSCAN_TX_URL    = process.env.REACT_APP_HASHSCAN_URL || '';
export const EXPECTED_CHAIN_ID  = process.env.REACT_APP_CHAIN_ID || '0x128';       // 0x128=Hedera testnet, 0x7a69=Hardhat

// ─── MockCash (ERC-20 wMGA) ───────────────────────────────────────────────────
export const MOCK_CASH_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function mint(address to, uint256 amount)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
];

// ─── BondToken (ERC-20 ARGN / HTS-compatible) ────────────────────────────────
export const BOND_TOKEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
];

// ─── ClaimRegistry ────────────────────────────────────────────────────────────
export const CLAIM_REGISTRY_ABI = [
  'function authorize(bytes32 claimId, address wallet) external',
  'function redeem(bytes32 claimId, uint256 amount) external',
  'function authorizedWallet(bytes32) view returns (address)',
  'function redeemed(bytes32) view returns (bool)',
  'event ClaimAuthorized(bytes32 indexed claimId, address indexed wallet)',
  'event ClaimRedeemed(bytes32 indexed claimId, address indexed wallet, uint256 amount)',
];

// ─── RepoEscrow ───────────────────────────────────────────────────────────────
export const REPO_ESCROW_ABI = [
  // Setup Hedera HTS
  'function associateWithBondToken()',
  // Constantes
  'function GRACE_PERIOD() view returns (uint256)',
  'function MAX_REPO_DURATION() view returns (uint256)',
  // Mode A — Lending Offer (prêteur)
  'function createLendingOffer(uint256 cashAmount, uint256 repoRateBps, uint256 haircut, uint256 durationSeconds) returns (uint256)',
  'function cancelOffer(uint256 offerId)',
  // Mode A — Emprunteur (bondMaturityTimestamp lu depuis BondMetadata on-chain)
  'function accept(uint256 offerId)',
  'function repay(uint256 offerId)',
  'function claimDefault(uint256 offerId)',
  // Mode A — Lecture
  'function collateralRequired(uint256 offerId) view returns (uint256)',
  'function repayAmount(uint256 offerId) view returns (uint256)',
  'function offers(uint256) view returns (address lender, uint256 cashAmount, uint256 haircut, uint256 repoRateBps, uint256 durationSeconds, address borrower, uint256 collateralAmount, uint256 maturity, uint256 bondMaturityTimestamp, uint8 status)',
  'function offerCount() view returns (uint256)',
  // Mode B — Borrow Request (bondMaturityTimestamp lu depuis BondMetadata on-chain)
  'function createBorrowRequest(uint256 collateralAmount, uint256 desiredCash, uint256 maxRateBps, uint256 durationSeconds) returns (uint256)',
  'function cancelRequest(uint256 requestId)',
  'function repayRequest(uint256 requestId)',
  'function claimDefaultRequest(uint256 requestId)',
  // Mode B — Prêteur finance
  'function fundRequest(uint256 requestId, uint256 actualCash, uint256 actualRateBps)',
  // Mode B — Lecture
  'function repayRequestAmount(uint256 requestId) view returns (uint256)',
  'function borrowRequests(uint256) view returns (address borrower, uint256 collateralLocked, uint256 desiredCash, uint256 maxRateBps, uint256 durationSeconds, uint256 bondMaturityTimestamp, address lender, uint256 actualCash, uint256 actualRateBps, uint256 maturity, uint8 status)',
  'function requestCount() view returns (uint256)',
  // Events Mode A
  'event LendingOfferCreated(uint256 indexed offerId, address indexed lender, uint256 cashAmount, uint256 haircut, uint256 repoRateBps, uint256 durationSeconds)',
  'event OfferAccepted(uint256 indexed offerId, address indexed borrower, uint256 collateralAmount, uint256 maturity, uint256 bondMaturityTimestamp)',
  'event OfferRepaid(uint256 indexed offerId, uint256 repayAmount)',
  'event DefaultClaimed(uint256 indexed offerId, address indexed lender)',
  'event OfferCancelled(uint256 indexed offerId)',
  // Events Mode B
  'event BorrowRequestCreated(uint256 indexed requestId, address indexed borrower, uint256 collateralLocked, uint256 desiredCash, uint256 maxRateBps, uint256 durationSeconds, uint256 bondMaturityTimestamp)',
  'event RequestFunded(uint256 indexed requestId, address indexed lender, uint256 actualCash, uint256 actualRateBps, uint256 maturity)',
  'event RequestRepaid(uint256 indexed requestId, uint256 repayAmount)',
  'event RequestDefaultClaimed(uint256 indexed requestId, address indexed lender)',
  'event RequestCancelled(uint256 indexed requestId)',
];

// Statuts RepoEscrow (enum — communs aux deux modes)
export const REPO_STATUS = { 0: 'Open', 1: 'Active', 2: 'Repaid', 3: 'Defaulted', 4: 'Cancelled', 99: 'Archived' };
