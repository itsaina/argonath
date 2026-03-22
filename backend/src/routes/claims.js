const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { signRedeemAuthorization } = require('../services/signer');
const { mintAndTransfer } = require('../services/hts');
const { publishEvent, phoneProof, identityProof, claimProof } = require('../services/hcs');
const { normalizePhone } = require('../utils/phone');

// ABI minimal pour appeler BondMetadata.setMaturity
const BOND_METADATA_ABI = [
  'function setMaturity(address wallet, uint256 maturityTs) external',
];

async function setBondMaturity(wallet, maturityDateStr) {
  const addr = process.env.BOND_METADATA_ADDRESS;
  if (!addr || !process.env.HEDERA_PRIVATE_KEY) return;
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://testnet.hashio.io/api');
    const signer   = new ethers.Wallet(process.env.HEDERA_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(addr, BOND_METADATA_ABI, signer);
    const maturityTs = Math.floor(new Date(maturityDateStr).getTime() / 1000);
    const tx = await contract.setMaturity(wallet, maturityTs, { gasLimit: 200_000 });
    await tx.wait();
    console.log(`[BondMetadata] setMaturity(${wallet}, ${maturityTs}) ✓ tx=${tx.hash}`);
  } catch (err) {
    console.error('[BondMetadata] setMaturity error (non-bloquant):', err.message);
  }
}

