import { useState, useEffect, useCallback } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Paper, Stack, Tab, Tabs,
  TextField, Typography, Badge,
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
  return (Number(wMgaUnits) / 1e6).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' wMGA';
}

/* global BigInt */
// Estimation du remboursement (même formule ACT/365 que le contrat)
function estimateRepay(cashAmount, rateBps, durationSeconds) {
  try {
    const c = BigInt(String(cashAmount));
    const r = BigInt(String(rateBps));
    const d = BigInt(String(durationSeconds));
    const interest = c * r * d / (10000n * 31536000n);
    return (c + interest).toString();
  } catch { return null; }
}

const GRACE_MS = 24 * 3600 * 1000; // 24h en millisecondes — correspond à GRACE_PERIOD du contrat

function getProvider() {
  return new ethers.providers.JsonRpcProvider(
    process.env.REACT_APP_RPC_URL || 'https://testnet.hashio.io/api'
  );
}

/**
 * Approuve le HTS token ARGN pour le spender.
 *
 * MetaMask : utilise window.ethereum.request directement (même pattern que associateToken
 *            dans Investor.jsx — seule méthode qui fonctionne avec Hedera + MetaMask).
 *            Appel au HTS Precompile 0x167 : approve(token, spender, amount)
 *
 * WalletConnect : utilise walletInterface.executeContractFunction via Hedera SDK.
 */
async function approveARGN(walletInterface, evmAccount, spender, amount) {
  if (evmAccount && window.ethereum) {
    // MetaMask — window.ethereum.request identique à associateToken dans Investor.jsx
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
      // 0xF4240 = 1 000 000 gas — HTS precompile approve needs > 300k on Hedera testnet
      params: [{ from: evmAccount, to: HTS_PRECOMPILE, data, gas: '0xF4240' }],
    });
    // Attendre la confirmation
    if (txHash) {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.waitForTransaction(txHash);
    }
    return txHash;
  } else {
    // WalletConnect — Hedera SDK
    const params = new ContractFunctionParameterBuilder()
      .addParam({ type: 'address', name: 'token',   value: CONTRACT_ADDRESSES.BondToken })
      .addParam({ type: 'address', name: 'spender', value: spender })
      .addParam({ type: 'uint256', name: 'amount',  value: amount });
    return walletInterface.executeContractFunction(HTS_PRECOMPILE, 'approve', params, 1_000_000);
  }
}

const STATUS_CHIP = {
  Open:      { label: 'Ouvert',    bg: '#e3f2fd', color: '#1565c0' },
  Active:    { label: 'Actif',     bg: '#fff3e0', color: '#e65100' },
  Repaid:    { label: 'Remboursé', bg: '#e8f5e9', color: '#2e7d32' },
  Defaulted: { label: 'Défaut',    bg: '#ffebee', color: '#b71c1c' },
  Cancelled: { label: 'Annulé',    bg: '#f5f5f5', color: '#9e9e9e' },
  Archived:  { label: 'Archivé',   bg: '#f3e5f5', color: '#6a1b9a' },
};

// ═══════════════════════════════════════════════════════════════════════════
// MODE A — LENDING OFFER
// ═══════════════════════════════════════════════════════════════════════════

