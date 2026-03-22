const express = require('express');
const router = express.Router();
const { getSignerAddress } = require('../services/signer');

/**
 * POST /api/auth/depositary
 * Vérifie le mot de passe du dépositaire.
 * Retourne un token simple (mot de passe hashé) stocké côté client.
 */
router.post('/depositary', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  if (password !== process.env.DEPOSITARY_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  let signerAddress = null;
  try { signerAddress = getSignerAddress(); } catch {}
  res.json({ token: process.env.DEPOSITARY_PASSWORD, signerAddress });
});

/**
 * GET /api/auth/signer
 * Retourne l'adresse publique du backend (pour déploiement contrat).
 */
router.get('/signer', (req, res) => {
  try {
    res.json({ address: getSignerAddress() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
