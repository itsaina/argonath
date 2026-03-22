import { useState, useEffect, useCallback } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress,
  Paper, Stack, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import { AccountId } from "@hashgraph/sdk";
import { useWalletInterface } from "../services/wallets/useWalletInterface";
import { fetchClaimsByPhone, confirmRedeem, sendOtp, verifyOtp, authorizeTest, fetchHCSMessages } from "../services/api";
import {
  CONTRACT_ADDRESSES, CLAIM_REGISTRY_ABI, BOND_TOKEN_ABI,
  HTS_TOKEN_ID, HASHSCAN_TX_URL, EXPECTED_CHAIN_ID,
} from "../services/contracts";
import { ContractFunctionParameterBuilder } from "../services/wallets/contractFunctionParameterBuilder";
import { ethers } from "ethers";

// Convertit un accountId Hedera (0.0.XXXX) ou EVM (0x...) en adresse EVM
function toEvmAddress(accountId) {
  if (!accountId) return null;
  if (accountId.startsWith('0x')) return accountId;
  try { return '0x' + AccountId.fromString(accountId).toSolidityAddress(); }
  catch { return accountId; }
}

const STATUS_COLORS = {
  available: { bg: '#e8f5e9', color: '#2e7d32' },
  published: { bg: '#e3f2fd', color: '#1565c0' },
};

