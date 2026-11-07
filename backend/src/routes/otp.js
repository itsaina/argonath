const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { ethers } = require('ethers');
const pool = require('../db/pool');
const { publishEvent, phoneProof } = require('../services/hcs');
const { normalizePhone } = require('../utils/phone');
const dimensionVerify = require('../services/dimensionVerify');

// ABI minimal ClaimRegistry — uniquement la fonction authorize
const CLAIM_REGISTRY_ABI = [
  'function authorize(bytes32 claimId, address wallet) external',
];

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

  try {
    const { delivery } = await dimensionVerify.sendOtp(phone);
    // Trace de remise uniquement — jamais le code, que DimensionVerify renvoie
    // pourtant en clair dans sa réponse.
    console.log(`[otp/send] ${phoneProof(phone)} — WhatsApp: ${delivery}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[otp/send]', err.message);
    res.status(err.status || 502).json({ error: err.message });
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

  // La validité du code est tranchée par DimensionVerify (génération + stockage Redis).
  try {
    await dimensionVerify.verifyOtp(phone, code);
  } catch (err) {
    console.error('[otp/verify]', err.message);
    return res.status(err.status || 400).json({ error: err.message });
  }

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

/**
 * POST /api/otp/reauthorize
 * Re-autorise on-chain les claims non encore enregistrés pour un wallet déjà vérifié.
 * Appelé par le frontend quand des claims sans wallet_address sont détectés.
 * Body: { phone, walletAddress }
 */
router.post('/reauthorize', async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const { walletAddress } = req.body;
  if (!phone || !walletAddress) return res.status(400).json({ error: 'phone and walletAddress required' });
  if (!ethers.isAddress(walletAddress)) return res.status(400).json({ error: 'Invalid wallet address' });

  // Vérifie qu'au moins un claim de ce phone a déjà ce wallet_address (preuve que le wallet a bien été vérifié via OTP)
  const existing = await pool.query(
    `SELECT 1 FROM claims WHERE phone = $1 AND lower(wallet_address) = lower($2) LIMIT 1`,
    [phone, walletAddress]
  );
  if (existing.rows.length === 0) {
    return res.status(403).json({ error: 'Wallet non associé à ce numéro — OTP requis' });
  }

  try {
    await authorizeClaimsOnChain(phone, walletAddress);
    res.json({ success: true });
  } catch (err) {
    console.error('[reauthorize] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/otp/webhook
 * Réception des événements DimensionVerify (otp envoyé / vérifié / échec, quota bas).
 *
 * Purement observationnel : le parcours investisseur est synchrone et ne dépend
 * pas de cette route. Elle sert à tracer les envois et surtout à alerter avant
 * que le quota de crédits ne tombe à zéro et casse silencieusement l'OTP.
 *
 * Signature : HMAC-SHA256 du corps brut, en-tête X-Webhook-Signature.
 * Le secret est optionnel côté DimensionVerify ; s'il est configuré ici, toute
 * requête non signée ou mal signée est rejetée.
 */
router.post('/webhook', (req, res) => {
  const secret = process.env.DIMENSION_VERIFY_WEBHOOK_SECRET;

  if (secret) {
    const received = String(req.get('X-Webhook-Signature') || '').replace(/^sha256=/i, '').trim();
    if (!received || !req.rawBody) {
      return res.status(401).json({ error: 'Missing signature' });
    }
    const digest = crypto.createHmac('sha256', secret).update(req.rawBody).digest();
    // Le format d'encodage n'est pas documenté : on accepte hex et base64.
    const expected = [digest.toString('hex'), digest.toString('base64')];
    const ok = expected.some(exp => {
      const a = Buffer.from(exp);
      const b = Buffer.from(received);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
    if (!ok) {
      console.warn('[otp/webhook] signature invalide — requête rejetée');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else {
    console.warn('[otp/webhook] DIMENSION_VERIFY_WEBHOOK_SECRET non configurée — signature non vérifiée');
  }

  const body  = req.body || {};
  const event = body.event || body.type || 'unknown';
  console.log(`[otp/webhook] ${event}`, JSON.stringify(body.data || body));

  // Alerte quota : seul événement qui demande une action humaine.
  if (/quota/i.test(event)) {
    console.error(`[otp/webhook] QUOTA DIMENSIONVERIFY BAS — recharger des crédits. ${JSON.stringify(body.data || body)}`);
  }

  // Toujours 200 : un non-2xx déclencherait des retentatives côté DimensionVerify.
  res.json({ received: true });
});

module.exports = router;
