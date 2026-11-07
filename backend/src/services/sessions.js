/**
 * Sessions dépositaire — jetons opaques en mémoire.
 *
 * Auparavant, /api/auth/depositary renvoyait DEPOSITARY_PASSWORD verbatim et les
 * gardes comparaient l'en-tête Authorization à cette même variable. Le secret
 * partagé circulait donc à chaque requête et dormait dans le localStorage du
 * navigateur, sans expiration ni moyen de révocation.
 *
 * Ce que ce module apporte : le mot de passe ne quitte plus le serveur, un jeton
 * volé expire de lui-même et peut être révoqué sans changer le mot de passe de
 * tous les opérateurs, et la déconnexion devient possible.
 *
 * Ce qu'il n'apporte pas : il reste un unique secret partagé, sans identité ni
 * imputabilité par opérateur ; le jeton vit toujours dans le localStorage, donc
 * une faille XSS obtient une session valide pour la durée du TTL ; il n'y a ni
 * protection CSRF ni limitation du nombre de tentatives. Et le stockage étant en
 * mémoire, un redémarrage du backend déconnecte tout le monde — acceptable pour
 * un PoC mono-instance, à remplacer par un magasin partagé au-delà.
 */
const crypto = require('crypto');

const TTL_MS = Number(process.env.DEPOSITARY_SESSION_TTL_HOURS || 8) * 3600 * 1000;

/** token → timestamp d'expiration */
const sessions = new Map();

function sweep() {
  const now = Date.now();
  for (const [token, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(token);
  }
}

function createSession() {
  sweep();
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + TTL_MS);
  return token;
}

function verifySession(token) {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function revokeSession(token) {
  return token ? sessions.delete(token) : false;
}

/**
 * Extrait le jeton d'un en-tête Authorization, avec ou sans préfixe Bearer.
 * Les trois gardes réimplémentaient chacune un `auth.replace('Bearer ', '')`.
 *
 * Réservé à l'authentification dépositaire : le préfixe Bearer exigé par
 * DimensionVerify est un sujet distinct, traité dans services/dimensionVerify.js.
 */
function bearer(req) {
  const header = req.headers?.['authorization'] || '';
  return header.replace(/^Bearer\s+/i, '').trim();
}

module.exports = { createSession, verifySession, revokeSession, bearer };
