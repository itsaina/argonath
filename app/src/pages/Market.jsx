import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Paper, Stack,
  TextField, Typography,
} from "@mui/material";
import { AccountId } from "@hashgraph/sdk";
import { useWalletInterface } from "../services/wallets/useWalletInterface";
import {
  CONTRACT_ADDRESSES, REPO_ESCROW_ABI, MOCK_CASH_ABI, BOND_TOKEN_ABI, REPO_STATUS, HTS_PRECOMPILE,
} from "../services/contracts";
import { ContractFunctionParameterBuilder } from "../services/wallets/contractFunctionParameterBuilder";
import { ethers } from "ethers";
import {
  fetchProposals, submitProposal, acceptProposal, rejectProposal, notifyHCS,
  saveRepoOffer, fetchRepoOffers, saveRepoRequest, fetchRepoRequests,
} from "../services/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toEvmAddress(accountId) {
  if (!accountId) return null;
  if (accountId.startsWith('0x')) return accountId.toLowerCase();
  try { return ('0x' + AccountId.fromString(accountId).toSolidityAddress()).toLowerCase(); }
  catch { return accountId.toLowerCase(); }
}

function formatMGA(wMgaUnits) {
  return (Number(wMgaUnits) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' wMGA';
}

/* global BigInt */
function estimateRepay(cashAmount, rateBps, durationSeconds) {
  try {
    const c = BigInt(String(cashAmount));
    const r = BigInt(String(rateBps));
    const d = BigInt(String(durationSeconds));
    const interest = c * r * d / (10000n * 31536000n);
    return (c + interest).toString();
  } catch { return null; }
}

const GRACE_MS = 24 * 3600 * 1000;

function getProvider() {
  return new ethers.providers.JsonRpcProvider(
    process.env.REACT_APP_RPC_URL || 'https://testnet.hashio.io/api'
  );
}

async function approveARGN(walletInterface, evmAccount, spender, amount) {
  if (evmAccount && window.ethereum) {
    const iface = new ethers.utils.Interface([
      'function approve(address token, address spender, uint256 amount) returns (int64)'
    ]);
    const data = iface.encodeFunctionData('approve', [
      CONTRACT_ADDRESSES.BondToken,
      spender,
      ethers.BigNumber.from(String(amount)),
    ]);
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{ from: evmAccount, to: HTS_PRECOMPILE, data, gas: '0xF4240' }],
    });
    if (txHash) {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.waitForTransaction(txHash);
    }
    return txHash;
  } else {
    const params = new ContractFunctionParameterBuilder()
      .addParam({ type: 'address', name: 'token',   value: CONTRACT_ADDRESSES.BondToken })
      .addParam({ type: 'address', name: 'spender', value: spender })
      .addParam({ type: 'uint256', name: 'amount',  value: amount });
    return walletInterface.executeContractFunction(HTS_PRECOMPILE, 'approve', params, 1_000_000);
  }
}

const STATUS_CHIP = {
  Open:        { label: 'Open',        bg: '#e3f2fd', color: '#1565c0' },
  Active:      { label: 'Active',      bg: '#fff3e0', color: '#e65100' },
  MarginCalled:{ label: 'Margin Call', bg: '#fff8e1', color: '#f57f17' },
  Repaid:      { label: 'Repaid',      bg: '#e8f5e9', color: '#2e7d32' },
  Defaulted:   { label: 'Defaulted',   bg: '#ffebee', color: '#b71c1c' },
  Cancelled:   { label: 'Cancelled',   bg: '#f5f5f5', color: '#9e9e9e' },
  Archived:    { label: 'Archived',    bg: '#f3e5f5', color: '#6a1b9a' },
};

const TYPE_CHIP = {
  offer:   { label: 'Lending Offer',  bg: '#e8f5e9', color: '#2e7d32' },
  request: { label: 'Borrow Request', bg: '#fff3e0', color: '#e65100' },
};

// ═══════════════════════════════════════════════════════════════════════════
// MODE A — LENDING OFFER CARD
// ═══════════════════════════════════════════════════════════════════════════

