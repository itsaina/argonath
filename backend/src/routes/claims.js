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
 *
 * Sécurité :
 *  1. walletAddress n'est JAMAIS lu depuis le body — uniquement depuis claim.wallet_address (enregistré lors de l'OTP).
 *  2. txHash est vérifié on-chain : la transaction doit contenir l'event ClaimRedeemed
 *     émis par ClaimRegistry, avec le bon claimId ET le bon wallet.
 *  3. Idempotence : l'UPDATE échoue silencieusement si le claim est déjà 'redeemed'.
 */
router.post('/:id/confirm-redeem', async (req, res) => {
  const { id } = req.params;
  const { txHash } = req.body; // walletAddress du body ignoré intentionnellement

  if (!txHash) return res.status(400).json({ error: 'txHash requis' });

  try {
    // 1. Lire le claim avant toute modification
    const existing = await pool.query(`SELECT * FROM claims WHERE id = $1`, [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Claim not found' });
    const claim = existing.rows[0];

    // 2. Idempotence — refuser si déjà redeemed
    if (claim.status === 'redeemed') {
      return res.status(409).json({ error: 'Already redeemed' });
    }

    // 3. Wallet doit avoir été enregistré via OTP — jamais fourni par le body
    if (!claim.wallet_address) {
      return res.status(403).json({ error: 'Wallet non autorisé — effectuez la vérification OTP d\'abord' });
    }

    // 4. Vérification on-chain : la tx doit contenir ClaimRedeemed(claimId, wallet, amount)
    //    émis par l'adresse ClaimRegistry, avec le claimId et le wallet correspondant au claim.
    //    Optionnel si CLAIM_REGISTRY_ADDRESS ou RPC_URL absent (environnement dev sans contrats).
    const registryAddress = process.env.CLAIM_REGISTRY_ADDRESS;
    const rpcUrl = process.env.RPC_URL;
    if (registryAddress && rpcUrl) {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);

        // Retry jusqu'à 10x avec 3s d'intervalle (Hedera testnet peut être lent à indexer)
        let receipt = null;
        for (let attempt = 0; attempt < 10; attempt++) {
          receipt = await provider.getTransactionReceipt(txHash);
          if (receipt) break;
          await new Promise(r => setTimeout(r, 3000));
        }
        if (!receipt) {
          return res.status(400).json({ error: 'Transaction introuvable on-chain' });
        }

        const iface = new ethers.Interface([
          'event ClaimRedeemed(bytes32 indexed claimId, address indexed wallet, uint256 amount)',
        ]);
        const expectedClaimId = ethers.id(claim.batch_id); // keccak256(batch_id)

        const found = receipt.logs.some(log => {
          try {
            if (log.address.toLowerCase() !== registryAddress.toLowerCase()) return false;
            const parsed = iface.parseLog({ topics: log.topics, data: log.data });
            return (
              parsed.name === 'ClaimRedeemed' &&
              parsed.args.claimId === expectedClaimId &&
              parsed.args.wallet.toLowerCase() === claim.wallet_address.toLowerCase()
            );
          } catch { return false; }
        });

        if (!found) {
          return res.status(403).json({ error: 'Event ClaimRedeemed absent ou invalide dans la transaction' });
        }
      } catch (verifyErr) {
        console.error('[confirm-redeem] vérification on-chain échouée:', verifyErr.message);
        return res.status(502).json({ error: 'Impossible de vérifier la transaction on-chain' });
      }
    }

    // 5. Marquer comme redeemed — WHERE status != 'redeemed' garantit l'idempotence en cas de race condition
    const result = await pool.query(
      `UPDATE claims SET status = 'redeemed', updated_at = NOW() WHERE id = $1 AND status != 'redeemed' RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Already redeemed' });
    }
    const updated = result.rows[0];

    // 6. Mint HTS ARGN — uniquement vers wallet_address enregistré en DB
    let htsResult = null;
    if (process.env.HTS_TOKEN_ID && updated.wallet_address) {
      try {
        const mintAmount = Math.round(Number(updated.nominal_amount));
        htsResult = await mintAndTransfer(updated.wallet_address, mintAmount);
        console.log('[confirm-redeem] HTS mint+transfer OK', htsResult);
      } catch (htsErr) {
        console.error('[confirm-redeem] HTS error (non-bloquant):', htsErr.message);
      }
    }

    // 7. Enregistre la maturité des bonds dans BondMetadata (lu par RepoEscrow)
    if (updated.wallet_address && updated.maturity_date) {
      setBondMaturity(updated.wallet_address, updated.maturity_date);
    }

    // 8. Notarisation HCS — non bloquante
    if (updated.phone) {
      publishEvent('allocation_redeemed', {
        wallet:         updated.wallet_address.toLowerCase(),
        phone_proof:    phoneProof(updated.phone),
        identity_proof: identityProof(updated.first_name, updated.last_name, updated.phone),
        claim_proof:    claimProof(updated.batch_id),
        public: {
          bond_type:      updated.bond_type,
          nominal_amount: updated.nominal_amount,
          label: 'T-Bill allocation redeemed (ARGN minted)',
        },
        depositary: {
          hts_mint_tx: htsResult?.mintTxId,
        },
      });
    }

    res.json({ success: true, claim: updated, hts: htsResult });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
