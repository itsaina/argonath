const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

function getDepositaryToken() {
  return localStorage.getItem('depositary_token') || '';
}

async function request(path, options = {}) {
  const { headers: extraHeaders, ...restOptions } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...restOptions,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
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
export const saveRepoOffer = (data) =>
  request('/repo/offers', { method: 'POST', body: JSON.stringify(data) }).catch(() => {});

export const fetchRepoOffers = () =>
  request('/repo/offers').catch(() => []);

export const saveRepoRequest = (data) =>
  request('/repo/requests', { method: 'POST', body: JSON.stringify(data) }).catch(() => {});

export const fetchRepoRequests = () =>
  request('/repo/requests').catch(() => []);

// Repo — propositions off-chain (côté B — Borrow Requests)
export const fetchProposals = (requestId) =>
  request(`/repo/proposals/${requestId}`);

export const submitProposal = (requestId, lenderAddress, cashAmount, rateBps, durationSec) =>
  request('/repo/proposals', {
    method: 'POST',
    body: JSON.stringify({ requestId, lenderAddress, cashAmount, rateBps, durationSec }),
  });

export const acceptProposal = (proposalId) =>
  request(`/repo/proposals/${proposalId}/accept`, { method: 'PUT' });

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
