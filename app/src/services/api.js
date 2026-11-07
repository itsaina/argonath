const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

function getDepositaryToken() {
  return localStorage.getItem('depositary_token') || '';
}

/**
 * Message lisible pour une erreur d'API, à afficher tel quel dans une Alert.
 * Évite que chaque appelant réinvente la distinction entre « session expirée »,
 * « backend injoignable » et « fonctionnalité non configurée ».
 */
export function describeError(err, fallback = 'Something went wrong.') {
  if (err?.status === 401 || err?.status === 403) return 'Session expired — please sign in again.';
  if (err?.status === 503) return 'Not configured on this deployment.';
  // fetch rejette avec un TypeError, sans status, quand le serveur est injoignable.
  if (err?.status === undefined && err instanceof TypeError) return 'Cannot reach the server.';
  return err?.message || fallback;
}

async function request(path, options = {}) {
  const { headers: extraHeaders, ...restOptions } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...restOptions,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Le code HTTP est porté par l'erreur : l'appelant doit pouvoir distinguer
    // un jeton refusé (401) d'une panne, pour invalider la session plutôt que
    // d'afficher une interface vide.
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Auth
export const authDepositary = (password) =>
  request('/auth/depositary', { method: 'POST', body: JSON.stringify({ password }) });

// Claims — dépositaire
export const createClaim = (claim) =>
  request('/claims', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getDepositaryToken()}` },
    body: JSON.stringify(claim),
  });

export const fetchAllClaims = () =>
  request('/claims', { headers: { Authorization: `Bearer ${getDepositaryToken()}` } });

export const updateClaimStatus = (id, status) =>
  request(`/claims/${id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${getDepositaryToken()}` },
    body: JSON.stringify({ status }),
  });

// OTP WhatsApp
export const sendOtp = (phone) =>
  request('/otp/send', { method: 'POST', body: JSON.stringify({ phone }) });

export const verifyOtp = (phone, code, walletAddress) =>
  request('/otp/verify', { method: 'POST', body: JSON.stringify({ phone, code, walletAddress }) });

export const authorizeTest = (phone, walletAddress) =>
  request('/otp/authorize-test', { method: 'POST', body: JSON.stringify({ phone, walletAddress }) });

export const reauthorize = (phone, walletAddress) =>
  request('/otp/reauthorize', { method: 'POST', body: JSON.stringify({ phone, walletAddress }) });

// Claims — investisseur
export const fetchClaimsByPhone = (phone) =>
  request(`/claims/phone/${encodeURIComponent(phone)}`);

export const authorizeRedeem = (id, walletAddress, phone) =>
  request(`/claims/${id}/authorize`, {
    method: 'POST',
    body: JSON.stringify({ walletAddress, phone }),
  });

export const confirmRedeem = (id, txHash, walletAddress) =>
  request(`/claims/${id}/confirm-redeem`, {
    method: 'POST',
    body: JSON.stringify({ txHash, walletAddress }),
  });

// Repo — persistance historique offres et demandes
//
// Ces quatre fonctions avalaient autrefois leurs erreurs (.catch(() => {}) et
// .catch(() => [])). Côté lecture, une panne du backend devenait indiscernable
// d'un marché vide ; côté écriture, l'appelant ne pouvait pas savoir qu'une
// position créée on-chain n'avait pas été enregistrée. Les erreurs remontent
// désormais, et c'est à l'appelant de les afficher.
export const saveRepoOffer = (data) =>
  request('/repo/offers', { method: 'POST', body: JSON.stringify(data) });

export const fetchRepoOffers = () => request('/repo/offers');

export const saveRepoRequest = (data) =>
  request('/repo/requests', { method: 'POST', body: JSON.stringify(data) });

export const fetchRepoRequests = () => request('/repo/requests');

// Repo — propositions off-chain (côté B — Borrow Requests)
export const fetchProposals = (requestId) =>
  request(`/repo/proposals/${requestId}`);

export const submitProposal = (requestId, lenderAddress, cashAmount, rateBps, durationSec) =>
  request('/repo/proposals', {
    method: 'POST',
    body: JSON.stringify({ requestId, lenderAddress, cashAmount, rateBps, durationSec }),
  });

export const acceptProposal = (proposalId, borrowerAddress) =>
  request(`/repo/proposals/${proposalId}/accept`, {
    method: 'PUT',
    body: JSON.stringify({ borrowerAddress }),
  });

export const rejectProposal = (proposalId) =>
  request(`/repo/proposals/${proposalId}/reject`, { method: 'PUT' });

// HCS — Notarisation & Journal
export const notifyHCS = (event, wallet, data = {}) =>
  request('/hcs/notify', {
    method: 'POST',
    body: JSON.stringify({ event, wallet, data }),
  }).catch(() => {}); // non bloquant

export const fetchHCSMessages = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/hcs/messages${qs ? '?' + qs : ''}`);
};

export const fetchHCSMessagesDepositary = (params = {}) => {
  const qs = new URLSearchParams({ ...params, scope: 'depositary' }).toString();
  return request(`/hcs/messages?${qs}`, {
    headers: { Authorization: `Bearer ${getDepositaryToken()}` },
  });
};
