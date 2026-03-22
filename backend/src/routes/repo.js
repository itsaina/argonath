/**
 * Routes repo off-chain
 *
 * POST /api/repo/offers            — persiste une offre après tx on-chain
 * GET  /api/repo/offers            — liste toutes les offres persistées
 * POST /api/repo/requests          — persiste une demande après tx on-chain
 * GET  /api/repo/requests          — liste toutes les demandes persistées
 * GET  /api/repo/proposals/:id     — propositions pour une demande
 * POST /api/repo/proposals         — prêteur soumet une proposition
 * PUT  /api/repo/proposals/:id/accept
 * PUT  /api/repo/proposals/:id/reject
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { publishEvent } = require('../services/hcs');

const router = express.Router();

// ── Offres ────────────────────────────────────────────────────────────────────

// POST /api/repo/offers  — appelé par le frontend après tx confirmée
// Body: { offerId, lender, cashAmount, repoRateBps, haircutBps, durationSec, contractAddr }
router.post('/offers', async (req, res) => {
  const { offerId, lender, cashAmount, repoRateBps, haircutBps, durationSec, contractAddr } = req.body;
  if (offerId === undefined || offerId === null) return res.status(400).json({ error: 'offerId requis' });
  try {
    await pool.query(
      `INSERT OR REPLACE INTO repo_offers (id, lender, cash_amount, repo_rate_bps, haircut_bps, duration_sec, contract_addr)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [Number(offerId), lender?.toLowerCase(), Number(cashAmount), Number(repoRateBps), Number(haircutBps), Number(durationSec), contractAddr || '']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[repo/offers POST]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/repo/offers
router.get('/offers', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM repo_offers ORDER BY id DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error('[repo/offers GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Demandes ──────────────────────────────────────────────────────────────────

// POST /api/repo/requests — appelé par le frontend après tx confirmée
// Body: { requestId, borrower, collateralAmount, desiredCash, maxRateBps, durationSec, bondMaturityDate, contractAddr }
router.post('/requests', async (req, res) => {
  const { requestId, borrower, collateralAmount, desiredCash, maxRateBps, durationSec, bondMaturityDate, contractAddr } = req.body;
  if (requestId === undefined || requestId === null) return res.status(400).json({ error: 'requestId requis' });
  try {
    await pool.query(
      `INSERT OR REPLACE INTO repo_requests (id, borrower, collateral_amount, desired_cash, max_rate_bps, duration_sec, bond_maturity_date, contract_addr)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [Number(requestId), borrower?.toLowerCase(), Number(collateralAmount), Number(desiredCash), Number(maxRateBps), Number(durationSec), bondMaturityDate || '', contractAddr || '']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[repo/requests POST]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/repo/requests
router.get('/requests', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM repo_requests ORDER BY id DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error('[repo/requests GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Propositions ──────────────────────────────────────────────────────────────

// GET /api/repo/proposals/:requestId
router.get('/proposals/:requestId', async (req, res) => {
  const { requestId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM repo_proposals WHERE request_id = $1 ORDER BY created_at DESC`,
      [Number(requestId)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[repo/proposals GET]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/repo/proposals
// Body: { requestId, lenderAddress, cashAmount, rateBps, durationSec }
router.post('/proposals', async (req, res) => {
  const { requestId, lenderAddress, cashAmount, rateBps, durationSec } = req.body;
  if (!requestId && requestId !== 0) return res.status(400).json({ error: 'requestId requis' });
  if (!lenderAddress)  return res.status(400).json({ error: 'lenderAddress requis' });
  if (!cashAmount)     return res.status(400).json({ error: 'cashAmount requis' });
  if (!rateBps && rateBps !== 0) return res.status(400).json({ error: 'rateBps requis' });
  if (!durationSec)    return res.status(400).json({ error: 'durationSec requis' });

  const id = uuidv4();
  try {
    await pool.query(
      `INSERT INTO repo_proposals (id, request_id, lender_address, cash_amount, rate_bps, duration_sec)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, Number(requestId), lenderAddress.toLowerCase(), Number(cashAmount), Number(rateBps), Number(durationSec)]
    );
    // Notarisation HCS — non bloquante
    publishEvent('repo_proposal_submitted', {
      wallet: lenderAddress.toLowerCase(),
      public: {
        requestId:  Number(requestId),
        cashAmount: Number(cashAmount),
        rateBps:    Number(rateBps),
        label: 'Funding proposal submitted',
      },
      depositary: { durationSec: Number(durationSec) },
    });

    res.json({ success: true, id });
  } catch (err) {
    console.error('[repo/proposals POST]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/repo/proposals/:id/accept
// Body optionnel : { borrowerAddress } — pour notariser le côté emprunteur
router.put('/proposals/:id/accept', async (req, res) => {
  const { id } = req.params;
  const { borrowerAddress } = req.body || {};
  try {
    // Récupérer la proposition pour obtenir le request_id
    const propResult = await pool.query(
      `SELECT * FROM repo_proposals WHERE id = $1`,
      [id]
    );
    if (propResult.rows.length === 0) return res.status(404).json({ error: 'Proposition introuvable' });

    const proposal = propResult.rows[0];
    const requestId = proposal.request_id;

    // Accepter cette proposition
    await pool.query(
      `UPDATE repo_proposals SET status = 'accepted' WHERE id = $1`,
      [id]
    );

    // Rejeter toutes les autres propositions en attente pour cette demande
    await pool.query(
      `UPDATE repo_proposals SET status = 'rejected' WHERE request_id = $1 AND id != $2 AND status = 'pending'`,
      [requestId, id]
    );

    // Retourner la proposition acceptée avec les termes pour le frontend
    const updated = await pool.query(
      `SELECT * FROM repo_proposals WHERE id = $1`,
      [id]
    );
    const accepted = updated.rows[0];

    // Notarisation HCS renforcée — hash des termes pour preuve immuable de l'accord bilatéral
    // Le hash couvre : requestId + lenderAddress + cashAmount + rateBps + durationSec
    // Côté vérification : le frontend peut recalculer et comparer avec l'event HCS
    const termsHash = require('crypto')
      .createHash('sha256')
      .update(`${accepted?.request_id}:${accepted?.lender_address}:${accepted?.cash_amount}:${accepted?.rate_bps}:${accepted?.duration_sec}`)
      .digest('hex');

    publishEvent('repo_proposal_accepted', {
      wallet: borrowerAddress?.toLowerCase() || accepted?.lender_address?.toLowerCase(),
      public: {
        requestId:    accepted?.request_id,
        lender:       accepted?.lender_address,
        cashAmount:   accepted?.cash_amount,
        rateBps:      accepted?.rate_bps,
        durationSec:  accepted?.duration_sec,
        termsHash,    // hash SHA-256 des termes convenus — proof of agreement
        label: 'Funding proposal accepted',
      },
    });

    res.json({ success: true, proposal: accepted, termsHash });
  } catch (err) {
    console.error('[repo/proposals accept]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/repo/proposals/:id/reject
router.put('/proposals/:id/reject', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE repo_proposals SET status = 'rejected' WHERE id = $1`,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[repo/proposals reject]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