function RepoCard({ offer, offerId, accountId, walletInterface, onRefresh }) {
  const [loading, setLoading] = useState('');
  const [txStatus, setTxStatus] = useState('');

  const statusLabel = REPO_STATUS[Number(offer.status)] || 'Open';
  const chip = STATUS_CHIP[statusLabel] || STATUS_CHIP.Open;
  const evmAccount = toEvmAddress(accountId);
  const lenderAddr = offer.lender?.toLowerCase();
  const borrowerAddr = offer.borrower?.toLowerCase();

  const maturityDate = Number(offer.maturity) > 0 ? new Date(Number(offer.maturity) * 1000) : null;
  const marginDeadline = Number(offer.marginCallDeadline) > 0 ? new Date(Number(offer.marginCallDeadline) * 1000) : null;
  // Le lender peut trigger le margin call dès que le repo est matured (statut Active)
  const canTriggerMarginCall = statusLabel === 'Active' && maturityDate && Date.now() >= maturityDate.getTime();
  // Le lender peut claim default uniquement après MarginCalled + deadline expiré
  const isDefaultable = statusLabel === 'MarginCalled' && marginDeadline && Date.now() > marginDeadline.getTime();
  // Alerte "deadline bientôt" si en MarginCalled et deadline pas encore passée
  const isInMarginGrace = statusLabel === 'MarginCalled' && marginDeadline && Date.now() <= marginDeadline.getTime();
  const isLender = evmAccount && evmAccount === lenderAddr;
  const isBorrower = evmAccount && evmAccount === borrowerAddr;

  const haircut = Number(offer.haircut);
  const cashAmt = Number(offer.cashAmount);
  const collateralReq = haircut < 10000
    ? Math.ceil(cashAmt * 10000 / ((10000 - haircut) * 1e6))
    : 0;

  const repayEstimate = statusLabel === 'Active'
    ? estimateRepay(offer.cashAmount, offer.repoRateBps, offer.durationSeconds)
    : null;

  const execTx = async (action) => {
    if (!accountId) return alert("Connect your wallet first.");
    setLoading(action); setTxStatus('');
    try {
      let txHash;

      if (action === 'accept') {
        await approveARGN(walletInterface, evmAccount, CONTRACT_ADDRESSES.RepoEscrow, collateralReq);
        const acceptParams = new ContractFunctionParameterBuilder()
          .addParam({ type: 'uint256', name: 'offerId', value: offerId });
        txHash = await walletInterface.executeContractFunction(
          CONTRACT_ADDRESSES.RepoEscrow, 'accept', acceptParams, 400_000
        );

      } else if (action === 'repay') {
        const contract = new ethers.Contract(CONTRACT_ADDRESSES.RepoEscrow, REPO_ESCROW_ABI, getProvider());
        const repayAmt = (await contract.repayAmount(offerId)).toString();
        const approveParams = new ContractFunctionParameterBuilder()
          .addParam({ type: 'address', name: 'spender', value: CONTRACT_ADDRESSES.RepoEscrow })
          .addParam({ type: 'uint256', name: 'amount',  value: repayAmt });
        await walletInterface.executeContractFunction(
          CONTRACT_ADDRESSES.MockCash, 'approve', approveParams, 80_000
        );
        const repayParams = new ContractFunctionParameterBuilder()
          .addParam({ type: 'uint256', name: 'offerId', value: offerId });
        txHash = await walletInterface.executeContractFunction(
          CONTRACT_ADDRESSES.RepoEscrow, 'repay', repayParams, 300_000
        );

      } else if (action === 'triggerMarginCall') {
        // Le lender déclenche le margin call après maturité → status MarginCalled
        const mcParams = new ContractFunctionParameterBuilder()
          .addParam({ type: 'uint256', name: 'offerId', value: offerId });
        txHash = await walletInterface.executeContractFunction(
          CONTRACT_ADDRESSES.RepoEscrow, 'triggerMarginCall', mcParams, 200_000
        );

      } else if (action === 'default') {
        // Uniquement possible après triggerMarginCall + deadline expiré
        const defParams = new ContractFunctionParameterBuilder()
          .addParam({ type: 'uint256', name: 'offerId', value: offerId });
        txHash = await walletInterface.executeContractFunction(
          CONTRACT_ADDRESSES.RepoEscrow, 'claimDefault', defParams, 200_000
        );

      } else if (action === 'cancel') {
        const cancelParams = new ContractFunctionParameterBuilder()
          .addParam({ type: 'uint256', name: 'offerId', value: offerId });
        txHash = await walletInterface.executeContractFunction(
          CONTRACT_ADDRESSES.RepoEscrow, 'cancelOffer', cancelParams, 150_000
        );
      }

      setTxStatus(txHash ? 'success' : 'error');
      if (txHash) {
        const eventMap = {
          accept: 'repo_offer_accepted', repay: 'repo_repaid',
          triggerMarginCall: 'repo_margin_call_triggered',
          default: 'repo_default_claimed', cancel: 'repo_offer_cancelled',
        };
        notifyHCS(eventMap[action] || action, evmAccount, {
          public: { offerId: Number(offerId), label: `Offer #${offerId} — ${eventMap[action] || action}` },
        });
        setTimeout(onRefresh, 2500);
      }
    } catch (err) {
      console.error(err); setTxStatus('error');
    }
    setLoading('');
  };

  return (
    <Paper elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 2, p: 2.5 }}>
      <Stack spacing={1.5}>
        {/* Header row */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label={TYPE_CHIP.offer.label} size="small"
              sx={{ backgroundColor: TYPE_CHIP.offer.bg, color: TYPE_CHIP.offer.color, fontWeight: 700, fontSize: '0.7rem' }} />
            <Typography fontWeight={700} color="#03045e" variant="body2">#{offerId}</Typography>
            <Chip label={chip.label} size="small"
              sx={{ backgroundColor: chip.bg, color: chip.color, fontWeight: 600, fontSize: '0.7rem' }} />
          </Stack>
          <Typography variant="h6" fontWeight={700} color="#03045e">{formatMGA(offer.cashAmount)}</Typography>
        </Stack>

        {/* Details row */}
        <Stack direction="row" spacing={3} flexWrap="wrap">
          <Box>
            <Typography variant="caption" color="#888">Term</Typography>
            <Typography variant="body2" fontWeight={600}>{(Number(offer.durationSeconds) / 86400).toFixed(0)} days</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="#888">Repo Rate</Typography>
            <Typography variant="body2" fontWeight={600}>{(Number(offer.repoRateBps) / 100).toFixed(2)} %/yr</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="#888">Haircut</Typography>
            <Typography variant="body2" fontWeight={600}>{(haircut / 100).toFixed(0)} %</Typography>
          </Box>
          {statusLabel === 'Open' && (
            <Box>
              <Typography variant="caption" color="#888">ARGN Collateral Required</Typography>
              <Typography variant="body2" fontWeight={600}>{collateralReq.toLocaleString()} ARGN</Typography>
            </Box>
          )}
          {statusLabel === 'Active' && (
            <>
              <Box>
                <Typography variant="caption" color="#888">Locked Collateral</Typography>
                <Typography variant="body2" fontWeight={600}>{Number(offer.collateralAmount).toLocaleString()} ARGN</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="#888">Maturity</Typography>
                <Typography variant="body2" fontWeight={600}>{maturityDate?.toLocaleDateString('en-US')}</Typography>
              </Box>
              {repayEstimate && (
                <Box>
                  <Typography variant="caption" color="#888">Est. Repayment</Typography>
                  <Typography variant="body2" fontWeight={600} color="#e65100">{formatMGA(repayEstimate)}</Typography>
                </Box>
              )}
            </>
          )}
          <Box>
            <Typography variant="caption" color="#888">Lender</Typography>
            <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{offer.lender?.slice(0, 10)}…</Typography>
          </Box>
          {borrowerAddr && borrowerAddr !== '0x0000000000000000000000000000000000000000' && (
            <Box>
              <Typography variant="caption" color="#888">Borrower</Typography>
              <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{offer.borrower?.slice(0, 10)}…</Typography>
            </Box>
          )}
        </Stack>

        {isInMarginGrace && (
          <Alert severity="warning" sx={{ py: 0, fontSize: '0.8rem' }}>
            ⚠️ Margin Call — repay before {marginDeadline?.toLocaleTimeString()} or lender claims collateral.
          </Alert>
        )}
        {txStatus === 'success' && <Alert severity="success" sx={{ py: 0 }}>Transaction sent ✓</Alert>}
        {txStatus === 'error'   && <Alert severity="error"   sx={{ py: 0 }}>Transaction failed</Alert>}

        {/* Actions */}
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {statusLabel === 'Open' && !isLender && accountId && (
            <Button variant="contained" size="small" disabled={!!loading}
              onClick={() => execTx('accept')}
              sx={{ backgroundColor: '#03045e', '&:hover': { backgroundColor: '#020338' } }}>
              {loading === 'accept' ? <CircularProgress size={16} color="inherit" /> : 'Accept (DvP)'}
            </Button>
          )}
          {statusLabel === 'Open' && isLender && (
            <Button variant="outlined" size="small" color="error" disabled={!!loading}
              onClick={() => execTx('cancel')}>
              {loading === 'cancel' ? <CircularProgress size={16} color="inherit" /> : 'Cancel Offer'}
            </Button>
          )}
          {(statusLabel === 'Active' || statusLabel === 'MarginCalled') && isBorrower && (
            <Button variant="outlined" size="small" disabled={!!loading}
              onClick={() => execTx('repay')}
              sx={{ borderColor: '#03045e', color: '#03045e' }}>
              {loading === 'repay' ? <CircularProgress size={16} color="inherit" /> : 'Repay'}
            </Button>
          )}
          {canTriggerMarginCall && isLender && (
            <Button variant="outlined" size="small" color="warning" disabled={!!loading}
              onClick={() => execTx('triggerMarginCall')}
              sx={{ borderColor: '#f57f17', color: '#f57f17' }}>
              {loading === 'triggerMarginCall' ? <CircularProgress size={16} color="inherit" /> : 'Trigger Margin Call'}
            </Button>
          )}
          {isDefaultable && isLender && (
            <Button variant="outlined" size="small" color="error" disabled={!!loading}
              onClick={() => execTx('default')}>
              {loading === 'default' ? <CircularProgress size={16} color="inherit" /> : 'Claim Default'}
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE LENDING OFFER FORM
// ═══════════════════════════════════════════════════════════════════════════

function CreateLendingOfferSection({ accountId, walletInterface, onCreated }) {
  const [form, setForm] = useState({ cashMGA: '', repoRate: '8', haircut: '10', durationDays: '7' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const hasContracts = !!CONTRACT_ADDRESSES.RepoEscrow && !!CONTRACT_ADDRESSES.MockCash;

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const cashMgaNum = Number(form.cashMGA) || 0;
  const haircutNum = Number(form.haircut) || 0;
  const collateralPreview = haircutNum < 100 && cashMgaNum > 0
    ? Math.ceil(cashMgaNum / (1 - haircutNum / 100))
    : 0;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!accountId) return alert("Connect your wallet first.");
    setLoading(true); setStatus('');
    try {
      const cashAmount   = ethers.utils.parseUnits(form.cashMGA, 6).toString();
      const repoRateBps  = Math.round(Number(form.repoRate) * 100);
      const haircutBps   = Math.round(Number(form.haircut) * 100);
      const durationSecs = Number(form.durationDays) * 86400;

      if (repoRateBps <= 0) { setStatus('rate_zero'); setLoading(false); return; }

      const evmAddr = toEvmAddress(accountId);
      if (evmAddr) {
        const mockCash = new ethers.Contract(CONTRACT_ADDRESSES.MockCash, MOCK_CASH_ABI, getProvider());
        const bal = await mockCash.balanceOf(evmAddr);
        if (bal.lt(ethers.BigNumber.from(cashAmount))) {
          setStatus('insufficient_cash'); setLoading(false); return;
        }
      }

      const approveParams = new ContractFunctionParameterBuilder()
        .addParam({ type: 'address', name: 'spender', value: CONTRACT_ADDRESSES.RepoEscrow })
        .addParam({ type: 'uint256', name: 'amount',  value: cashAmount });
      await walletInterface.executeContractFunction(
        CONTRACT_ADDRESSES.MockCash, 'approve', approveParams, 80_000
      );

      const offerParams = new ContractFunctionParameterBuilder()
        .addParam({ type: 'uint256', name: 'cashAmount',      value: cashAmount })
        .addParam({ type: 'uint256', name: 'repoRateBps',     value: repoRateBps })
        .addParam({ type: 'uint256', name: 'haircut',         value: haircutBps })
        .addParam({ type: 'uint256', name: 'durationSeconds', value: durationSecs });

      const txHash = await walletInterface.executeContractFunction(
        CONTRACT_ADDRESSES.RepoEscrow, 'createLendingOffer', offerParams, 300_000
      );

      setStatus(txHash ? 'success' : 'error');
      if (txHash) {
        const evmAddr = toEvmAddress(accountId);
        notifyHCS('repo_lending_offer_created', evmAddr, {
          public: { cashMGA: Number(form.cashMGA), repoRate: Number(form.repoRate), haircut: Number(form.haircut), durationDays: Number(form.durationDays), label: 'Lending offer created' },
        });
        try {
          await new Promise(r => setTimeout(r, 4000));
          const provider = getProvider();
          const contract = new ethers.Contract(CONTRACT_ADDRESSES.RepoEscrow, REPO_ESCROW_ABI, provider);
          const count = Number(await contract.offerCount());
          const offerId = count - 1;
          await saveRepoOffer({
            offerId, lender: evmAddr, cashAmount: Number(cashAmount),
            repoRateBps, haircutBps, durationSec: durationSecs,
            contractAddr: CONTRACT_ADDRESSES.RepoEscrow,
          });
        } catch {}
        setForm({ cashMGA: '', repoRate: '8', haircut: '10', durationDays: '7' }); onCreated();
      }
    } catch (err) {
      console.error(err); setStatus('error');
    }
    setLoading(false);
  };

  return (
    <Paper elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 3, p: 3 }}>
      <Typography variant="subtitle1" fontWeight={700} color="#2e7d32" mb={2}>💰 Post a Lending Offer</Typography>
      {!hasContracts && <Alert severity="warning" sx={{ mb: 2 }}>Contracts not deployed.</Alert>}
      {status === 'success'           && <Alert severity="success" sx={{ mb: 2 }}>Offer published — wMGA locked in escrow.</Alert>}
      {status === 'error'             && <Alert severity="error"   sx={{ mb: 2 }}>Failed — check your wMGA balance.</Alert>}
      {status === 'insufficient_cash' && <Alert severity="error"   sx={{ mb: 2 }}>Insufficient wMGA balance for this offer.</Alert>}
      {status === 'rate_zero'         && <Alert severity="error"   sx={{ mb: 2 }}>Repo rate must be greater than 0%.</Alert>}

      <form onSubmit={handleCreate}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TextField name="cashMGA" label="Amount to lend (MGA)" type="number"
              value={form.cashMGA} onChange={handleChange} fullWidth required disabled={!hasContracts}
              InputProps={{ inputProps: { min: 1, step: '0.01' } }}
              helperText="Converted to wMGA (× 1e6)" />
            <TextField name="haircut" label="Haircut (%)" type="number"
              value={form.haircut} onChange={handleChange} fullWidth disabled={!hasContracts}
              InputProps={{ inputProps: { min: 0, max: 99, step: '0.5' } }}
              helperText={`Collateral required: ${collateralPreview.toLocaleString()} ARGN`} />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField name="repoRate" label="Repo rate (%/yr)" type="number"
              value={form.repoRate} onChange={handleChange} fullWidth disabled={!hasContracts}
              InputProps={{ inputProps: { min: 0.01, step: '0.1' } }} />
            <TextField name="durationDays" label="Duration (days)" type="number"
              value={form.durationDays} onChange={handleChange} fullWidth disabled={!hasContracts}
              InputProps={{ inputProps: { min: 1 } }} />
          </Stack>
          <Button type="submit" variant="contained" disabled={loading || !hasContracts || !accountId}
            sx={{ backgroundColor: '#2e7d32', '&:hover': { backgroundColor: '#1b5e20' } }}>
            {loading ? <CircularProgress size={20} color="inherit" /> : 'Publish Offer (lock wMGA)'}
          </Button>
          {!accountId && <Alert severity="info" sx={{ py: 0 }}>Connect your wallet to post an offer.</Alert>}
        </Stack>
      </form>
    </Paper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODE B — BORROW REQUEST
// ═══════════════════════════════════════════════════════════════════════════

function ProposalDialog({ open, onClose, request, requestId, lenderAddress, onSubmitted }) {
  const [form, setForm] = useState({ cashMGA: '', ratePct: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const maxRatePct = (Number(request?.maxRateBps) / 100).toFixed(2);
  const desiredMGA = request ? (Number(request.desiredCash) / 1e6).toFixed(2) : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    const rateBps = Math.round(Number(form.ratePct) * 100);
    if (rateBps > Number(request?.maxRateBps)) {
      setErr(`Rate too high — max accepted: ${maxRatePct}%`); return;
    }
    const cashAmount = Math.round(Number(form.cashMGA) * 1e6);
    if (cashAmount < Number(request?.desiredCash)) {
      setErr(`Amount too low — minimum: ${desiredMGA} wMGA`); return;
    }
    setLoading(true);
    try {
      await submitProposal(requestId, lenderAddress, cashAmount, rateBps, Number(request.durationSeconds));
      onSubmitted(); onClose();
      setForm({ cashMGA: '', ratePct: '' });
    } catch (e2) {
      setErr(e2.message || 'Error');
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, color: '#03045e' }}>Submit a Proposal</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2}>
            {request && (
              <Alert severity="info" sx={{ py: 0 }}>
                Request #{requestId} — {request.collateralLocked?.toLocaleString()} ARGN collateral<br />
                Wants ≥ {desiredMGA} wMGA · Max rate {maxRatePct}% · {(Number(request.durationSeconds)/86400).toFixed(0)} days
              </Alert>
            )}
            {err && <Alert severity="error" sx={{ py: 0 }}>{err}</Alert>}
            <TextField label="Amount to lend (MGA)" type="number" value={form.cashMGA}
              onChange={e => setForm(f => ({ ...f, cashMGA: e.target.value }))}
              required fullWidth InputProps={{ inputProps: { min: 0, step: '0.01' } }}
              helperText={`Minimum: ${desiredMGA} MGA`} />
            <TextField label="Repo rate (%/yr)" type="number" value={form.ratePct}
              onChange={e => setForm(f => ({ ...f, ratePct: e.target.value }))}
              required fullWidth InputProps={{ inputProps: { min: 0, step: '0.01' } }}
              helperText={`Maximum accepted: ${maxRatePct}%`} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}
            sx={{ backgroundColor: '#03045e' }}>
            {loading ? <CircularProgress size={18} color="inherit" /> : 'Submit Proposal'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function ProposalsPanel({ requestId, borrowerAddress, accountId, walletInterface, request, onFunded }) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState('');
  const [fundStatus, setFundStatus] = useState('');
  const currentEvmAddr = toEvmAddress(accountId);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProposals(await fetchProposals(requestId)); }
    catch {}
    setLoading(false);
  }, [requestId]);

  useEffect(() => { load(); }, [load]);

  const handleAccept = async (proposal) => {
    setActionId(proposal.id);
    try {
      // 1. Accepter dans la DB off-chain
      await acceptProposal(proposal.id);
      // 2. Whitelist le prêteur on-chain (protège contre front-running sur fundRequest)
      if (walletInterface && CONTRACT_ADDRESSES.RepoEscrow) {
        const acceptLenderParams = new ContractFunctionParameterBuilder()
          .addParam({ type: 'uint256', name: 'requestId', value: requestId })
          .addParam({ type: 'address', name: 'lender',    value: proposal.lender_address });
        await walletInterface.executeContractFunction(
          CONTRACT_ADDRESSES.RepoEscrow, 'setAcceptedLender', acceptLenderParams, 150_000
        );
      }
      await load();
    } catch (e) { alert(e.message); }
    setActionId('');
  };

  const handleReject = async (id) => {
    setActionId(id);
    try { await rejectProposal(id); await load(); }
    catch (e) { alert(e.message); }
    setActionId('');
  };

  const handleFund = async (proposal) => {
    if (!proposal || !walletInterface) return;
    setFundStatus('loading');
    try {
      const actualCash    = proposal.cash_amount;
      const actualRateBps = proposal.rate_bps;

      const approveParams = new ContractFunctionParameterBuilder()
        .addParam({ type: 'address', name: 'spender', value: CONTRACT_ADDRESSES.RepoEscrow })
        .addParam({ type: 'uint256', name: 'amount',  value: Math.round(actualCash) });
      await walletInterface.executeContractFunction(
        CONTRACT_ADDRESSES.MockCash, 'approve', approveParams, 80_000
      );
      const fundParams = new ContractFunctionParameterBuilder()
        .addParam({ type: 'uint256', name: 'requestId',     value: requestId })
        .addParam({ type: 'uint256', name: 'actualCash',    value: Math.round(actualCash) })
        .addParam({ type: 'uint256', name: 'actualRateBps', value: actualRateBps });
      const txHash = await walletInterface.executeContractFunction(
        CONTRACT_ADDRESSES.RepoEscrow, 'fundRequest', fundParams, 400_000
      );
      setFundStatus(txHash ? 'success' : 'error');
      if (txHash) {
        notifyHCS('repo_request_funded', currentEvmAddr, {
          public: { requestId: Number(requestId), actualCash, actualRateBps, label: 'Borrow request funded' },
        });
        setTimeout(() => { onFunded(); setFundStatus(''); }, 2000);
      }
    } catch (err) {
      console.error(err); setFundStatus('error');
    }
  };

  const pending  = proposals.filter(p => p.status === 'pending');
  const accepted = proposals.find(p => p.status === 'accepted');
  const isMyAcceptedProposal = accepted && currentEvmAddr &&
    accepted.lender_address?.toLowerCase() === currentEvmAddr.toLowerCase();

  if (loading) return <CircularProgress size={20} />;

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2" color="#666" fontWeight={600}>
        Proposals received ({proposals.length})
      </Typography>

      {accepted && !isMyAcceptedProposal && (
        <Alert severity="success" sx={{ py: 0 }}>
          Proposal accepted: {(accepted.cash_amount / 1e6).toFixed(2)} wMGA at {(accepted.rate_bps / 100).toFixed(2)} %/yr<br />
          <b>Waiting for lender ({accepted.lender_address?.slice(0, 10)}…) to confirm funding.</b>
        </Alert>
      )}

      {isMyAcceptedProposal && (
        <Paper elevation={0} sx={{ border: '1.5px solid #4caf50', borderRadius: 2, p: 2 }}>
          <Stack spacing={1}>
            <Typography fontWeight={600} color="#2e7d32">Your proposal was accepted!</Typography>
            <Typography variant="body2">
              {(accepted.cash_amount / 1e6).toFixed(2)} wMGA · {(accepted.rate_bps / 100).toFixed(2)} %/yr
            </Typography>
            {fundStatus === 'success' && <Alert severity="success" sx={{ py: 0 }}>Funding confirmed ✓</Alert>}
            {fundStatus === 'error'   && <Alert severity="error"   sx={{ py: 0 }}>Funding failed</Alert>}
            <Button variant="contained" size="small" disabled={fundStatus === 'loading' || fundStatus === 'success'}
              onClick={() => handleFund(accepted)}
              sx={{ backgroundColor: '#2e7d32', alignSelf: 'flex-start' }}>
              {fundStatus === 'loading' ? <CircularProgress size={16} color="inherit" /> : 'Confirm Funding (approve + fundRequest)'}
            </Button>
          </Stack>
        </Paper>
      )}

      {pending.length === 0 && !accepted && (
        <Typography variant="body2" color="#aaa">No pending proposals.</Typography>
      )}

      {pending.map(p => {
        const isBorrowerView = currentEvmAddr &&
          borrowerAddress?.toLowerCase() === currentEvmAddr.toLowerCase();
        return (
          <Paper key={p.id} elevation={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 2, p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Stack>
                <Typography variant="body2" fontWeight={600}>
                  {(p.cash_amount / 1e6).toFixed(2)} wMGA · {(p.rate_bps / 100).toFixed(2)} %/yr
                </Typography>
                <Typography variant="caption" color="#888">
                  Lender: {p.lender_address?.slice(0, 10)}… · {(p.duration_sec / 86400).toFixed(0)} days
                </Typography>
              </Stack>
              {isBorrowerView && (
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="contained" disabled={!!actionId}
                    onClick={() => handleAccept(p)}
                    sx={{ backgroundColor: '#03045e', fontSize: '0.72rem' }}>
                    {actionId === p.id ? <CircularProgress size={14} color="inherit" /> : 'Accept'}
                  </Button>
                  <Button size="small" variant="outlined" color="error" disabled={!!actionId}
                    onClick={() => handleReject(p.id)} sx={{ fontSize: '0.72rem' }}>
                    Reject
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        );
      })}

      <Button size="small" variant="text" onClick={load} sx={{ alignSelf: 'flex-start', color: '#666' }}>
        ↻ Refresh proposals
      </Button>
    </Stack>
  );
}

function BorrowRequestCard({ req, requestId, accountId, walletInterface, onRefresh }) {
  const [loading, setLoading] = useState('');
  const [txStatus, setTxStatus] = useState('');
  const [showProposalDialog, setShowProposalDialog] = useState(false);
  const [proposalRefresh, setProposalRefresh] = useState(0);

  const statusLabel = REPO_STATUS[Number(req.status)] || 'Open';
  const chip = STATUS_CHIP[statusLabel] || STATUS_CHIP.Open;
  const evmAccount = toEvmAddress(accountId);
  const borrowerAddr = req.borrower?.toLowerCase();
  const lenderAddr = req.lender?.toLowerCase();

  const isBorrower = evmAccount && evmAccount === borrowerAddr;
  const isLender   = evmAccount && evmAccount === lenderAddr;
  const maturityDate = Number(req.maturity) > 0 ? new Date(Number(req.maturity) * 1000) : null;
  const marginDeadline = Number(req.marginCallDeadline) > 0 ? new Date(Number(req.marginCallDeadline) * 1000) : null;
  const canTriggerMarginCall = statusLabel === 'Active' && maturityDate && Date.now() >= maturityDate.getTime();
  const isDefaultable = statusLabel === 'MarginCalled' && marginDeadline && Date.now() > marginDeadline.getTime();
  const isInMarginGrace = statusLabel === 'MarginCalled' && marginDeadline && Date.now() <= marginDeadline.getTime();

  const repayEstimate = statusLabel === 'Active'
    ? estimateRepay(req.actualCash, req.actualRateBps, req.durationSeconds)
    : null;

  const execTx = async (action) => {
    if (!accountId) return alert("Connect your wallet first.");
    setLoading(action); setTxStatus('');
    try {
      let txHash;

      if (action === 'cancel') {
        const params = new ContractFunctionParameterBuilder()
          .addParam({ type: 'uint256', name: 'requestId', value: requestId });
        txHash = await walletInterface.executeContractFunction(
          CONTRACT_ADDRESSES.RepoEscrow, 'cancelRequest', params, 150_000
        );

      } else if (action === 'repay') {
        const contract = new ethers.Contract(CONTRACT_ADDRESSES.RepoEscrow, REPO_ESCROW_ABI, getProvider());
        const repayAmt = (await contract.repayRequestAmount(requestId)).toString();
        const approveParams = new ContractFunctionParameterBuilder()
          .addParam({ type: 'address', name: 'spender', value: CONTRACT_ADDRESSES.RepoEscrow })
          .addParam({ type: 'uint256', name: 'amount',  value: repayAmt });
        await walletInterface.executeContractFunction(
          CONTRACT_ADDRESSES.MockCash, 'approve', approveParams, 80_000
        );
        const repayParams = new ContractFunctionParameterBuilder()
          .addParam({ type: 'uint256', name: 'requestId', value: requestId });
        txHash = await walletInterface.executeContractFunction(
          CONTRACT_ADDRESSES.RepoEscrow, 'repayRequest', repayParams, 300_000
        );

      } else if (action === 'triggerMarginCall') {
        const params = new ContractFunctionParameterBuilder()
          .addParam({ type: 'uint256', name: 'requestId', value: requestId });
        txHash = await walletInterface.executeContractFunction(
          CONTRACT_ADDRESSES.RepoEscrow, 'triggerMarginCallRequest', params, 200_000
        );

      } else if (action === 'default') {
        const params = new ContractFunctionParameterBuilder()
          .addParam({ type: 'uint256', name: 'requestId', value: requestId });
        txHash = await walletInterface.executeContractFunction(
          CONTRACT_ADDRESSES.RepoEscrow, 'claimDefaultRequest', params, 200_000
        );
      }

      setTxStatus(txHash ? 'success' : 'error');
      if (txHash) {
        const eventMap = {
          cancel: 'repo_request_cancelled', repay: 'repo_repaid',
          triggerMarginCall: 'repo_margin_call_triggered',
          default: 'repo_default_claimed',
        };
        notifyHCS(eventMap[action] || action, evmAccount, {
          public: { requestId: Number(requestId), label: `Request #${requestId} — ${eventMap[action] || action}` },
        });
        setTimeout(onRefresh, 2500);
      }
    } catch (err) {
      console.error(err); setTxStatus('error');
    }
    setLoading('');
  };

  return (
    <Paper elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 2, p: 2.5 }}>
      <Stack spacing={1.5}>
        {/* Header row */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label={TYPE_CHIP.request.label} size="small"
              sx={{ backgroundColor: TYPE_CHIP.request.bg, color: TYPE_CHIP.request.color, fontWeight: 700, fontSize: '0.7rem' }} />
            <Typography fontWeight={700} color="#03045e" variant="body2">#{requestId}</Typography>
            <Chip label={chip.label} size="small"
              sx={{ backgroundColor: chip.bg, color: chip.color, fontWeight: 600, fontSize: '0.7rem' }} />
          </Stack>
          <Stack alignItems="flex-end">
            <Typography variant="h6" fontWeight={700} color="#03045e">
              {Number(req.collateralLocked).toLocaleString()} ARGN
            </Typography>
            <Typography variant="caption" color="#888">collateral locked</Typography>
          </Stack>
        </Stack>

        {/* Details row */}
        <Stack direction="row" spacing={3} flexWrap="wrap">
          <Box>
            <Typography variant="caption" color="#888">Term</Typography>
            <Typography variant="body2" fontWeight={600}>{(Number(req.durationSeconds) / 86400).toFixed(0)} days</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="#888">Max Rate</Typography>
            <Typography variant="body2" fontWeight={600}>{(Number(req.maxRateBps) / 100).toFixed(2)} %/yr</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="#888">Desired Cash</Typography>
            <Typography variant="body2" fontWeight={600}>{formatMGA(req.desiredCash)}</Typography>
          </Box>
          {statusLabel === 'Active' && (
            <>
              <Box>
                <Typography variant="caption" color="#888">Actual Rate</Typography>
                <Typography variant="body2" fontWeight={600}>{(Number(req.actualRateBps) / 100).toFixed(2)} %/yr</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="#888">Cash Received</Typography>
                <Typography variant="body2" fontWeight={600}>{formatMGA(req.actualCash)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="#888">Maturity</Typography>
                <Typography variant="body2" fontWeight={600}>{maturityDate?.toLocaleDateString('en-US')}</Typography>
              </Box>
              {repayEstimate && (
                <Box>
                  <Typography variant="caption" color="#888">Est. Repayment</Typography>
                  <Typography variant="body2" fontWeight={600} color="#e65100">{formatMGA(repayEstimate)}</Typography>
                </Box>
              )}
            </>
          )}
          <Box>
            <Typography variant="caption" color="#888">Borrower</Typography>
            <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{req.borrower?.slice(0, 10)}…</Typography>
          </Box>
          {lenderAddr && lenderAddr !== '0x0000000000000000000000000000000000000000' && (
            <Box>
              <Typography variant="caption" color="#888">Lender</Typography>
              <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{req.lender?.slice(0, 10)}…</Typography>
            </Box>
          )}
        </Stack>

        {isInMarginGrace && (
          <Alert severity="warning" sx={{ py: 0, fontSize: '0.8rem' }}>
            ⚠️ Margin Call — repay before {marginDeadline?.toLocaleTimeString()} or lender claims collateral.
          </Alert>
        )}
        {txStatus === 'success' && <Alert severity="success" sx={{ py: 0 }}>Transaction sent ✓</Alert>}
        {txStatus === 'error'   && <Alert severity="error"   sx={{ py: 0 }}>Transaction failed</Alert>}

        {/* Actions */}
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {statusLabel === 'Open' && !isBorrower && accountId && (
            <Button variant="contained" size="small" disabled={!!loading}
              onClick={() => setShowProposalDialog(true)}
              sx={{ backgroundColor: '#1565c0', '&:hover': { backgroundColor: '#0d47a1' } }}>
              Make a Proposal
            </Button>
          )}
          {statusLabel === 'Open' && isBorrower && (
            <Button variant="outlined" size="small" color="error" disabled={!!loading}
              onClick={() => execTx('cancel')}>
              {loading === 'cancel' ? <CircularProgress size={16} color="inherit" /> : 'Cancel Request'}
            </Button>
          )}
          {(statusLabel === 'Active' || statusLabel === 'MarginCalled') && isBorrower && (
            <Button variant="outlined" size="small" disabled={!!loading}
              onClick={() => execTx('repay')}
              sx={{ borderColor: '#03045e', color: '#03045e' }}>
              {loading === 'repay' ? <CircularProgress size={16} color="inherit" /> : 'Repay'}
            </Button>
          )}
          {canTriggerMarginCall && isLender && (
            <Button variant="outlined" size="small" color="warning" disabled={!!loading}
              onClick={() => execTx('triggerMarginCall')}
              sx={{ borderColor: '#f57f17', color: '#f57f17' }}>
              {loading === 'triggerMarginCall' ? <CircularProgress size={16} color="inherit" /> : 'Trigger Margin Call'}
            </Button>
          )}
          {isDefaultable && isLender && (
            <Button variant="outlined" size="small" color="error" disabled={!!loading}
              onClick={() => execTx('default')}>
              {loading === 'default' ? <CircularProgress size={16} color="inherit" /> : 'Claim Default'}
            </Button>
          )}
        </Stack>

        {statusLabel === 'Open' && (isBorrower || isLender) && (
          <>
            <Divider />
            <ProposalsPanel
              requestId={requestId} borrowerAddress={borrowerAddr}
              accountId={accountId} walletInterface={walletInterface}
              request={req} onFunded={() => { onRefresh(); }}
              key={proposalRefresh}
            />
          </>
        )}
      </Stack>

      <ProposalDialog
        open={showProposalDialog} onClose={() => setShowProposalDialog(false)}
        request={req} requestId={requestId}
        lenderAddress={toEvmAddress(accountId) || ''}
        onSubmitted={() => setProposalRefresh(n => n + 1)}
      />
    </Paper>
  );
}

function CreateBorrowRequestSection({ accountId, walletInterface, onCreated }) {
  const [form, setForm] = useState({ collateral: '', desiredMGA: '', maxRate: '8', durationDays: '7' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const hasContracts = !!CONTRACT_ADDRESSES.RepoEscrow && !!CONTRACT_ADDRESSES.BondToken;

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!accountId) return alert("Connect your wallet first.");
    setLoading(true); setStatus('');
    try {
      const collateralAmount = Math.round(Number(form.collateral));
      const desiredCash      = ethers.utils.parseUnits(form.desiredMGA, 6).toString();
      const maxRateBps       = Math.round(Number(form.maxRate) * 100);
      const durationSecs     = Number(form.durationDays) * 86400;

      if (maxRateBps <= 0) { setStatus('rate_zero'); setLoading(false); return; }

      const evmAddr = toEvmAddress(accountId);
      if (evmAddr) {
        const bondTokenContract = new ethers.Contract(CONTRACT_ADDRESSES.BondToken, BOND_TOKEN_ABI, getProvider());
        const bal = await bondTokenContract.balanceOf(evmAddr);
        if (bal.lt(ethers.BigNumber.from(collateralAmount))) {
          setStatus('insufficient_argn'); setLoading(false); return;
        }
      }

      const approveTx = await approveARGN(walletInterface, evmAddr, CONTRACT_ADDRESSES.RepoEscrow, collateralAmount);
      if (!approveTx) { setStatus('error'); setLoading(false); return; }

      const reqParams = new ContractFunctionParameterBuilder()
        .addParam({ type: 'uint256', name: 'collateralAmount', value: collateralAmount })
        .addParam({ type: 'uint256', name: 'desiredCash',      value: desiredCash })
        .addParam({ type: 'uint256', name: 'maxRateBps',       value: maxRateBps })
        .addParam({ type: 'uint256', name: 'durationSeconds',  value: durationSecs });

      const txHash = await walletInterface.executeContractFunction(
        CONTRACT_ADDRESSES.RepoEscrow, 'createBorrowRequest', reqParams, 400_000
      );

      setStatus(txHash ? 'success' : 'error');
      if (txHash) {
        notifyHCS('repo_borrow_request_created', evmAddr, {
          public: { collateral: collateralAmount, desiredMGA: form.desiredMGA, maxRate: form.maxRate, durationDays: form.durationDays, label: 'Borrow request created' },
        });
        try {
          await new Promise(r => setTimeout(r, 4000));
          const provider = getProvider();
          const contract = new ethers.Contract(CONTRACT_ADDRESSES.RepoEscrow, REPO_ESCROW_ABI, provider);
          const count = Number(await contract.requestCount());
          const requestId = count - 1;
          await saveRepoRequest({
            requestId, borrower: evmAddr, collateralAmount,
            desiredCash: Number(desiredCash), maxRateBps, durationSec: durationSecs,
            bondMaturityDate: '', contractAddr: CONTRACT_ADDRESSES.RepoEscrow,
          });
        } catch {}
        setForm({ collateral: '', desiredMGA: '', maxRate: '8', durationDays: '7' }); onCreated();
      }
    } catch (err) {
      console.error(err); setStatus('error');
    }
    setLoading(false);
  };

  return (
    <Paper elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 3, p: 3 }}>
      <Typography variant="subtitle1" fontWeight={700} color="#1565c0" mb={0.5}>📋 Post a Borrow Request</Typography>
      <Typography variant="body2" color="#888" mb={2}>
        Lock your ARGN as collateral. Lenders will submit proposals.
      </Typography>
      {!hasContracts && <Alert severity="warning" sx={{ mb: 2 }}>Contracts not deployed.</Alert>}
      {status === 'success'           && <Alert severity="success" sx={{ mb: 2 }}>Request published — ARGN locked in escrow.</Alert>}
      {status === 'error'             && <Alert severity="error"   sx={{ mb: 2 }}>Failed — check your ARGN balance.</Alert>}
      {status === 'insufficient_argn' && <Alert severity="error"   sx={{ mb: 2 }}>Insufficient ARGN balance for this collateral.</Alert>}
      {status === 'rate_zero'         && <Alert severity="error"   sx={{ mb: 2 }}>Max rate must be greater than 0%.</Alert>}
      <form onSubmit={handleCreate}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TextField name="collateral" label="ARGN Collateral to lock" type="number"
              value={form.collateral} onChange={handleChange} fullWidth required disabled={!hasContracts}
              InputProps={{ inputProps: { min: 1, step: 1 } }} />
            <TextField name="desiredMGA" label="Desired liquidity (MGA)" type="number"
              value={form.desiredMGA} onChange={handleChange} fullWidth required disabled={!hasContracts}
              InputProps={{ inputProps: { min: 1, step: '0.01' } }}
              helperText="Converted to wMGA (× 1e6)" />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField name="maxRate" label="Max rate accepted (%/yr)" type="number"
              value={form.maxRate} onChange={handleChange} fullWidth disabled={!hasContracts}
              InputProps={{ inputProps: { min: 0.01, step: '0.1' } }} />
            <TextField name="durationDays" label="Duration (days)" type="number"
              value={form.durationDays} onChange={handleChange} fullWidth disabled={!hasContracts}
              InputProps={{ inputProps: { min: 1 } }} />
          </Stack>
          <Button type="submit" variant="contained" disabled={loading || !hasContracts || !accountId}
            sx={{ backgroundColor: '#1565c0', '&:hover': { backgroundColor: '#0d47a1' } }}>
            {loading ? <CircularProgress size={20} color="inherit" /> : 'Publish Request (lock ARGN)'}
          </Button>
          {!accountId && <Alert severity="info" sx={{ py: 0 }}>Connect your wallet to post a request.</Alert>}
        </Stack>
      </form>
    </Paper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE MARKET — Unified list
// ═══════════════════════════════════════════════════════════════════════════

export default function Market() {
  const { accountId, walletInterface } = useWalletInterface();
  const [offers, setOffers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [filterType, setFilterType] = useState('all');     // all | offers | requests
  const [filterStatus, setFilterStatus] = useState('all'); // all | open | active
  const [showCreate, setShowCreate] = useState(false);
  const hasContracts = !!CONTRACT_ADDRESSES.RepoEscrow;

  const loadOffers = useCallback(async () => {
    setLoadingOffers(true);
    try {
      const dbOffers = await fetchRepoOffers();
      if (hasContracts && dbOffers.length > 0) {
        const provider = getProvider();
        const contract = new ethers.Contract(CONTRACT_ADDRESSES.RepoEscrow, REPO_ESCROW_ABI, provider);
        const enriched = await Promise.all(dbOffers.map(async (row) => {
          try {
            if (row.contract_addr && row.contract_addr.toLowerCase() !== CONTRACT_ADDRESSES.RepoEscrow.toLowerCase()) {
              return { ...row, _id: row.id, status: 99, _archived: true };
            }
            const onChain = await contract.offers(row.id);
            return { ...onChain, _id: row.id };
          } catch {
            return { ...row, _id: row.id, status: 99, _archived: true };
          }
        }));
        setOffers(enriched);
      } else if (hasContracts) {
        const provider = getProvider();
        const contract = new ethers.Contract(CONTRACT_ADDRESSES.RepoEscrow, REPO_ESCROW_ABI, provider);
        const count = Number(await contract.offerCount());
        const all = await Promise.all(
          Array.from({ length: count }, (_, i) => contract.offers(i).then(o => ({ ...o, _id: i })))
        );
        setOffers(all);
      } else {
        setOffers(dbOffers.map(r => ({ ...r, _id: r.id, status: 99, _archived: true })));
      }
    } catch (err) { console.error(err); }
    setLoadingOffers(false);
  }, [hasContracts]);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const dbRequests = await fetchRepoRequests();
      if (hasContracts && dbRequests.length > 0) {
        const provider = getProvider();
        const contract = new ethers.Contract(CONTRACT_ADDRESSES.RepoEscrow, REPO_ESCROW_ABI, provider);
        const enriched = await Promise.all(dbRequests.map(async (row) => {
          try {
            if (row.contract_addr && row.contract_addr.toLowerCase() !== CONTRACT_ADDRESSES.RepoEscrow.toLowerCase()) {
              return { ...row, _id: row.id, status: 99, _archived: true };
            }
            const onChain = await contract.borrowRequests(row.id);
            return { ...onChain, _id: row.id };
          } catch {
            return { ...row, _id: row.id, status: 99, _archived: true };
          }
        }));
        setRequests(enriched);
      } else if (hasContracts) {
        const provider = getProvider();
        const contract = new ethers.Contract(CONTRACT_ADDRESSES.RepoEscrow, REPO_ESCROW_ABI, provider);
        const count = Number(await contract.requestCount());
        const all = await Promise.all(
          Array.from({ length: count }, (_, i) => contract.borrowRequests(i).then(r => ({ ...r, _id: i })))
        );
        setRequests(all);
      } else {
        setRequests(dbRequests.map(r => ({ ...r, _id: r.id, status: 99, _archived: true })));
      }
    } catch (err) { console.error(err); }
    setLoadingRequests(false);
  }, [hasContracts]);

  const refresh = useCallback(() => { loadOffers(); loadRequests(); }, [loadOffers, loadRequests]);

  useEffect(() => { refresh(); }, [refresh]);

  // Unified filtered list
  const allItems = useMemo(() => {
    const o = offers.map(item => ({ ...item, _type: 'offer' }));
    const r = requests.map(item => ({ ...item, _type: 'request' }));
    return [...o, ...r].filter(item => {
      const s = REPO_STATUS[Number(item.status)];
      if (filterType === 'offers' && item._type !== 'offer') return false;
      if (filterType === 'requests' && item._type !== 'request') return false;
      if (filterStatus === 'open' && s !== 'Open') return false;
      if (filterStatus === 'active' && s !== 'Active') return false;
      if (filterStatus === 'margincall' && s !== 'MarginCalled') return false;
      return true;
    });
  }, [offers, requests, filterType, filterStatus]);

  const openCount   = offers.filter(o => REPO_STATUS[Number(o.status)] === 'Open').length
                    + requests.filter(r => REPO_STATUS[Number(r.status)] === 'Open').length;
  const activeCount = offers.filter(o => REPO_STATUS[Number(o.status)] === 'Active').length
                    + requests.filter(r => REPO_STATUS[Number(r.status)] === 'Active').length;

  const isLoading = loadingOffers || loadingRequests;

  return (
    <Stack spacing={4}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="h5" fontWeight={700} color="#03045e">Repo Market</Typography>
          <Stack direction="row" spacing={2} mt={0.5}>
            <Typography variant="body2" color="#888">
              <b style={{ color: '#1565c0' }}>{openCount}</b> open · <b style={{ color: '#e65100' }}>{activeCount}</b> active
            </Typography>
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={refresh} disabled={isLoading}
            sx={{ borderColor: '#03045e', color: '#03045e' }}>
            {isLoading ? <CircularProgress size={18} /> : '↻ Refresh'}
          </Button>
          <Button variant="contained" onClick={() => setShowCreate(s => !s)}
            sx={{ backgroundColor: '#03045e', '&:hover': { backgroundColor: '#020338' } }}>
            {showCreate ? 'Hide forms' : '+ New Position'}
          </Button>
        </Stack>
      </Stack>

      {!hasContracts && (
        <Alert severity="warning">Contracts not deployed. Configure <code>.env</code>.</Alert>
      )}

      {/* Create forms — collapsible */}
      {showCreate && (
        <Stack spacing={3}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
            <Box flex={1}>
              <CreateLendingOfferSection accountId={accountId} walletInterface={walletInterface} onCreated={refresh} />
            </Box>
            <Box flex={1}>
              <CreateBorrowRequestSection accountId={accountId} walletInterface={walletInterface} onCreated={refresh} />
            </Box>
          </Stack>
          <Divider />
        </Stack>
      )}

      {/* Filters */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
        {/* Type filter */}
        <Stack direction="row" spacing={0.5}>
          {[['all', 'All'], ['offers', 'Lending Offers'], ['requests', 'Borrow Requests']].map(([val, label]) => (
            <Button key={val} size="small"
              variant={filterType === val ? 'contained' : 'outlined'}
              onClick={() => setFilterType(val)}
              sx={filterType === val
                ? { backgroundColor: '#03045e', color: '#fff', fontSize: '0.75rem' }
                : { borderColor: '#ccc', color: '#666', fontSize: '0.75rem' }}>
              {label}
            </Button>
          ))}
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />

        {/* Status filter */}
        <Stack direction="row" spacing={0.5}>
          {[['all', 'All'], ['open', 'Open'], ['active', 'Active'], ['margincall', 'Margin Call']].map(([val, label]) => (
            <Button key={val} size="small"
              variant={filterStatus === val ? 'contained' : 'outlined'}
              onClick={() => setFilterStatus(val)}
              sx={filterStatus === val
                ? { backgroundColor: '#555', color: '#fff', fontSize: '0.75rem' }
                : { borderColor: '#ccc', color: '#666', fontSize: '0.75rem' }}>
              {label}
            </Button>
          ))}
        </Stack>
      </Stack>

      {/* Unified list */}
      {isLoading && <CircularProgress sx={{ alignSelf: 'center' }} />}

      {!isLoading && allItems.length === 0 && hasContracts && (
        <Alert severity="info">No items match this filter.</Alert>
      )}

      {!accountId && (
        <Alert severity="info">Connect your wallet to accept offers or post positions.</Alert>
      )}

      {allItems.map(item =>
        item._type === 'offer' ? (
          <RepoCard key={`offer-${item._id}`} offer={item} offerId={item._id}
            accountId={accountId} walletInterface={walletInterface} onRefresh={refresh} />
        ) : (
          <BorrowRequestCard key={`req-${item._id}`} req={item} requestId={item._id}
            accountId={accountId} walletInterface={walletInterface} onRefresh={refresh} />
        )
      )}
    </Stack>
  );
}