function RepoCard({ offer, offerId, accountId, walletInterface, onRefresh }) {
  const [loading, setLoading] = useState('');
  const [txStatus, setTxStatus] = useState('');
  const [showAcceptForm, setShowAcceptForm] = useState(false);

  const statusLabel = REPO_STATUS[Number(offer.status)] || 'Open';
  const chip = STATUS_CHIP[statusLabel] || STATUS_CHIP.Open;
  const evmAccount = toEvmAddress(accountId);
  const lenderAddr = offer.lender?.toLowerCase();
  const borrowerAddr = offer.borrower?.toLowerCase();

  const maturityDate = Number(offer.maturity) > 0 ? new Date(Number(offer.maturity) * 1000) : null;
  // Le défaut n'est possible qu'après maturity + 24h de grâce
  const isDefaultable = maturityDate && Date.now() > maturityDate.getTime() + GRACE_MS && statusLabel === 'Active';
  const isInGrace = maturityDate && Date.now() > maturityDate.getTime() && !isDefaultable && statusLabel === 'Active';
  const isLender = evmAccount && evmAccount === lenderAddr;
  const isBorrower = evmAccount && evmAccount === borrowerAddr;

  const haircut = Number(offer.haircut);
  const cashAmt = Number(offer.cashAmount);
  const collateralReq = haircut < 10000
    ? Math.ceil(cashAmt * 10000 / ((10000 - haircut) * 1e6))
    : 0;

  // Estimation remboursement
  const repayEstimate = statusLabel === 'Active'
    ? estimateRepay(offer.cashAmount, offer.repoRateBps, offer.durationSeconds)
    : null;

  const execTx = async (action) => {
    if (!accountId) return alert("Connectez votre wallet.");
    setLoading(action); setTxStatus('');
    try {
      let txHash;

      if (action === 'accept') {
        // bondMaturityTimestamp lu depuis BondMetadata on-chain — aucun param à saisir
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

      } else if (action === 'default') {
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
        // Notarisation HCS (non bloquante)
        const eventMap = {
          accept:  'repo_offer_accepted',
          repay:   'repo_repaid',
          default: 'repo_default_claimed',
          cancel:  'repo_offer_cancelled',
        };
        notifyHCS(eventMap[action] || action, evmAccount, {
          public: { offerId: Number(offerId), label: `Offre #${offerId} — ${eventMap[action] || action}` },
        });
        setTimeout(onRefresh, 2500);
      }
    } catch (err) {
      console.error(err); setTxStatus('error');
    }
    setLoading('');
  };

  return (
    <Paper elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 3, p: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Stack spacing={0.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography fontWeight={700} color="#03045e">Offre #{offerId}</Typography>
              <Chip label={chip.label} size="small"
                sx={{ backgroundColor: chip.bg, color: chip.color, fontWeight: 600 }} />
            </Stack>
            <Typography variant="body2" color="#666">
              Prêteur : <b>{offer.lender?.slice(0, 10)}…</b>
              {borrowerAddr && borrowerAddr !== '0x0000000000000000000000000000000000000000' && (
                <> · Emprunteur : <b>{offer.borrower?.slice(0, 10)}…</b></>
              )}
            </Typography>
          </Stack>
          <Stack alignItems="flex-end">
            <Typography variant="h6" fontWeight={700} color="#03045e">{formatMGA(offer.cashAmount)}</Typography>
            <Typography variant="caption" color="#888">liquidité proposée</Typography>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={3} flexWrap="wrap">
          <Box>
            <Typography variant="caption" color="#888">Haircut</Typography>
            <Typography variant="body2" fontWeight={600}>{(haircut / 100).toFixed(0)} %</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="#888">Taux repo</Typography>
            <Typography variant="body2" fontWeight={600}>{(Number(offer.repoRateBps) / 100).toFixed(2)} %/an</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="#888">Durée</Typography>
            <Typography variant="body2" fontWeight={600}>{(Number(offer.durationSeconds) / 86400).toFixed(0)} jours</Typography>
          </Box>
          {statusLabel === 'Open' && (
            <Box>
              <Typography variant="caption" color="#888">Collatéral ARGN requis</Typography>
              <Typography variant="body2" fontWeight={600}>{collateralReq.toLocaleString()} ARGN</Typography>
            </Box>
          )}
          {statusLabel === 'Active' && (
            <>
              <Box>
                <Typography variant="caption" color="#888">Collatéral bloqué</Typography>
                <Typography variant="body2" fontWeight={600}>{Number(offer.collateralAmount).toLocaleString()} ARGN</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="#888">Échéance</Typography>
                <Typography variant="body2" fontWeight={600}>{maturityDate?.toLocaleDateString('fr-FR')}</Typography>
              </Box>
            </>
          )}
        </Stack>

        {repayEstimate && (
          <Alert severity="info" sx={{ py: 0, fontSize: '0.8rem' }}>
            Remboursement estimé : <b>{formatMGA(repayEstimate)}</b> (capital + intérêts ACT/365)
          </Alert>
        )}
        {isInGrace && (
          <Alert severity="warning" sx={{ py: 0, fontSize: '0.8rem' }}>
            ⏳ Délai de grâce actif — le prêteur peut réclamer le défaut dans moins de 24h. Remboursez dès que possible.
          </Alert>
        )}

        {txStatus === 'success' && <Alert severity="success" sx={{ py: 0 }}>Transaction envoyée ✓</Alert>}
        {txStatus === 'error'   && <Alert severity="error"   sx={{ py: 0 }}>Échec de la transaction</Alert>}

        <Stack direction="row" spacing={1} flexWrap="wrap">
          {statusLabel === 'Open' && !isLender && accountId && (
            <Button variant="contained" size="small" disabled={!!loading}
              onClick={() => execTx('accept')}
              sx={{ backgroundColor: '#03045e', '&:hover': { backgroundColor: '#020338' } }}>
              {loading === 'accept' ? <CircularProgress size={16} color="inherit" /> : 'Accepter (DvP)'}
            </Button>
          )}
          {statusLabel === 'Open' && isLender && (
            <Button variant="outlined" size="small" color="error" disabled={!!loading}
              onClick={() => execTx('cancel')}>
              {loading === 'cancel' ? <CircularProgress size={16} color="inherit" /> : "Annuler l'offre"}
            </Button>
          )}
          {statusLabel === 'Active' && isBorrower && (
            <Button variant="outlined" size="small" disabled={!!loading}
              onClick={() => execTx('repay')}
              sx={{ borderColor: '#03045e', color: '#03045e' }}>
              {loading === 'repay' ? <CircularProgress size={16} color="inherit" /> : 'Rembourser'}
            </Button>
          )}
          {isDefaultable && isLender && (
            <Button variant="outlined" size="small" color="error" disabled={!!loading}
              onClick={() => execTx('default')}>
              {loading === 'default' ? <CircularProgress size={16} color="inherit" /> : 'Réclamer défaut'}
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

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
    if (!accountId) return alert("Connectez votre wallet d'abord.");
    setLoading(true); setStatus('');
    try {
      const cashAmount   = ethers.utils.parseUnits(form.cashMGA, 6).toString();
      const repoRateBps  = Math.round(Number(form.repoRate) * 100);
      const haircutBps   = Math.round(Number(form.haircut) * 100);
      const durationSecs = Number(form.durationDays) * 86400;

      if (repoRateBps <= 0) { setStatus('rate_zero'); setLoading(false); return; }

      // Vérification balance wMGA
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
          public: { cashMGA: Number(form.cashMGA), repoRate: Number(form.repoRate), haircut: Number(form.haircut), durationDays: Number(form.durationDays), label: 'Offre de liquidité créée' },
        });
        // Récupère le nouvel offerId (= offerCount - 1) et persiste en DB
        // Attend 4s pour que Hedera confirme avant de lire offerCount
        try {
          await new Promise(r => setTimeout(r, 4000));
          const provider = getProvider();
          const contract = new ethers.Contract(CONTRACT_ADDRESSES.RepoEscrow, REPO_ESCROW_ABI, provider);
          const count = Number(await contract.offerCount());
          const offerId = count - 1;
          await saveRepoOffer({
            offerId,
            lender: evmAddr,
            cashAmount: Number(cashAmount),
            repoRateBps: repoRateBps,
            haircutBps: haircutBps,
            durationSec: durationSecs,
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
    <Paper elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 3, p: 3, maxWidth: 520 }}>
      <Typography variant="h6" fontWeight={700} color="#03045e" mb={2}>Proposer de la liquidité</Typography>
      {!hasContracts && <Alert severity="warning" sx={{ mb: 2 }}>Contrats non déployés.</Alert>}
      {status === 'success'           && <Alert severity="success" sx={{ mb: 2 }}>Offre publiée — wMGA bloqués en escrow.</Alert>}
      {status === 'error'             && <Alert severity="error"   sx={{ mb: 2 }}>Échec — vérifiez votre balance wMGA.</Alert>}
      {status === 'insufficient_cash' && <Alert severity="error"  sx={{ mb: 2 }}>Balance wMGA insuffisante pour cette offre.</Alert>}
      {status === 'rate_zero'         && <Alert severity="error"   sx={{ mb: 2 }}>Le taux repo doit être supérieur à 0 %.</Alert>}

      <form onSubmit={handleCreate}>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={2}>
            <TextField name="cashMGA" label="Montant à prêter (MGA)" type="number"
              value={form.cashMGA} onChange={handleChange} fullWidth required disabled={!hasContracts}
              InputProps={{ inputProps: { min: 1, step: '0.01' } }}
              helperText="Sera converti en wMGA (× 1e6)" />
            <TextField name="haircut" label="Haircut (%)" type="number"
              value={form.haircut} onChange={handleChange} fullWidth disabled={!hasContracts}
              InputProps={{ inputProps: { min: 0, max: 99, step: '0.5' } }}
              helperText={`Collatéral requis : ${collateralPreview.toLocaleString()} ARGN`} />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField name="repoRate" label="Taux repo (% /an)" type="number"
              value={form.repoRate} onChange={handleChange} fullWidth disabled={!hasContracts}
              InputProps={{ inputProps: { min: 0.01, step: '0.1' } }} />
            <TextField name="durationDays" label="Durée (jours)" type="number"
              value={form.durationDays} onChange={handleChange} fullWidth disabled={!hasContracts}
              InputProps={{ inputProps: { min: 1 } }} />
          </Stack>
          <Button type="submit" variant="contained" disabled={loading || !hasContracts || !accountId}
            sx={{ backgroundColor: '#03045e', '&:hover': { backgroundColor: '#020338' } }}>
            {loading ? <CircularProgress size={20} color="inherit" /> : "Publier l'offre (bloquer wMGA)"}
          </Button>
          {!accountId && <Alert severity="info" sx={{ py: 0 }}>Connectez votre wallet pour proposer.</Alert>}
        </Stack>
      </form>
    </Paper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODE B — BORROW REQUEST
// ═══════════════════════════════════════════════════════════════════════════

// Dialog — prêteur soumet une proposition
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
      setErr(`Taux trop élevé — maximum accepté : ${maxRatePct} %`); return;
    }
    const cashAmount = Math.round(Number(form.cashMGA) * 1e6);
    if (cashAmount < Number(request?.desiredCash)) {
      setErr(`Montant insuffisant — minimum demandé : ${desiredMGA} wMGA`); return;
    }
    setLoading(true);
    try {
      await submitProposal(
        requestId,
        lenderAddress,
        cashAmount,
        rateBps,
        Number(request.durationSeconds)
      );
      onSubmitted();
      onClose();
      setForm({ cashMGA: '', ratePct: '' });
    } catch (e2) {
      setErr(e2.message || 'Erreur');
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, color: '#03045e' }}>Faire une proposition</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2}>
            {request && (
              <Alert severity="info" sx={{ py: 0 }}>
                Demande #{requestId} — {request.collateralLocked?.toLocaleString()} ARGN en collatéral<br />
                Souhaite ≥ {desiredMGA} wMGA · Taux max {maxRatePct} % · {(Number(request.durationSeconds)/86400).toFixed(0)} j
              </Alert>
            )}
            {err && <Alert severity="error" sx={{ py: 0 }}>{err}</Alert>}
            <TextField label="Montant wMGA à prêter (MGA)" type="number" value={form.cashMGA}
              onChange={e => setForm(f => ({ ...f, cashMGA: e.target.value }))}
              required fullWidth InputProps={{ inputProps: { min: 0, step: '0.01' } }}
              helperText={`Minimum : ${desiredMGA} MGA`} />
            <TextField label="Taux repo (% /an)" type="number" value={form.ratePct}
              onChange={e => setForm(f => ({ ...f, ratePct: e.target.value }))}
              required fullWidth InputProps={{ inputProps: { min: 0, step: '0.01' } }}
              helperText={`Maximum accepté : ${maxRatePct} %`} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={loading}>Annuler</Button>
          <Button type="submit" variant="contained" disabled={loading}
            sx={{ backgroundColor: '#03045e' }}>
            {loading ? <CircularProgress size={18} color="inherit" /> : 'Soumettre la proposition'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

// Panel — emprunteur voit les propositions reçues + prêteur confirme son financement
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
      await acceptProposal(proposal.id);
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

  // Prêteur confirme le financement après que sa proposition a été acceptée
  const handleFund = async (proposal) => {
    if (!proposal || !walletInterface) return;
    setFundStatus('loading');
    try {
      const actualCash    = proposal.cash_amount;
      const actualRateBps = proposal.rate_bps;

      // 1. Approve wMGA → RepoEscrow (MockCash = ERC-20 classique, pas HTS)
      const approveParams = new ContractFunctionParameterBuilder()
        .addParam({ type: 'address', name: 'spender', value: CONTRACT_ADDRESSES.RepoEscrow })
        .addParam({ type: 'uint256', name: 'amount',  value: Math.round(actualCash) });
      await walletInterface.executeContractFunction(
        CONTRACT_ADDRESSES.MockCash, 'approve', approveParams, 80_000
      );
      // 2. fundRequest
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
          public: { requestId: Number(requestId), actualCash: actualCash, actualRateBps, label: 'Demande de liquidité financée' },
        });
        setTimeout(() => { onFunded(); setFundStatus(''); }, 2000);
      }
    } catch (err) {
      console.error(err); setFundStatus('error');
    }
  };

  const pending  = proposals.filter(p => p.status === 'pending');
  const accepted = proposals.find(p => p.status === 'accepted');
  // Est-ce le prêteur dont la proposition a été acceptée ?
  const isMyAcceptedProposal = accepted && currentEvmAddr &&
    accepted.lender_address?.toLowerCase() === currentEvmAddr.toLowerCase();

  if (loading) return <CircularProgress size={20} />;

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2" color="#666" fontWeight={600}>
        Propositions reçues ({proposals.length})
      </Typography>

      {/* Emprunteur — proposition acceptée, en attente du prêteur */}
      {accepted && !isMyAcceptedProposal && (
        <Alert severity="success" sx={{ py: 0 }}>
          Proposition acceptée : {(accepted.cash_amount / 1e6).toFixed(2)} wMGA à {(accepted.rate_bps / 100).toFixed(2)} %/an<br />
          <b>En attente du prêteur ({accepted.lender_address?.slice(0, 10)}…) pour confirmer le financement.</b>
        </Alert>
      )}

      {/* Prêteur — sa proposition a été acceptée, il doit confirmer le financement */}
      {isMyAcceptedProposal && (
        <Paper elevation={0} sx={{ border: '1.5px solid #4caf50', borderRadius: 2, p: 2 }}>
          <Stack spacing={1}>
            <Typography fontWeight={600} color="#2e7d32">Votre proposition a été acceptée !</Typography>
            <Typography variant="body2">
              {(accepted.cash_amount / 1e6).toFixed(2)} wMGA · {(accepted.rate_bps / 100).toFixed(2)} %/an
            </Typography>
            {fundStatus === 'success' && <Alert severity="success" sx={{ py: 0 }}>Financement confirmé ✓</Alert>}
            {fundStatus === 'error'   && <Alert severity="error"   sx={{ py: 0 }}>Échec du financement</Alert>}
            <Button variant="contained" size="small" disabled={fundStatus === 'loading' || fundStatus === 'success'}
              onClick={() => handleFund(accepted)}
              sx={{ backgroundColor: '#2e7d32', alignSelf: 'flex-start' }}>
              {fundStatus === 'loading' ? <CircularProgress size={16} color="inherit" /> : 'Confirmer le financement (approve + fundRequest)'}
            </Button>
          </Stack>
        </Paper>
      )}

      {pending.length === 0 && !accepted && (
        <Typography variant="body2" color="#aaa">Aucune proposition en attente.</Typography>
      )}

      {/* Propositions en attente — boutons Accepter/Refuser uniquement pour l'emprunteur */}
      {pending.map(p => {
        const isBorrowerView = currentEvmAddr &&
          borrowerAddress?.toLowerCase() === currentEvmAddr.toLowerCase();
        return (
          <Paper key={p.id} elevation={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 2, p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Stack>
                <Typography variant="body2" fontWeight={600}>
                  {(p.cash_amount / 1e6).toFixed(2)} wMGA · {(p.rate_bps / 100).toFixed(2)} %/an
                </Typography>
                <Typography variant="caption" color="#888">
                  Prêteur : {p.lender_address?.slice(0, 10)}… · {(p.duration_sec / 86400).toFixed(0)} j
                </Typography>
              </Stack>
              {isBorrowerView && (
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="contained" disabled={!!actionId}
                    onClick={() => handleAccept(p)}
                    sx={{ backgroundColor: '#03045e', fontSize: '0.72rem' }}>
                    {actionId === p.id ? <CircularProgress size={14} color="inherit" /> : 'Accepter'}
                  </Button>
                  <Button size="small" variant="outlined" color="error" disabled={!!actionId}
                    onClick={() => handleReject(p.id)}
                    sx={{ fontSize: '0.72rem' }}>
                    Refuser
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        );
      })}

      <Button size="small" variant="text" onClick={load} sx={{ alignSelf: 'flex-start', color: '#666' }}>
        ↻ Rafraîchir les propositions
      </Button>
    </Stack>
  );
}

// Card — Borrow Request
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
  // Défaut possible uniquement après maturity + 24h de grâce
  const isDefaultable = maturityDate && Date.now() > maturityDate.getTime() + GRACE_MS && statusLabel === 'Active';
  const isInGrace = maturityDate && Date.now() > maturityDate.getTime() && !isDefaultable && statusLabel === 'Active';

  // Estimation remboursement (affiché avant la signature)
  const repayEstimate = statusLabel === 'Active'
    ? estimateRepay(req.actualCash, req.actualRateBps, req.durationSeconds)
    : null;

  const execTx = async (action) => {
    if (!accountId) return alert("Connectez votre wallet.");
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
          cancel:  'repo_request_cancelled',
          repay:   'repo_repaid',
          default: 'repo_default_claimed',
        };
        notifyHCS(eventMap[action] || action, evmAccount, {
          public: { requestId: Number(requestId), label: `Demande #${requestId} — ${eventMap[action] || action}` },
        });
        setTimeout(onRefresh, 2500);
      }
    } catch (err) {
      console.error(err); setTxStatus('error');
    }
    setLoading('');
  };

  return (
    <Paper elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 3, p: 3 }}>
      <Stack spacing={2}>
        {/* En-tête */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Stack spacing={0.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography fontWeight={700} color="#03045e">Demande #{requestId}</Typography>
              <Chip label={chip.label} size="small"
                sx={{ backgroundColor: chip.bg, color: chip.color, fontWeight: 600 }} />
            </Stack>
            <Typography variant="body2" color="#666">
              Emprunteur : <b>{req.borrower?.slice(0, 10)}…</b>
              {lenderAddr && lenderAddr !== '0x0000000000000000000000000000000000000000' && (
                <> · Prêteur : <b>{req.lender?.slice(0, 10)}…</b></>
              )}
            </Typography>
          </Stack>
          <Stack alignItems="flex-end">
            <Typography variant="h6" fontWeight={700} color="#03045e">
              {Number(req.collateralLocked).toLocaleString()} ARGN
            </Typography>
            <Typography variant="caption" color="#888">collatéral bloqué</Typography>
          </Stack>
        </Stack>

        {/* Termes */}
        <Stack direction="row" spacing={3} flexWrap="wrap">
          <Box>
            <Typography variant="caption" color="#888">wMGA souhaités</Typography>
            <Typography variant="body2" fontWeight={600}>{formatMGA(req.desiredCash)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="#888">Taux max</Typography>
            <Typography variant="body2" fontWeight={600}>{(Number(req.maxRateBps) / 100).toFixed(2)} %/an</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="#888">Durée</Typography>
            <Typography variant="body2" fontWeight={600}>{(Number(req.durationSeconds) / 86400).toFixed(0)} jours</Typography>
          </Box>
          {statusLabel === 'Active' && (
            <>
              <Box>
                <Typography variant="caption" color="#888">Taux réel</Typography>
                <Typography variant="body2" fontWeight={600}>{(Number(req.actualRateBps) / 100).toFixed(2)} %/an</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="#888">Montant reçu</Typography>
                <Typography variant="body2" fontWeight={600}>{formatMGA(req.actualCash)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="#888">Échéance</Typography>
                <Typography variant="body2" fontWeight={600}>{maturityDate?.toLocaleDateString('fr-FR')}</Typography>
              </Box>
              {repayEstimate && (
                <Box>
                  <Typography variant="caption" color="#888">Remboursement estimé</Typography>
                  <Typography variant="body2" fontWeight={600} color="#e65100">{formatMGA(repayEstimate)}</Typography>
                </Box>
              )}
            </>
          )}
        </Stack>

        {isInGrace && (
          <Alert severity="warning" sx={{ py: 0 }}>
            Période de grâce — le prêteur peut réclamer le défaut dans {
              Math.ceil((maturityDate.getTime() + GRACE_MS - Date.now()) / 3600000)
            }h si non remboursé.
          </Alert>
        )}
        {txStatus === 'success' && <Alert severity="success" sx={{ py: 0 }}>Transaction envoyée ✓</Alert>}
        {txStatus === 'error'   && <Alert severity="error"   sx={{ py: 0 }}>Échec de la transaction</Alert>}

        {/* Actions */}
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {statusLabel === 'Open' && !isBorrower && accountId && (
            <Button variant="contained" size="small" disabled={!!loading}
              onClick={() => setShowProposalDialog(true)}
              sx={{ backgroundColor: '#1565c0', '&:hover': { backgroundColor: '#0d47a1' } }}>
              Faire une proposition
            </Button>
          )}
          {statusLabel === 'Open' && isBorrower && (
            <Button variant="outlined" size="small" color="error" disabled={!!loading}
              onClick={() => execTx('cancel')}>
              {loading === 'cancel' ? <CircularProgress size={16} color="inherit" /> : 'Annuler la demande'}
            </Button>
          )}
          {statusLabel === 'Active' && isBorrower && (
            <Button variant="outlined" size="small" disabled={!!loading}
              onClick={() => execTx('repay')}
              sx={{ borderColor: '#03045e', color: '#03045e' }}>
              {loading === 'repay' ? <CircularProgress size={16} color="inherit" /> : 'Rembourser'}
            </Button>
          )}
          {isDefaultable && isLender && (
            <Button variant="outlined" size="small" color="error" disabled={!!loading}
              onClick={() => execTx('default')}>
              {loading === 'default' ? <CircularProgress size={16} color="inherit" /> : 'Réclamer défaut'}
            </Button>
          )}
        </Stack>

        {/* Propositions — visible si demande ouverte + (c'est l'emprunteur OU prêteur avec proposition acceptée) */}
        {statusLabel === 'Open' && (isBorrower || isLender) && (
          <>
            <Divider />
            <ProposalsPanel
              requestId={requestId}
              borrowerAddress={borrowerAddr}
              accountId={accountId}
              walletInterface={walletInterface}
              request={req}
              onFunded={() => { onRefresh(); }}
              key={proposalRefresh}
            />
          </>
        )}
      </Stack>

      <ProposalDialog
        open={showProposalDialog}
        onClose={() => setShowProposalDialog(false)}
        request={req}
        requestId={requestId}
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
    if (!accountId) return alert("Connectez votre wallet d'abord.");
    setLoading(true); setStatus('');
    try {
      const collateralAmount = Math.round(Number(form.collateral));
      const desiredCash      = ethers.utils.parseUnits(form.desiredMGA, 6).toString();
      const maxRateBps       = Math.round(Number(form.maxRate) * 100);
      const durationSecs     = Number(form.durationDays) * 86400;

      if (maxRateBps <= 0) { setStatus('rate_zero'); setLoading(false); return; }

      // Vérification balance ARGN
      const evmAddr = toEvmAddress(accountId);
      if (evmAddr) {
        const bondTokenContract = new ethers.Contract(CONTRACT_ADDRESSES.BondToken, BOND_TOKEN_ABI, getProvider());
        const bal = await bondTokenContract.balanceOf(evmAddr);
        if (bal.lt(ethers.BigNumber.from(collateralAmount))) {
          setStatus('insufficient_argn'); setLoading(false); return;
        }
      }

      // 1. Approve ARGN → RepoEscrow
      const approveTx = await approveARGN(walletInterface, evmAddr, CONTRACT_ADDRESSES.RepoEscrow, collateralAmount);
      if (!approveTx) { setStatus('error'); setLoading(false); return; }

      // 2. Créer la demande — bondMaturityTimestamp lu depuis BondMetadata on-chain (plus de param)
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
          public: { collateral: collateralAmount, desiredMGA: form.desiredMGA, maxRate: form.maxRate, durationDays: form.durationDays, label: 'Demande de liquidité créée' },
        });
        try {
          await new Promise(r => setTimeout(r, 4000));
          const provider = getProvider();
          const contract = new ethers.Contract(CONTRACT_ADDRESSES.RepoEscrow, REPO_ESCROW_ABI, provider);
          const count = Number(await contract.requestCount());
          const requestId = count - 1;
          await saveRepoRequest({
            requestId,
            borrower: evmAddr,
            collateralAmount,
            desiredCash: Number(desiredCash),
            maxRateBps,
            durationSec: durationSecs,
            bondMaturityDate: '',
            contractAddr: CONTRACT_ADDRESSES.RepoEscrow,
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
    <Paper elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 3, p: 3, maxWidth: 520 }}>
      <Typography variant="h6" fontWeight={700} color="#03045e" mb={0.5}>Créer une demande de liquidité</Typography>
      <Typography variant="body2" color="#888" mb={2}>
        Bloquez votre ARGN en collatéral. Les prêteurs vous feront des propositions.
      </Typography>
      {!hasContracts && <Alert severity="warning" sx={{ mb: 2 }}>Contrats non déployés.</Alert>}
      {status === 'success'           && <Alert severity="success" sx={{ mb: 2 }}>Demande publiée — ARGN bloqués en escrow.</Alert>}
      {status === 'error'             && <Alert severity="error"   sx={{ mb: 2 }}>Échec — vérifiez votre balance ARGN.</Alert>}
      {status === 'insufficient_argn' && <Alert severity="error"   sx={{ mb: 2 }}>Balance ARGN insuffisante pour ce collatéral.</Alert>}
      {status === 'rate_zero'         && <Alert severity="error"   sx={{ mb: 2 }}>Le taux max doit être supérieur à 0 %.</Alert>}
      <form onSubmit={handleCreate}>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={2}>
            <TextField name="collateral" label="Collatéral ARGN à bloquer" type="number"
              value={form.collateral} onChange={handleChange} fullWidth required disabled={!hasContracts}
              InputProps={{ inputProps: { min: 1, step: 1 } }} />
            <TextField name="desiredMGA" label="Liquidité souhaitée (MGA)" type="number"
              value={form.desiredMGA} onChange={handleChange} fullWidth required disabled={!hasContracts}
              InputProps={{ inputProps: { min: 1, step: '0.01' } }}
              helperText="Sera converti en wMGA (× 1e6)" />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField name="maxRate" label="Taux max accepté (% /an)" type="number"
              value={form.maxRate} onChange={handleChange} fullWidth disabled={!hasContracts}
              InputProps={{ inputProps: { min: 0.01, step: '0.1' } }} />
            <TextField name="durationDays" label="Durée (jours)" type="number"
              value={form.durationDays} onChange={handleChange} fullWidth disabled={!hasContracts}
              InputProps={{ inputProps: { min: 1 } }} />
          </Stack>
          <Button type="submit" variant="contained" disabled={loading || !hasContracts || !accountId}
            sx={{ backgroundColor: '#1565c0', '&:hover': { backgroundColor: '#0d47a1' } }}>
            {loading ? <CircularProgress size={20} color="inherit" /> : 'Publier la demande (bloquer ARGN)'}
          </Button>
          {!accountId && <Alert severity="info" sx={{ py: 0 }}>Connectez votre wallet pour créer une demande.</Alert>}
        </Stack>
      </form>
    </Paper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FAUCET wMGA
// ═══════════════════════════════════════════════════════════════════════════

function FaucetSection({ accountId, walletInterface }) {
  const [amount, setAmount]     = useState('10000');
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState('');
  const [balance, setBalance]   = useState(null);
  const [txHash, setTxHash]     = useState('');
  const evmAddr = toEvmAddress(accountId);

  const loadBalance = useCallback(async () => {
    if (!evmAddr || !CONTRACT_ADDRESSES.MockCash) return;
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.MockCash, MOCK_CASH_ABI, getProvider());
      const bal = await contract.balanceOf(evmAddr);
      setBalance((Number(bal) / 1e6).toLocaleString('fr-FR', { minimumFractionDigits: 2 }));
    } catch {}
  }, [evmAddr]);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  const handleMint = async () => {
    if (!accountId) return alert("Connectez votre wallet.");
    if (!amount || Number(amount) <= 0) return;
    setLoading(true); setStatus(''); setTxHash('');
    try {
      const units = ethers.utils.parseUnits(amount, 6).toString();
      const params = new ContractFunctionParameterBuilder()
        .addParam({ type: 'address', name: 'to',     value: evmAddr })
        .addParam({ type: 'uint256', name: 'amount', value: units });
      const hash = await walletInterface.executeContractFunction(
        CONTRACT_ADDRESSES.MockCash, 'mint', params, 80_000
      );
      if (hash) {
        setTxHash(hash);
        setStatus('success');
        // Hedera testnet peut prendre 5-10s pour confirmer
        setTimeout(loadBalance, 5000);
        setTimeout(loadBalance, 10000);
      } else {
        setStatus('error');
      }
    } catch (err) {
      console.error(err); setStatus('error');
    }
    setLoading(false);
  };

  return (
    <Paper elevation={0} sx={{ border: '1.5px solid #e3f2fd', borderRadius: 3, p: 2.5, bgcolor: '#f8fbff' }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={1}>
        <Typography variant="subtitle1" fontWeight={700} color="#1565c0">Faucet wMGA</Typography>
        {balance !== null && (
          <Chip label={`Solde : ${balance} wMGA`} size="small" sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontWeight: 600 }} />
        )}
        <Button size="small" variant="text" onClick={loadBalance} sx={{ color: '#888', minWidth: 0, p: 0.5, fontSize: '1rem' }} title="Rafraîchir le solde">↻</Button>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small" type="number" label="Montant (MGA)" value={amount}
          onChange={e => setAmount(e.target.value)}
          sx={{ width: 180 }}
          inputProps={{ min: 1, step: 1000 }}
        />
        <Button variant="contained" size="small" disabled={loading || !accountId}
          onClick={handleMint}
          sx={{ backgroundColor: '#1565c0', '&:hover': { backgroundColor: '#0d47a1' }, whiteSpace: 'nowrap' }}>
          {loading ? <CircularProgress size={16} color="inherit" /> : '💧 Obtenir wMGA'}
        </Button>
        {txHash && (
          <Button size="small" variant="text" href={`${process.env.REACT_APP_HASHSCAN_URL || 'https://hashscan.io/testnet/transaction/'}${txHash}`} target="_blank" sx={{ fontSize: '0.72rem' }}>
            HashScan ↗
          </Button>
        )}
      </Stack>
      {status === 'success' && <Alert severity="success" sx={{ mt: 1, py: 0 }}>+{Number(amount).toLocaleString('fr-FR')} wMGA mintés ✓</Alert>}
      {status === 'error'   && <Alert severity="error"   sx={{ mt: 1, py: 0 }}>Échec du mint wMGA</Alert>}
    </Paper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE MARKET
// ═══════════════════════════════════════════════════════════════════════════

export default function Market() {
  const { accountId, walletInterface } = useWalletInterface();
  const [tab, setTab] = useState(0);
  const [offers, setOffers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [filterOffers, setFilterOffers] = useState('all');
  const [filterReqs, setFilterReqs] = useState('all');
  const hasContracts = !!CONTRACT_ADDRESSES.RepoEscrow;

  const loadOffers = useCallback(async () => {
    setLoadingOffers(true);
    try {
      // 1. Récupère la liste persistée en DB (historique complet)
      const dbOffers = await fetchRepoOffers();
      // 2. Si le contrat courant est déployé, enrichit avec statut on-chain
      if (hasContracts && dbOffers.length > 0) {
        const provider = getProvider();
        const contract = new ethers.Contract(CONTRACT_ADDRESSES.RepoEscrow, REPO_ESCROW_ABI, provider);
        const enriched = await Promise.all(dbOffers.map(async (row) => {
          try {
            const onChain = await contract.offers(row.id);
            // Si le contrat a changé (redeployé), l'adresse ne correspond plus → statut "Archive"
            if (row.contract_addr && row.contract_addr.toLowerCase() !== CONTRACT_ADDRESSES.RepoEscrow.toLowerCase()) {
              return { ...row, _id: row.id, status: 99, _archived: true };
            }
            return { ...onChain, _id: row.id };
          } catch {
            return { ...row, _id: row.id, status: 99, _archived: true };
          }
        }));
        setOffers(enriched);
      } else if (hasContracts) {
        // DB vide : lit directement la chaîne
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

  useEffect(() => { loadOffers(); loadRequests(); }, [loadOffers, loadRequests]);

  const filteredOffers = offers.filter(o => {
    const s = REPO_STATUS[Number(o.status)];
    if (filterOffers === 'open')   return s === 'Open';
    if (filterOffers === 'active') return s === 'Active';
    return true;
  });

  const filteredReqs = requests.filter(r => {
    const s = REPO_STATUS[Number(r.status)];
    if (filterReqs === 'open')   return s === 'Open';
    if (filterReqs === 'active') return s === 'Active';
    return true;
  });

  const openOfferCount   = offers.filter(o => REPO_STATUS[Number(o.status)] === 'Open').length;
  const openRequestCount = requests.filter(r => REPO_STATUS[Number(r.status)] === 'Open').length;

  return (
    <Stack spacing={4}>
      {/* Titre */}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="h5" fontWeight={700} color="#03045e">Marché Repo</Typography>
          <Typography variant="body2" color="#888">
            Deux côtés : prêteurs publient de la liquidité · emprunteurs publient leurs besoins + attendent des propositions
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => { loadOffers(); loadRequests(); }}
          disabled={loadingOffers || loadingRequests}
          sx={{ borderColor: '#03045e', color: '#03045e' }}>
          {loadingOffers || loadingRequests ? <CircularProgress size={18} /> : 'Rafraîchir'}
        </Button>
      </Stack>

      {!hasContracts && (
        <Alert severity="warning">Contrats non déployés. Configurez <code>.env</code>.</Alert>
      )}

      {/* Onglets */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: '1px solid #e0e0e0', '& .MuiTab-root': { fontWeight: 600 } }}>
        <Tab label={
          <Badge badgeContent={openOfferCount} color="primary" sx={{ '& .MuiBadge-badge': { right: -10 } }}>
            Offres de liquidité
          </Badge>
        } />
        <Tab label={
          <Badge badgeContent={openRequestCount} color="secondary" sx={{ '& .MuiBadge-badge': { right: -10 } }}>
            Demandes d'emprunt
          </Badge>
        } />
      </Tabs>

      {/* ── Onglet 0 : Lending Offers ── */}
      {tab === 0 && (
        <Stack spacing={3}>
          <FaucetSection accountId={accountId} walletInterface={walletInterface} />
          <Divider />
          <CreateLendingOfferSection
            accountId={accountId} walletInterface={walletInterface} onCreated={loadOffers}
          />
          <Divider />
          <Stack direction="row" spacing={1}>
            {[['all', 'Toutes'], ['open', 'Ouvertes'], ['active', 'Actives']].map(([val, label]) => (
              <Button key={val} size="small" variant={filterOffers === val ? 'contained' : 'outlined'}
                onClick={() => setFilterOffers(val)}
                sx={filterOffers === val
                  ? { backgroundColor: '#03045e', color: '#fff' }
                  : { borderColor: '#ccc', color: '#666' }}>
                {label}
              </Button>
            ))}
          </Stack>
          {!accountId && <Alert severity="info">Connectez votre wallet pour accepter des offres.</Alert>}
          {loadingOffers && <CircularProgress sx={{ alignSelf: 'center' }} />}
          {!loadingOffers && filteredOffers.length === 0 && hasContracts && (
            <Alert severity="info">Aucune offre dans cette catégorie.</Alert>
          )}
          {filteredOffers.map(offer => (
            <RepoCard key={offer._id} offer={offer} offerId={offer._id}
              accountId={accountId} walletInterface={walletInterface} onRefresh={loadOffers} />
          ))}
        </Stack>
      )}

      {/* ── Onglet 1 : Borrow Requests ── */}
      {tab === 1 && (
        <Stack spacing={3}>
          <FaucetSection accountId={accountId} walletInterface={walletInterface} />
          <Divider />
          <CreateBorrowRequestSection
            accountId={accountId} walletInterface={walletInterface} onCreated={loadRequests}
          />
          <Divider />
          <Stack direction="row" spacing={1}>
            {[['all', 'Toutes'], ['open', 'Ouvertes'], ['active', 'Actives']].map(([val, label]) => (
              <Button key={val} size="small" variant={filterReqs === val ? 'contained' : 'outlined'}
                onClick={() => setFilterReqs(val)}
                sx={filterReqs === val
                  ? { backgroundColor: '#1565c0', color: '#fff' }
                  : { borderColor: '#ccc', color: '#666' }}>
                {label}
              </Button>
            ))}
          </Stack>
          {!accountId && <Alert severity="info">Connectez votre wallet pour faire des propositions.</Alert>}
          {loadingRequests && <CircularProgress sx={{ alignSelf: 'center' }} />}
          {!loadingRequests && filteredReqs.length === 0 && hasContracts && (
            <Alert severity="info">Aucune demande dans cette catégorie.</Alert>
          )}
          {filteredReqs.map(req => (
            <BorrowRequestCard key={req._id} req={req} requestId={req._id}
              accountId={accountId} walletInterface={walletInterface} onRefresh={loadRequests} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
