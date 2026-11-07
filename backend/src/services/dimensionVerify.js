/**
 * Client DimensionVerify — service OTP WhatsApp interne (projet Railway « dimension-verify »).
 * Remplace Verifyway. Contrat : <DIMENSION_VERIFY_URL>/docs
 *
 *   POST /v1/otp/send    { phone_number }         → envoie le code sur WhatsApp
 *   POST /v1/otp/verify  { phone_number, code }   → valide le code
 *
 * Différence structurante avec Verifyway : DimensionVerify génère, stocke (Redis) et
 * vérifie le code lui-même. Le backend Argonath n'a donc plus de table d'OTP en mémoire
 * — qui ne survivait ni aux redémarrages ni à plusieurs instances.
 */

const DEFAULT_URL = 'https://backend-production-ed52.up.railway.app';

function config() {
  const baseUrl = (process.env.DIMENSION_VERIFY_URL || DEFAULT_URL).replace(/\/+$/, '');
  const apiKey  = process.env.DIMENSION_VERIFY_API_KEY;
  if (!apiKey) {
    const err = new Error('[dimension-verify] DIMENSION_VERIFY_API_KEY manquante — OTP indisponible.');
    err.status = 503;
    throw err;
  }
  return { baseUrl, apiKey };
}

/** DimensionVerify exige du E.164 strict (ex. +261340000000). */
function assertE164(phone) {
  if (!/^\+[1-9]\d{7,14}$/.test(phone || '')) {
    const err = new Error("Numéro invalide — format E.164 attendu, indicatif pays compris (ex. +261340000000).");
    err.status = 400;
    throw err;
  }
}

/** Extrait un message lisible d'une erreur FastAPI (detail string, detail[].msg) ou d'un corps libre. */
function messageFrom(data, fallback) {
  const d = data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
  return data?.error || data?.message || fallback;
}

/**
 * Le préfixe « Bearer » est obligatoire : la clé brute est rejetée par
 * /v1/otp/* avec « Missing or invalid Authorization header » (vérifié contre
 * le service en production). L'OpenAPI ne le documente pas — ces routes
 * déclarent un header libre au lieu du schéma HTTPBearer des autres routes.
 */
async function call(path, body) {
  const { baseUrl, apiKey } = config();
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Envoie un code OTP sur WhatsApp. Le code est généré et conservé par DimensionVerify.
 *
 * ATTENTION : la réponse du service contient le code en clair dans data.otp.
 * On ne le retourne jamais à l'appelant et on ne le journalise jamais — sans quoi
 * il fuiterait vers le navigateur ou les logs, ce qui viderait l'OTP de son sens.
 * Seul l'état de remise WhatsApp est conservé, pour le diagnostic.
 */
async function sendOtp(phone) {
  assertE164(phone);
  const { ok, status, data } = await call('/v1/otp/send', { phone_number: phone });
  if (!ok) {
    const err = new Error(messageFrom(data, "Échec de l'envoi du code."));
    // Un rejet d'authentification est une erreur de configuration côté Argonath,
    // pas une faute de l'utilisateur : on ne la renvoie pas telle quelle au navigateur.
    err.status = (status === 401 || status === 403) ? 502 : status;
    throw err;
  }
  // « accepted » signifie accepté par WhatsApp pour remise, pas encore remis :
  // un numéro hors liste autorisée d'une app Meta en mode développement est
  // accepté ici et n'arrive jamais.
  const delivery = data?.result?.messages?.[0]?.message_status || 'unknown';
  return { delivery };
}

/** Valide un code. Lève une erreur (status 400) si le code est incorrect ou expiré. */
async function verifyOtp(phone, code) {
  assertE164(phone);
  const { ok, status, data } = await call('/v1/otp/verify', {
    phone_number: phone,
    code: String(code),
  });
  if (!ok) {
    const err = new Error(messageFrom(data, 'Code incorrect ou expiré.'));
    err.status = status >= 500 ? 502 : 400;
    throw err;
  }
  // Le schéma de réponse n'est pas typé dans l'OpenAPI : si le service signale
  // explicitement un échec dans un corps 2xx, on le respecte ; sinon 2xx = vérifié.
  for (const field of ['verified', 'valid', 'success']) {
    if (data && field in data && data[field] === false) {
      const err = new Error(messageFrom(data, 'Code incorrect ou expiré.'));
      err.status = 400;
      throw err;
    }
  }
  return data;
}

module.exports = { sendOtp, verifyOtp, assertE164 };