// Middleware simple : vérifie le token dépositaire (header Authorization: Bearer <password>)
function requireDepositary(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  if (token !== process.env.DEPOSITARY_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * POST /api/claims
 * Crée une nouvelle allocation (dépositaire uniquement).
 */
router.post('/', requireDepositary, async (req, res) => {
  console.log('[POST /claims] body reçu:', JSON.stringify(req.body));
  const { first_name, last_name, bond_type, nominal_amount, rate, maturity_date, batch_id } = req.body;
  const phone = normalizePhone(req.body.phone);

  const required = ['first_name','last_name','phone','bond_type','nominal_amount','rate','maturity_date','batch_id'];
  const missing = required.filter(f => req.body[f] === undefined || req.body[f] === null || String(req.body[f]).trim() === '');
  if (missing.length) {
    console.log('[POST /claims] champs manquants:', missing);
    return res.status(400).json({ error: `Champs manquants : ${missing.join(', ')}` });
  }

  try {
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO claims (id, first_name, last_name, phone, bond_type, nominal_amount, rate, maturity_date, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, first_name, last_name, phone, bond_type, nominal_amount, rate, maturity_date, batch_id]
    );
    const claim = result.rows[0];

    // Notarisation HCS — non bloquante
    // Aucune donnée personnelle on-chain : uniquement des preuves cryptographiques
    publishEvent('allocation_created', {
      phone_proof:    phoneProof(phone),
      identity_proof: identityProof(first_name, last_name, phone),
      claim_proof:    claimProof(batch_id),
      public: {
        bond_type:      bond_type,
        nominal_amount: Number(nominal_amount),
        label: 'T-Bill allocation created',
      },
      depositary: {
        rate:     Number(rate),
        maturity: maturity_date,
      },
    });

    res.status(201).json(claim);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'batch_id already exists' });
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/claims
 * Liste toutes les allocations (dépositaire uniquement).
 */
router.get('/', requireDepositary, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM claims ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * PATCH /api/claims/:id/status
 * Met à jour le statut d'une allocation (dépositaire uniquement).
 */
router.patch('/:id/status', requireDepositary, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['available', 'published', 'redeemed', 'in_repo', 'repo_active', 'repaid', 'defaulted', 'expired', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = await pool.query(
      'UPDATE claims SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Claim not found' });
    const updated = result.rows[0];

    // Notarisation HCS — non bloquante
    // Aucune donnée personnelle on-chain : uniquement des preuves cryptographiques
    publishEvent('allocation_status_changed', {
      wallet:         updated.wallet_address?.toLowerCase() || undefined,
      phone_proof:    updated.phone ? phoneProof(updated.phone) : undefined,
      identity_proof: updated.phone ? identityProof(updated.first_name, updated.last_name, updated.phone) : undefined,
      claim_proof:    claimProof(updated.batch_id),
      public: {
        bond_type:      updated.bond_type,
        nominal_amount: Number(updated.nominal_amount),
        new_status:     status,
        label: `Allocation status → ${status}`,
      },
      depositary: {},
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/claims/phone/:phone
 * Retourne les claims disponibles pour un numéro de téléphone (investisseur).
 */
router.get('/phone/:phone', async (req, res) => {
  const phone = normalizePhone(decodeURIComponent(req.params.phone));
  try {
    const result = await pool.query(
      `SELECT * FROM claims WHERE phone = $1 AND status IN ('available', 'published') ORDER BY created_at DESC`,
      [phone]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * POST /api/claims/:id/authorize
 * Le backend vérifie l'éligibilité et signe une autorisation de redeem.
 * Body: { walletAddress, phone }
 */
router.post('/:id/authorize', async (req, res) => {
  const { id } = req.params;
  const { walletAddress } = req.body;
  const phone = normalizePhone(req.body.phone);

  if (!walletAddress || !phone) {
    return res.status(400).json({ error: 'walletAddress and phone required' });
  }

  if (!ethers.isAddress(walletAddress)) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    // Vérifie que le claim existe, est disponible et correspond au numéro
    const result = await pool.query(
      `SELECT * FROM claims WHERE id = $1 AND phone = $2 AND status IN ('available', 'published')`,
      [id, phone]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Claim not found or not eligible' });
    }

    const claim = result.rows[0];

    // Génère un tokenId déterministe à partir du batch_id
    const tokenId = BigInt(ethers.id(claim.batch_id)).toString();

    // claimId on-chain : bytes32 = keccak256 du batch_id
    const claimId = ethers.id(claim.batch_id); // retourne 0x... hex

    // Expiry : 15 minutes à partir de maintenant
    const expiry = Math.floor(Date.now() / 1000) + 15 * 60;

    // URI de métadonnées (JSON minimal encodé en base64 pour le PoC)
    const metadata = {
      name: `${claim.bond_type} — ${claim.first_name} ${claim.last_name}`,
      bond_type: claim.bond_type,
      nominal_amount: claim.nominal_amount,
      rate: claim.rate,
      maturity_date: claim.maturity_date,
      batch_id: claim.batch_id,
    };
    const metadataUri = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;

    const signature = await signRedeemAuthorization(claimId, walletAddress, tokenId, expiry);

    // Met à jour wallet_address et token_id en attente de confirmation on-chain
    await pool.query(
      'UPDATE claims SET wallet_address = $1, token_id = $2, updated_at = NOW() WHERE id = $3',
      [walletAddress, tokenId, id]
    );

    res.json({ claimId, tokenId, expiry, metadataUri, signature });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/claims/:id/confirm-redeem
 * Confirme le redeem après tx on-chain (appelé par le frontend).
 * Body: { txHash }
 */
router.post('/:id/confirm-redeem', async (req, res) => {
  const { id } = req.params;
  const { txHash, walletAddress: bodyWallet } = req.body;

  try {
    const result = await pool.query(
      `UPDATE claims SET status = 'redeemed', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Claim not found' });
    const claim = result.rows[0];

    // Utilise wallet_address du body si non enregistré en DB (flow test sans /authorize)
    const recipientWallet = claim.wallet_address || bodyWallet;

    // Mint HTS ARGN et transfère à l'investisseur si HTS_TOKEN_ID configuré
    let htsResult = null;
    if (process.env.HTS_TOKEN_ID && recipientWallet) {
      try {
        const mintAmount = Math.round(Number(claim.nominal_amount));
        htsResult = await mintAndTransfer(recipientWallet, mintAmount);
        console.log('[confirm-redeem] HTS mint+transfer OK', htsResult);
      } catch (htsErr) {
        console.error('[confirm-redeem] HTS error (non-bloquant):', htsErr.message);
      }
    }

    // Enregistre la maturité des bonds dans BondMetadata (lu par RepoEscrow)
    // Non-bloquant — le repo sera refusé si la maturité n'est pas enregistrée
    if (recipientWallet && claim.maturity_date) {
      setBondMaturity(recipientWallet, claim.maturity_date);
    }

    // Notarisation HCS — non bloquante
    // Aucune donnée personnelle on-chain : uniquement des preuves cryptographiques
    if (claim.phone) {
      publishEvent('allocation_redeemed', {
        wallet:         recipientWallet?.toLowerCase(),
        phone_proof:    phoneProof(claim.phone),
        identity_proof: identityProof(claim.first_name, claim.last_name, claim.phone),
        claim_proof:    claimProof(claim.batch_id),
        public: {
          bond_type:      claim.bond_type,
          nominal_amount: claim.nominal_amount,
          label: 'T-Bill allocation redeemed (ARGN minted)',
        },
        depositary: {
          hts_mint_tx: htsResult?.mintTxId,
        },
      });
    }

    res.json({ success: true, claim, hts: htsResult });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