// ─── Section : Claims disponibles (avec vérification OTP WhatsApp) ────────────
function ClaimsSection({ accountId, walletInterface, onRedeemed }) {
  // Clé localStorage : liaison wallet ↔ téléphone
  const storageKey = accountId ? `verified_phone_${accountId}` : null;
  const savedPhone = storageKey ? localStorage.getItem(storageKey) : null;

  const [phone, setPhone] = useState(savedPhone || '');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState(savedPhone ? 'verified' : 'phone'); // 'phone' | 'otp' | 'verified'
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  const [claims, setClaims] = useState([]);
  const [searched, setSearched] = useState(false);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState({});
  const [redeemStatus, setRedeemStatus] = useState({});

  // Charger les titres automatiquement si déjà lié
  useEffect(() => {
    if (savedPhone && step === 'verified') {
      setClaimsLoading(true);
      fetchClaimsByPhone(savedPhone)
        .then(data => { setClaims(data); setSearched(true); })
        .catch(() => { setClaims([]); setSearched(true); })
        .finally(() => setClaimsLoading(false));
    }
  }, []);

  const handleTestAuthorize = async () => {
    if (!phone) return;
    if (!accountId) return alert("Connectez votre wallet d'abord.");
    setOtpLoading(true); setOtpError('');
    try {
      await authorizeTest(phone, toEvmAddress(accountId));
      if (storageKey) localStorage.setItem(storageKey, phone);
      setStep('verified');
      setClaimsLoading(true);
      try { setClaims(await fetchClaimsByPhone(phone)); setSearched(true); }
      catch { setClaims([]); setSearched(true); }
      setClaimsLoading(false);
    } catch (err) {
      setOtpError(err.message || 'Test authorization error.');
    }
    setOtpLoading(false);
  };

  const handleSendOtp = async () => {
    if (!phone) return;
    setOtpLoading(true); setOtpError('');
    try {
      await sendOtp(phone);
      setStep('otp');
    } catch (err) {
      setOtpError(err.message || 'Failed to send OTP.');
    }
    setOtpLoading(false);
  };

  const handleVerifyOtp = async () => {
    if (!otpCode) return;
    setOtpLoading(true); setOtpError('');
    try {
      await verifyOtp(phone, otpCode, accountId);
      // Persiste la liaison wallet ↔ téléphone
      if (storageKey) localStorage.setItem(storageKey, phone);
      setStep('verified');
      setClaimsLoading(true);
      try { setClaims(await fetchClaimsByPhone(phone)); setSearched(true); }
      catch { setClaims([]); setSearched(true); }
      setClaimsLoading(false);
    } catch (err) {
      setOtpError('Incorrect or expired code. Please try again.');
    }
    setOtpLoading(false);
  };

  const handleUnlink = () => {
    if (storageKey) localStorage.removeItem(storageKey);
    setPhone(''); setOtpCode(''); setStep('phone');
    setClaims([]); setSearched(false);
  };

  const handleAssociate = async () => {
    if (!accountId || !HTS_TOKEN_ID) return;
    try {
      // walletInterface.associateToken gère MetaMask et WalletConnect
      // avec le bon gas limit (800k) via METAMASK_GAS_LIMIT_ASSOCIATE
      await walletInterface.associateToken(HTS_TOKEN_ID);
      setRedeemStatus(s => ({ ...s, associate: 'done' }));
    } catch (err) {
      // Erreur silencieuse : token déjà associé ou association non requise
      console.warn('[associate]', err?.message || err);
    }
  };

  const handleRedeem = async (claim) => {
    if (!accountId) return alert("Connectez votre wallet d'abord.");
    setRedeemLoading(l => ({ ...l, [claim.id]: true }));
    setRedeemStatus(s => ({ ...s, [claim.id]: '' }));
    try {
      // 1. Association HTS (silencieuse si déjà associé)
      // L'autorisation on-chain a déjà été faite lors de la vérification OTP WhatsApp.
      await handleAssociate();

      // 3. Redeem on-chain via ClaimRegistry EVM
      const claimId = ethers.utils.id(claim.batch_id);
      const params = new ContractFunctionParameterBuilder()
        .addParam({ type: 'bytes32', name: 'claimId', value: claimId })
        .addParam({ type: 'uint256', name: 'amount',  value: 1 });

      const txHash = await walletInterface.executeContractFunction(
        CONTRACT_ADDRESSES.ClaimRegistry, 'redeem', params, 300_000
      );

      if (txHash) {
        // 4. Backend mint HTS et confirme en DB
        const result = await confirmRedeem(claim.id, txHash, toEvmAddress(accountId));
        const hashscanEvmTx = HASHSCAN_TX_URL ? `${HASHSCAN_TX_URL}${txHash}` : null;
        const hashscanHts   = result?.hts?.hashscanTransfer || null;

        setRedeemStatus(s => ({
          ...s,
          [claim.id]: { status: 'success', hashscanEvmTx, hashscanHts },
        }));
        setClaims(prev => prev.filter(c => c.id !== claim.id));
        setTimeout(() => onRedeemed && onRedeemed(), 2500);
      } else {
        setRedeemStatus(s => ({ ...s, [claim.id]: { status: 'error' } }));
      }
    } catch (err) {
      console.error(err);
      setRedeemStatus(s => ({ ...s, [claim.id]: { status: 'error' } }));
    }
    setRedeemLoading(l => ({ ...l, [claim.id]: false }));
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h6" fontWeight={700} color="#03045e">My Available T-Bills</Typography>

      {/* Step 1: phone number */}
      {step === 'phone' && (
        <Stack spacing={2} maxWidth={420}>
          <Typography variant="body2" color="#666">
            Enter your WhatsApp number to receive a verification code.
          </Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label="WhatsApp Number" value={phone}
              onChange={e => setPhone(e.target.value.replace(/[\s\-().]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
              placeholder="+33 7 XX XX XX XX"
              fullWidth
            />
            <Button variant="contained" onClick={handleSendOtp} disabled={otpLoading || !phone}
              sx={{ backgroundColor: '#03045e', '&:hover': { backgroundColor: '#020338' }, whiteSpace: 'nowrap' }}>
              {otpLoading ? <CircularProgress size={18} color="inherit" /> : 'Send OTP'}
            </Button>
          </Stack>
          {otpError && <Alert severity="error" sx={{ py: 0 }}>{otpError}</Alert>}
          <Button size="small" variant="outlined" onClick={handleTestAuthorize} disabled={otpLoading || !phone}
            sx={{ alignSelf: 'flex-start', borderColor: '#f57c00', color: '#f57c00', fontSize: 11 }}>
            {otpLoading ? <CircularProgress size={14} color="inherit" /> : '⚡ Test mode (no OTP)'}
          </Button>
        </Stack>
      )}

      {/* Step 2: OTP code */}
      {step === 'otp' && (
        <Stack spacing={2} maxWidth={420}>
          <Alert severity="success" sx={{ py: 0 }}>
            Code sent on WhatsApp to <b>{phone}</b>
          </Alert>
          <Stack direction="row" spacing={2}>
            <TextField
              label="OTP Code" value={otpCode}
              onChange={e => setOtpCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
              placeholder="123456"
              fullWidth inputProps={{ maxLength: 8 }}
            />
            <Button variant="contained" onClick={handleVerifyOtp} disabled={otpLoading || !otpCode}
              sx={{ backgroundColor: '#03045e', '&:hover': { backgroundColor: '#020338' }, whiteSpace: 'nowrap' }}>
              {otpLoading ? <CircularProgress size={18} color="inherit" /> : 'Verify'}
            </Button>
          </Stack>
          {otpError && <Alert severity="error" sx={{ py: 0 }}>{otpError}</Alert>}
          <Button size="small" onClick={() => { setStep('phone'); setOtpCode(''); setOtpError(''); }}
            sx={{ alignSelf: 'flex-start', color: '#888', fontSize: 11 }}>
            ← Change number
          </Button>
        </Stack>
      )}

      {/* Step 3: verified, show T-Bills */}
      {step === 'verified' && (
        <>
          <Stack direction="row" spacing={2} alignItems="center" maxWidth={420}>
            <TextField
              label="WhatsApp Number" value={phone} fullWidth disabled
              sx={{ '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: '#555' } }}
            />
            <Button size="small" variant="outlined" onClick={handleUnlink}
              sx={{ whiteSpace: 'nowrap', borderColor: '#ccc', color: '#888', fontSize: 11 }}>
              Unlink
            </Button>
          </Stack>

          {claimsLoading && <CircularProgress sx={{ alignSelf: 'flex-start' }} />}

          {searched && claims.length === 0 && !claimsLoading && (
            <Alert severity="info">No T-Bills available for this number.</Alert>
          )}

          {claims.map(c => (
            <Paper key={c.id} elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 3, p: 3 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2}>
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography fontWeight={700} color="#03045e">{c.bond_type}</Typography>
                    <Chip label={c.status === 'published' ? 'Published' : 'Available'} size="small"
                      sx={{ backgroundColor: STATUS_COLORS[c.status]?.bg, color: STATUS_COLORS[c.status]?.color, fontWeight: 600 }} />
                  </Stack>
                  <Typography variant="body2" color="#666">
                    Amount: <b>{Number(c.nominal_amount).toLocaleString()} MGA</b> · Rate: <b>{Number(c.rate).toFixed(2)}%</b>
                  </Typography>
                  <Typography variant="body2" color="#666">
                    Maturity: <b>{new Date(c.maturity_date).toLocaleDateString('en-US')}</b> · Batch: <b>{c.batch_id}</b>
                  </Typography>
                </Stack>
                <Stack spacing={1} alignItems={{ md: 'flex-end' }}>
                  {redeemStatus[c.id]?.status === 'success' && (
                    <Stack spacing={0.5}>
                      <Alert severity="success" sx={{ py: 0 }}>1 ARGN minted and transferred ✓</Alert>
                      {redeemStatus[c.id].hashscanEvmTx && (
                        <Typography variant="caption">
                          <a href={redeemStatus[c.id].hashscanEvmTx} target="_blank" rel="noreferrer" style={{ color: '#1565c0' }}>
                            View EVM tx on HashScan →
                          </a>
                        </Typography>
                      )}
                      {redeemStatus[c.id].hashscanHts && (
                        <Typography variant="caption">
                          <a href={redeemStatus[c.id].hashscanHts} target="_blank" rel="noreferrer" style={{ color: '#1565c0' }}>
                            View HTS tx on HashScan →
                          </a>
                        </Typography>
                      )}
                    </Stack>
                  )}
                  {redeemStatus[c.id]?.status === 'error' && <Alert severity="error" sx={{ py: 0 }}>Redeem failed</Alert>}
                  <Button variant="contained" disabled={redeemLoading[c.id]}
                    onClick={() => handleRedeem(c)}
                    sx={{ backgroundColor: '#03045e', '&:hover': { backgroundColor: '#020338' }, minWidth: 140 }}>
                    {redeemLoading[c.id] ? <CircularProgress size={18} color="inherit" /> : 'Redeem on-chain'}
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </>
      )}
    </Stack>
  );
}

// ─── Section : Portefeuille ────────────────────────────────────────────────────
function PortfolioSection({ accountId }) {
  const [argnBalance, setArgnBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  const hasContracts = !!CONTRACT_ADDRESSES.BondToken;

  const loadPortfolio = async () => {
    if (!accountId || !hasContracts) return;
    setLoading(true);
    try {
      // Encode balanceOf(address) via ethers Interface et appel eth_call direct
      const evmAddr = toEvmAddress(accountId);
      const iface = new ethers.utils.Interface(['function balanceOf(address) view returns (uint256)']);
      const data = iface.encodeFunctionData('balanceOf', [evmAddr]);

      let result;
      if (window.ethereum) {
        result = await window.ethereum.request({
          method: 'eth_call',
          params: [{ to: CONTRACT_ADDRESSES.BondToken, data }, 'latest'],
        });
      } else {
        const rpc = process.env.REACT_APP_RPC_URL || 'http://127.0.0.1:8545';
        const resp = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: CONTRACT_ADDRESSES.BondToken, data }, 'latest'] }),
        });
        const json = await resp.json();
        result = json.result;
      }

      // '0x' = contract absent ou résultat vide → balance 0
      const bal = (result && result !== '0x')
        ? ethers.BigNumber.from(result)
        : ethers.BigNumber.from(0);
      setArgnBalance(bal.toString());
    } catch (err) {
      console.error('[portfolio] balanceOf error:', err.message || err);
      setArgnBalance(null);
    }
    setLoading(false);
  };

  useEffect(() => { loadPortfolio(); }, [accountId]);

  return (
    <Stack spacing={3}>
      <Typography variant="h6" fontWeight={700} color="#03045e">My Portfolio</Typography>
      {!hasContracts ? (
        <Alert severity="warning">Contracts not deployed. Configure addresses in <code>.env</code>.</Alert>
      ) : loading ? (
        <CircularProgress />
      ) : argnBalance === null ? (
        <Alert severity="info">Unable to read balance.</Alert>
      ) : argnBalance === '0' ? (
        <Alert severity="info">No ARGN tokens in your wallet.</Alert>
      ) : (
        <Paper elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 3, p: 3 }}>
          <Typography variant="h4" fontWeight={700} color="#03045e">{argnBalance} <span style={{ fontSize: 18, color: '#888' }}>ARGN</span></Typography>
          <Typography variant="body2" color="#666" mt={0.5}>Argonath Bond tokens in your wallet</Typography>
          <Button size="small" variant="outlined" onClick={loadPortfolio} sx={{ mt: 2, borderColor: '#03045e', color: '#03045e', fontSize: 12 }}>Refresh</Button>
        </Paper>
      )}
    </Stack>
  );
}

// Libellés lisibles pour chaque événement HCS
const HCS_EVENT_LABELS = {
  wallet_phone_linked:          'Wallet linked to verified account',
  allocation_created:           'T-Bill allocation created',
  allocation_status_changed:    'Allocation status updated',
  allocation_redeemed:          'Allocation redeemed (ARGN minted)',
  repo_lending_offer_created:   'Lending offer created',
  repo_borrow_request_created:  'Borrow request created',
  repo_offer_accepted:          'Offer accepted',
  repo_proposal_submitted:      'Proposal submitted',
  repo_proposal_accepted:       'Proposal accepted',
  repo_request_funded:          'Borrow request funded',
  repo_repaid:                  'Repayment completed',
  repo_default_claimed:         'Default claimed',
  repo_offer_cancelled:         'Offer cancelled',
  repo_request_cancelled:       'Request cancelled',
};

// ─── Section : Historique HCS ─────────────────────────────────────────────────
function HistorySection({ accountId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(false);
  const evmAddr = toEvmAddress(accountId)?.toLowerCase();

  const load = useCallback(async () => {
    if (!evmAddr) return;
    setLoading(true);
    try {
      const data = await fetchHCSMessages({ wallet: evmAddr, limit: 50 });
      setMessages(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, [evmAddr]);

  useEffect(() => { load(); }, [load]);

  if (!process.env.REACT_APP_HCS_TOPIC_ID) {
    return <Alert severity="info">Journal HCS non configuré sur ce déploiement.</Alert>;
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6" fontWeight={700} color="#03045e">My Notarial History</Typography>
        <Button size="small" variant="outlined" onClick={load} disabled={loading}
          sx={{ borderColor: '#03045e', color: '#03045e' }}>
          {loading ? <CircularProgress size={16} /> : 'Refresh'}
        </Button>
      </Stack>
      <Typography variant="body2" color="#888">
        Immutable records on Hedera Consensus Service linked to your wallet.
      </Typography>

      {loading && <CircularProgress sx={{ alignSelf: 'center' }} />}

      {!loading && messages.length === 0 && (
        <Alert severity="info">No events recorded for your wallet.</Alert>
      )}

      {messages.map((msg, i) => {
        const ts  = msg.ts ? new Date(msg.ts).toLocaleString('fr-FR') : '—';
        const pub = msg.public || {};
        const label = HCS_EVENT_LABELS[msg.event] || msg.event || 'Événement';
        return (
          <Paper key={i} elevation={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 2, p: 2 }}>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" fontWeight={700} color="#03045e">{label}</Typography>
                <Typography variant="caption" color="#888">{ts}</Typography>
              </Stack>
              {/* Public data (excluding label) */}
              {Object.keys(pub).filter(k => k !== 'label').length > 0 && (
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  {Object.entries(pub).filter(([k]) => k !== 'label').map(([k, v]) => (
                    <Box key={k}>
                      <Typography variant="caption" color="#888" display="block">{k}</Typography>
                      <Typography variant="body2" fontSize="0.8rem">{String(v)}</Typography>
                    </Box>
                  ))}
                </Stack>
              )}
              {msg.phone_proof && (
                <Typography variant="caption" color="#9e9e9e" fontFamily="monospace">
                  phone_proof : {msg.phone_proof.slice(0, 20)}…
                </Typography>
              )}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}

// ─── Page principale Investor ──────────────────────────────────────────────────
export default function Investor() {
  const { accountId, walletInterface } = useWalletInterface();
  const [tab, setTab] = useState(0);
  const [wrongNetwork, setWrongNetwork] = useState(false);

  useEffect(() => {
    if (!window.ethereum) return;
    const checkNetwork = async () => {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      // 31337 = 0x7a69 Hardhat local
      setWrongNetwork(chainId !== EXPECTED_CHAIN_ID);
    };
    checkNetwork();
    window.ethereum.on('chainChanged', checkNetwork);
    return () => window.ethereum.removeListener('chainChanged', checkNetwork);
  }, []);

  if (!accountId) {
    return (
      <Stack alignItems="center" justifyContent="center" minHeight="60vh" spacing={2}>
        <Typography variant="h5" fontWeight={700} color="#03045e">Investor Interface</Typography>
        <Typography color="#666">Connect your MetaMask or WalletConnect wallet to access your T-Bills.</Typography>
        <Alert severity="info" sx={{ maxWidth: 480 }}>
          Use the <b>Connect Wallet</b> button in the navigation bar.
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h5" fontWeight={700} color="#03045e">Investor Interface</Typography>
        <Typography variant="body2" color="#888">
          Connected wallet: <b>{accountId}</b>
        </Typography>
      </Box>

      {wrongNetwork && (
        <Alert severity="error">
          ⚠️ Wrong network — connect MetaMask to <b>Hedera Testnet</b> (RPC: <code>https://testnet.hashio.io/api</code>, Chain ID: <b>296</b>, Symbol: <b>HBAR</b>).
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: '#e0e0e0' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}
          TabIndicatorProps={{ style: { backgroundColor: '#03045e' } }}>
          {['My T-Bills', 'Portfolio', 'HCS History'].map((l, i) => (
            <Tab key={i} label={l} sx={{ fontWeight: 600, color: tab === i ? '#03045e' : '#666' }} />
          ))}
        </Tabs>
      </Box>

      <Box>
        {tab === 0 && <ClaimsSection accountId={accountId} walletInterface={walletInterface} onRedeemed={() => setTab(1)} />}
        {tab === 1 && <PortfolioSection accountId={accountId} />}
        {tab === 2 && <HistorySection accountId={accountId} />}
      </Box>
    </Stack>
  );
}
