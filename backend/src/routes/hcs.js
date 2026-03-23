/**
 * Routes HCS — Hedera Consensus Service
 *
 * POST /api/hcs/notify
 *   Déclenché par le frontend après un événement on-chain.
 *   Body: { event, wallet, data: {} }
 *
 * GET /api/hcs/messages?scope=depositary|public&wallet=0x...&limit=50
 *   Lit les messages du topic HCS depuis le mirror node.
 *   scope=depositary requiert le token dépositaire (header Authorization).
 */
const express = require('express');
const router  = express.Router();
const { ethers } = require('ethers');
const { publishEvent } = require('../services/hcs');

// Events que le frontend est autorisé à publier (actions on-chain uniquement)
// Les events métier sensibles (authorize, redeem, mint) sont publiés directement
// depuis les routes backend — jamais via ce endpoint.
const ALLOWED_FRONTEND_EVENTS = new Set([
  'repo_lending_offer_created',
  'repo_borrow_request_created',
  'repo_offer_accepted',
  'repo_offer_cancelled',
  'repo_borrow_request_cancelled',
  'repo_request_funded',
  'repo_repaid',
  'repo_request_repaid',
  'repo_margin_call_triggered',
  'repo_default_claimed',
  'repo_request_default_claimed',
]);

const MIRROR = 'https://testnet.mirrornode.hedera.com';

// ─── Middleware dépositaire (optionnel — utilisé pour scope=depositary) ───────
function isDepositary(req) {
  const auth  = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  return token === process.env.DEPOSITARY_PASSWORD;
}

// ─── POST /api/hcs/notify ─────────────────────────────────────────────────────
router.post('/notify', async (req, res) => {
  const { event, wallet, data = {} } = req.body;
  if (!event || !wallet) return res.status(400).json({ error: 'event et wallet requis' });

  // Whitelist : seuls les events on-chain frontend sont acceptés
  if (!ALLOWED_FRONTEND_EVENTS.has(event)) {
    return res.status(400).json({ error: `Event non autorisé : ${event}` });
  }

  // Validation adresse wallet
  if (!ethers.isAddress(wallet)) {
    return res.status(400).json({ error: 'wallet invalide' });
  }

  // Le bloc depositary n'est jamais renseigné depuis le frontend (données sensibles)
  await publishEvent(event, {
    wallet: wallet.toLowerCase(),
    public:     data.public || {},
    depositary: {},
  });

  res.json({ success: true });
});

// ─── GET /api/hcs/messages ────────────────────────────────────────────────────
router.get('/messages', async (req, res) => {
  const topicId = process.env.HCS_TOPIC_ID;
  if (!topicId) return res.status(503).json({ error: 'HCS_TOPIC_ID non configuré' });

  const scope      = req.query.scope  || 'public';
  const walletFilter = req.query.wallet?.toLowerCase();
  const limit      = Math.min(Number(req.query.limit) || 50, 200);
  const depositary = isDepositary(req);

  // Scope depositary → auth obligatoire
  if (scope === 'depositary' && !depositary) {
    return res.status(401).json({ error: 'Authentification dépositaire requise' });
  }

  try {
    const url = `${MIRROR}/api/v1/topics/${topicId}/messages?limit=${limit}&order=desc`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Mirror node: ${response.status}`);
    const { messages } = await response.json();

    const parsed = (messages || [])
      .map(m => {
        try {
          const raw = Buffer.from(m.message, 'base64').toString('utf8');
          const msg = JSON.parse(raw);
          return {
            seq:       m.sequence_number,
            ts:        m.consensus_timestamp,
            ...msg,
          };
        } catch { return null; }
      })
      .filter(Boolean)
      // Filtrer par wallet si demandé
      .filter(m => !walletFilter || m.wallet === walletFilter)
      // En mode public (investisseur) : masquer le bloc depositary
      .map(m => {
        if (!depositary || scope === 'public') {
          const { depositary: _dep, ...rest } = m;
          return rest;
        }
        return m;
      });

    res.json(parsed);
  } catch (err) {
    console.error('[hcs/messages]', err.message);
    res.status(502).json({ error: 'Impossible de lire le topic HCS' });
  }
});

module.exports = router;
