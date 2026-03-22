import { useState, useCallback, useEffect } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Typography,
} from "@mui/material";
import { AccountId } from "@hashgraph/sdk";
import { ethers } from "ethers";
import { useWalletInterface } from "../services/wallets/useWalletInterface";
import { CONTRACT_ADDRESSES, MOCK_CASH_ABI } from "../services/contracts";
import { ContractFunctionParameterBuilder } from "../services/wallets/contractFunctionParameterBuilder";

function toEvmAddress(accountId) {
  if (!accountId) return null;
  if (accountId.startsWith('0x')) return accountId.toLowerCase();
  try { return ('0x' + AccountId.fromString(accountId).toSolidityAddress()).toLowerCase(); }
  catch { return accountId.toLowerCase(); }
}

function getProvider() {
  return new ethers.providers.JsonRpcProvider(
    process.env.REACT_APP_RPC_URL || 'https://testnet.hashio.io/api'
  );
}

function FaucetSection({ accountId, walletInterface }) {
  const [amount, setAmount]   = useState('10000');
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState('');
  const [balance, setBalance] = useState(null);
  const [txHash, setTxHash]   = useState('');
  const evmAddr = toEvmAddress(accountId);

  const loadBalance = useCallback(async () => {
    if (!evmAddr || !CONTRACT_ADDRESSES.MockCash) return;
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.MockCash, MOCK_CASH_ABI, getProvider());
      const bal = await contract.balanceOf(evmAddr);
      setBalance((Number(bal) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2 }));
    } catch {}
  }, [evmAddr]);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  const handleMint = async () => {
    if (!accountId) return alert("Connect your wallet first.");
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
    <Paper elevation={0} sx={{ border: '1.5px solid #e3f2fd', borderRadius: 3, p: 3, bgcolor: '#f8fbff', maxWidth: 520 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" fontWeight={700} color="#1565c0">💧 wMGA Faucet</Typography>
          {balance !== null && (
            <Chip label={`Balance: ${balance} wMGA`} size="small" sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontWeight: 600 }} />
          )}
          <Button size="small" variant="text" onClick={loadBalance}
            sx={{ color: '#888', minWidth: 0, p: 0.5, fontSize: '1rem' }} title="Refresh balance">↻</Button>
        </Stack>
        <Typography variant="body2" color="#666">
          Mint test wMGA tokens to your wallet on Hedera Testnet. Used as cash in repo transactions.
        </Typography>
        {!accountId && <Alert severity="info" sx={{ py: 0 }}>Connect your wallet to use the faucet.</Alert>}
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small" type="number" label="Amount (MGA)" value={amount}
            onChange={e => setAmount(e.target.value)}
            sx={{ width: 200 }}
            inputProps={{ min: 1, step: 1000 }}
          />
          <Button variant="contained" size="small" disabled={loading || !accountId}
            onClick={handleMint}
            sx={{ backgroundColor: '#1565c0', '&:hover': { backgroundColor: '#0d47a1' }, whiteSpace: 'nowrap' }}>
            {loading ? <CircularProgress size={16} color="inherit" /> : 'Get wMGA'}
          </Button>
          {txHash && (
            <Button size="small" variant="text"
              href={`${process.env.REACT_APP_HASHSCAN_URL || 'https://hashscan.io/testnet/transaction/'}${txHash}`}
              target="_blank" sx={{ fontSize: '0.72rem' }}>
              HashScan ↗
            </Button>
          )}
        </Stack>
        {status === 'success' && <Alert severity="success" sx={{ py: 0 }}>+{Number(amount).toLocaleString('en-US')} wMGA minted ✓</Alert>}
        {status === 'error'   && <Alert severity="error"   sx={{ py: 0 }}>Mint failed</Alert>}
      </Stack>
    </Paper>
  );
}

