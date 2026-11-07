const express = require('express');
const router = express.Router();
const { getSignerAddress } = require('../services/signer');
const { createSession, revokeSession, bearer } = require('../services/sessions');

/**
 * POST /api/auth/depositary
 * Vérifie le mot de passe du dépositaire.
 * Retourne un jeton de session opaque, à usage unique côté client. Le mot de passe
 * partagé reste le secret de connexion et ne quitte plus le serveur.
 */
router.post('/depositary', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  if (password !== process.env.DEPOSITARY_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  let signerAddress = null;
  try { signerAddress = getSignerAddress(); } catch {}
  res.json({ token: createSession(), signerAddress });
});

/**
 * POST /api/auth/logout
 * Révoque la session en cours. Possible seulement depuis que le jeton est opaque :
 * tant qu'il valait le mot de passe partagé, le révoquer aurait déconnecté tout le monde.
 */
router.post('/logout', (req, res) => {
  revokeSession(bearer(req));
  res.json({ success: true });
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
