const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const pool = require('../db/pool');
const { publishEvent, phoneProof } = require('../services/hcs');
const { normalizePhone } = require('../utils/phone');

const VERIFYWAY_URL = 'https://api.verifyway.com/api/v1/';
const VERIFYWAY_KEY = process.env.VERIFYWAY_API_KEY;

// ABI minimal ClaimRegistry — uniquement la fonction authorize
const CLAIM_REGISTRY_ABI = [
  'function authorize(bytes32 claimId, address wallet) external',
];

// Stockage en mémoire : phone → { code, expiresAt }
const pendingOtps = new Map();
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Retourne un wallet signeur (deployer local ou clé configurée) */
function getAdminWallet() {
  const key = process.env.ADMIN_PRIVATE_KEY || process.env.BACKEND_PRIVATE_KEY;
  const rpc = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpc);
  return new ethers.Wallet(key, provider);
}

/** Autorise on-chain tous les claims disponibles pour ce phone+wallet */
async function authorizeClaimsOnChain(phone, walletAddress) {
  const registryAddress = process.env.CLAIM_REGISTRY_ADDRESS;
  console.log('[authorizeClaimsOnChain] registryAddress:', registryAddress);
  if (!registryAddress) {
    console.warn('[otp] CLAIM_REGISTRY_ADDRESS non configurée — authorize ignoré');
    return;
  }

  // Récupère tous les claims disponibles pour ce numéro
  const result = await pool.query(
    `SELECT * FROM claims WHERE phone = $1 AND status IN ('available', 'published')`,
    [phone]
  );
  const claims = result.rows;
  console.log('[authorizeClaimsOnChain] claims trouvés:', claims.length);
  if (!claims.length) return;

  const admin = getAdminWallet();
  const registry = new ethers.Contract(registryAddress, CLAIM_REGISTRY_ABI, admin);
  let nonce = await admin.getNonce('latest');

  // Hedera testnet requires explicit gas overrides (min ~1 HBAR/tx)
  const isHedera = (process.env.RPC_URL || '').includes('hashio.io');
  const txOverrides = isHedera
    ? { gasLimit: 300_000, gasPrice: ethers.parseUnits('1200', 'gwei') }
    : {};

  for (const claim of claims) {
    // claimId on-chain : keccak256 du batch_id
    const claimId = ethers.id(claim.batch_id);
    try {
      const tx = await registry.authorize(claimId, walletAddress, { nonce: nonce, ...txOverrides });
      await tx.wait();
      nonce++;
      // Persiste wallet_address en DB pour que confirm-redeem puisse minter le HTS
      await pool.query(
        'UPDATE claims SET wallet_address = $1, updated_at = NOW() WHERE id = $2',
        [walletAddress, claim.id]
      );
      console.log(`[otp] authorize(${claimId}, ${walletAddress}) OK — batch ${claim.batch_id}`);
    } catch (err) {
      console.error(`[otp] authorize failed pour ${claim.batch_id}:`, err.message);
    }
  }
}

/**
 * POST /api/otp/send
 * Body: { phone }
 */
router.post('/send', async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'phone required' });

  const code = generateCode();
  pendingOtps.set(phone, { code, expiresAt: Date.now() + OTP_TTL_MS });

  try {
    const response = await fetch(VERIFYWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VERIFYWAY_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        recipient: phone,
        type: 'otp',
        code,
        channel: 'whatsapp',
        fallback: 'no',
        lang: 'en',
      }),
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      pendingOtps.delete(phone);
      return res.status(502).json({ error: data.error || 'Verifyway error' });
    }

    res.json({ success: true });
  } catch (err) {
    pendingOtps.delete(phone);
    console.error('OTP send error:', err.message);
    res.status(502).json({ error: 'Failed to reach Verifyway' });
  }
});

/**
 * POST /api/otp/verify
 * Body: { phone, code, walletAddress }
 * Vérifie le code, puis autorise le wallet on-chain pour tous ses claims.
 */
router.post('/verify', async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const { code, walletAddress } = req.body;
  if (!phone || !code) return res.status(400).json({ error: 'phone and code required' });

  const entry = pendingOtps.get(phone);
  if (!entry) return res.status(400).json({ error: 'Aucun OTP en attente pour ce numéro.' });

  if (Date.now() > entry.expiresAt) {
    pendingOtps.delete(phone);
    return res.status(400).json({ error: 'Code expiré. Veuillez en demander un nouveau.' });
  }

  if (String(code) !== entry.code) {
    return res.status(400).json({ error: 'Code incorrect.' });
  }

  pendingOtps.delete(phone);

  // Autorise on-chain si un wallet est fourni — await pour garantir que la tx est minée
  if (walletAddress && ethers.isAddress(walletAddress)) {
    try {
      await authorizeClaimsOnChain(phone, walletAddress);
    } catch (err) {
      console.error('[otp] authorizeClaimsOnChain error:', err.message);
      // On continue : l'OTP est valide, l'authorize sera retentée plus tard
    }

    // Notarisation HCS — non bloquante
    // Aucune donnée personnelle on-chain : uniquement des preuves cryptographiques
    publishEvent('wallet_phone_linked', {
      wallet:      walletAddress.toLowerCase(),
      phone_proof: phoneProof(phone),
      public:     { label: 'Wallet linked to OTP-verified account' },
      depositary: {},
    });
  }

  res.json({ success: true });
});

/**
 * POST /api/otp/authorize-test
 * Mode test uniquement — autorise directement sans OTP.
 * Body: { phone, walletAddress }
 */
router.post('/authorize-test', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_AUTHORIZE !== 'true') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  const phone = normalizePhone(req.body.phone);
  const { walletAddress } = req.body;
  console.log('[authorize-test] phone:', phone, 'wallet:', walletAddress);
  if (!phone || !walletAddress) return res.status(400).json({ error: 'phone and walletAddress required' });
  if (!ethers.isAddress(walletAddress)) return res.status(400).json({ error: 'Invalid wallet address' });

  try {
    await authorizeClaimsOnChain(phone, walletAddress);
    console.log('[authorize-test] done');
    res.json({ success: true });
  } catch (err) {
    console.error('[authorize-test] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