const SECTIONS = [
  {
    title: 'Overview',
    content: `Argonath is a T-Bill tokenization and on-chain repo platform built on Hedera. A central depositary registers T-Bill rights for investors. Investors redeem them as ARGN tokens on-chain, then use them as collateral in repo agreements to access liquidity (wMGA).`,
  },
  {
    title: 'How it works',
    steps: [
      { n: '1', label: 'Depositary registers T-Bill rights', desc: "The operator creates allocations linked to investors' phone numbers." },
      { n: '2', label: 'Investor verifies identity via OTP', desc: 'The investor enters their WhatsApp number, receives a code, and links their wallet.' },
      { n: '3', label: 'Redeem on-chain', desc: 'The investor calls ClaimRegistry.redeem() — the backend mints 1 ARGN via HTS.' },
      { n: '4', label: 'Post collateral in repo', desc: 'The investor locks ARGN in RepoEscrow and receives wMGA liquidity.' },
      { n: '5', label: 'Repay and recover collateral', desc: 'At maturity, the borrower repays cash + interest and retrieves their ARGN.' },
    ],
  },
  {
    title: 'Contracts (Hedera Testnet)',
    contracts: [
      { name: 'ClaimRegistry',  env: 'REACT_APP_CLAIM_REGISTRY_ADDRESS' },
      { name: 'BondToken (ARGN HTS)', env: 'REACT_APP_BOND_TOKEN_ADDRESS' },
      { name: 'RepoEscrow',     env: 'REACT_APP_REPO_ESCROW_ADDRESS' },
      { name: 'BondMetadata',   env: 'REACT_APP_BOND_METADATA_ADDRESS' },
      { name: 'MockCash (wMGA)', env: 'REACT_APP_MOCK_CASH_ADDRESS' },
    ],
  },
];

export default function Docs() {
  const { accountId, walletInterface } = useWalletInterface();

  return (
    <Stack spacing={5} maxWidth={760} mx="auto">
      <Box>
        <Typography variant="h5" fontWeight={700} color="#03045e">Documentation</Typography>
        <Typography variant="body2" color="#888">Technical reference and testnet tools for Argonath.</Typography>
      </Box>

      {/* Overview */}
      <Stack spacing={1}>
        <Typography variant="h6" fontWeight={700} color="#03045e">{SECTIONS[0].title}</Typography>
        <Typography variant="body2" color="#555">{SECTIONS[0].content}</Typography>
      </Stack>

      <Divider />

      {/* How it works */}
      <Stack spacing={2}>
        <Typography variant="h6" fontWeight={700} color="#03045e">{SECTIONS[1].title}</Typography>
        {SECTIONS[1].steps.map(s => (
          <Stack key={s.n} direction="row" spacing={2} alignItems="flex-start">
            <Box sx={{ minWidth: 28, height: 28, borderRadius: '50%', bgcolor: '#03045e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="caption" color="#fff" fontWeight={700}>{s.n}</Typography>
            </Box>
            <Stack>
              <Typography variant="body2" fontWeight={600}>{s.label}</Typography>
              <Typography variant="body2" color="#666">{s.desc}</Typography>
            </Stack>
          </Stack>
        ))}
      </Stack>

      <Divider />

      {/* Contracts */}
      <Stack spacing={2}>
        <Typography variant="h6" fontWeight={700} color="#03045e">{SECTIONS[2].title}</Typography>
        {SECTIONS[2].contracts.map(c => (
          <Stack key={c.name} direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" fontWeight={600}>{c.name}</Typography>
            <Typography variant="body2" color="#888" fontFamily="monospace" sx={{ fontSize: '0.78rem' }}>
              {process.env[c.env] || <em style={{ color: '#ccc' }}>not configured</em>}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Divider />

      {/* Faucet */}
      <Stack spacing={2}>
        <Typography variant="h6" fontWeight={700} color="#03045e">Testnet Faucet</Typography>
        <FaucetSection accountId={accountId} walletInterface={walletInterface} />
      </Stack>
    </Stack>
  );
}
