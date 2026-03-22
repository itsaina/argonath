import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  Divider, FormControl, IconButton, InputAdornment, InputLabel, MenuItem, Paper, Select, Stack, Tab, Tabs,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import {
  authDepositary, createClaim, fetchAllClaims, updateClaimStatus,
  fetchHCSMessagesDepositary,
} from "../services/api";

const STATUS_COLORS = {
  available:  { bg: '#e8f5e9', color: '#2e7d32' },
  published:  { bg: '#e3f2fd', color: '#1565c0' },
  redeemed:   { bg: '#ede7f6', color: '#512da8' },
  in_repo:    { bg: '#fff3e0', color: '#e65100' },
  repo_active:{ bg: '#fce4ec', color: '#880e4f' },
  repaid:     { bg: '#e0f2f1', color: '#00695c' },
  defaulted:  { bg: '#ffebee', color: '#b71c1c' },
  expired:    { bg: '#f5f5f5', color: '#616161' },
  cancelled:  { bg: '#f5f5f5', color: '#9e9e9e' },
};

const STATUS_LABELS = {
  available: 'Available', published: 'Published', redeemed: 'Redeemed',
  in_repo: 'In Repo', repo_active: 'Repo Active', repaid: 'Repaid',
  defaulted: 'Defaulted', expired: 'Expired', cancelled: 'Cancelled',
};

const BOND_TYPES = ["T-Bill", "Government Bond", "Commercial Paper", "Certificate of Deposit"];

const EMPTY_FORM = {
  first_name: '', last_name: '', phone: '', bond_type: BOND_TYPES[0],
  nominal_amount: '', rate: '', maturity_date: '', batch_id: '',
};

const HCS_EVENT_CHIP = {
  wallet_phone_linked:          { label: 'Wallet linked',       bg: '#e3f2fd', color: '#1565c0' },
  allocation_created:           { label: 'Allocation created',  bg: '#e8f5e9', color: '#2e7d32' },
  allocation_status_changed:    { label: 'Status updated',      bg: '#fff8e1', color: '#f57f17' },
  allocation_redeemed:          { label: 'Redeemed',            bg: '#ede7f6', color: '#512da8' },
  repo_lending_offer_created:   { label: 'Lending offer',       bg: '#e8f5e9', color: '#2e7d32' },
  repo_borrow_request_created:  { label: 'Borrow request',      bg: '#fff3e0', color: '#e65100' },
  repo_offer_accepted:          { label: 'Offer accepted',       bg: '#e0f2f1', color: '#00695c' },
  repo_proposal_submitted:      { label: 'Proposal submitted',  bg: '#fff8e1', color: '#f57f17' },
  repo_proposal_accepted:       { label: 'Proposal accepted',   bg: '#e8f5e9', color: '#1b5e20' },
  repo_request_funded:          { label: 'Request funded',      bg: '#f3e5f5', color: '#6a1b9a' },
  repo_repaid:                  { label: 'Repaid',              bg: '#e0f7fa', color: '#006064' },
  repo_default_claimed:         { label: 'Default claimed',     bg: '#ffebee', color: '#b71c1c' },
  repo_offer_cancelled:         { label: 'Offer cancelled',     bg: '#f5f5f5', color: '#616161' },
  repo_request_cancelled:       { label: 'Request cancelled',   bg: '#f5f5f5', color: '#616161' },
};

function StatusChip({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.expired;
  return <Chip label={STATUS_LABELS[status] || status} size="small" sx={{ backgroundColor: s.bg, color: s.color, fontWeight: 600 }} />;
}

function HcsEventChip({ event }) {
  const e = HCS_EVENT_CHIP[event] || { label: event, bg: '#f5f5f5', color: '#555' };
  return <Chip label={e.label} size="small" sx={{ backgroundColor: e.bg, color: e.color, fontWeight: 600, fontSize: '0.7rem' }} />;
}

// ─── Password Gate ─────────────────────────────────────────────────────────────
function PasswordGate({ onAuth }) {
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await authDepositary(pwd);
      localStorage.setItem('depositary_token', res.token);
      onAuth();
    } catch {
      setError('Incorrect password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack alignItems="center" justifyContent="center" minHeight="60vh">
      <Paper elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 3, p: 5, maxWidth: 400, width: '100%' }}>
        <Stack spacing={3}>
          <Typography variant="h5" fontWeight={700} color="#03045e">Depositary Access</Typography>
          <Typography variant="body2" color="#666">Enter the operator password to access the management interface.</Typography>
          <form onSubmit={submit}>
            <Stack spacing={2}>
              <TextField
                type="password" label="Password" value={pwd}
                onChange={e => setPwd(e.target.value)} fullWidth
                error={!!error} helperText={error}
              />
              <Button type="submit" variant="contained" fullWidth disabled={loading}
                sx={{ backgroundColor: '#03045e', '&:hover': { backgroundColor: '#020338' } }}>
                {loading ? <CircularProgress size={20} color="inherit" /> : 'Access'}
              </Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Stack>
  );
}

// ─── HCS Journal ──────────────────────────────────────────────────────────────
function HCSJournal() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const topicId = process.env.REACT_APP_HCS_TOPIC_ID;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await fetchHCSMessagesDepositary({ limit: 100 });
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load HCS journal');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!topicId) {
    return (
      <Alert severity="warning">
        <strong>HCS_TOPIC_ID not configured.</strong><br />
        Run <code>node scripts/create-hcs-topic.js</code> then add <code>REACT_APP_HCS_TOPIC_ID</code> in <code>app/.env</code>.
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="subtitle1" fontWeight={700} color="#03045e">
            HCS Notarial Journal — {messages.length} event(s)
          </Typography>
          <Typography variant="caption" color="#888">
            Topic: {topicId} · Immutable Hedera Consensus Service ledger
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small" onClick={load} disabled={loading}
            sx={{ borderColor: '#03045e', color: '#03045e' }}>
            {loading ? <CircularProgress size={16} /> : 'Refresh'}
          </Button>
          <Button variant="outlined" size="small"
            href={`https://hashscan.io/testnet/topic/${topicId}`} target="_blank"
            sx={{ borderColor: '#888', color: '#666', fontSize: '0.72rem' }}>
            HashScan ↗
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && messages.length === 0 && !error && (
        <Alert severity="info">No events recorded on this topic.</Alert>
      )}

      {loading && <CircularProgress sx={{ alignSelf: 'center' }} />}

      {messages.map((msg, i) => {
        const ts = msg.ts ? new Date(msg.ts).toLocaleString('en-US') : msg.consensus_timestamp || '—';
        const dep = msg.depositary || {};
        const pub = msg.public || {};
        return (
          <Paper key={i} elevation={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 2, p: 2 }}>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <HcsEventChip event={msg.event} />
                  <Typography variant="caption" color="#888" fontFamily="monospace">#{msg.seq}</Typography>
                </Stack>
                <Typography variant="caption" color="#888">{ts}</Typography>
              </Stack>

              <Stack direction="row" spacing={2} flexWrap="wrap">
                {msg.wallet && (
                  <Box>
                    <Typography variant="caption" color="#888" display="block">Wallet</Typography>
                    <Typography variant="body2" fontFamily="monospace" fontSize="0.78rem">{msg.wallet}</Typography>
                  </Box>
                )}
                {msg.phone_proof && (
                  <Box>
                    <Typography variant="caption" color="#888" display="block">Phone proof (keccak256)</Typography>
                    <Typography variant="body2" fontFamily="monospace" fontSize="0.78rem" color="#512da8">
                      {msg.phone_proof.slice(0, 18)}…
                    </Typography>
                  </Box>
                )}
              </Stack>

              {Object.keys(dep).length > 0 && (
                <Box sx={{ bgcolor: '#f8f9ff', borderRadius: 1, p: 1.5 }}>
                  <Typography variant="caption" color="#03045e" fontWeight={700} display="block" mb={0.5}>
                    Depositary details
                  </Typography>
                  <Stack direction="row" spacing={2} flexWrap="wrap">
                    {Object.entries(dep).map(([k, v]) => v && (
                      <Box key={k}>
                        <Typography variant="caption" color="#888" display="block">{k}</Typography>
                        <Typography variant="body2" fontSize="0.8rem">{String(v)}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}

              {Object.keys(pub).length > 0 && (
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  {Object.entries(pub).filter(([k]) => k !== 'label').map(([k, v]) => (
                    <Box key={k}>
                      <Typography variant="caption" color="#888" display="block">{k}</Typography>
                      <Typography variant="body2" fontSize="0.8rem">{String(v)}</Typography>
                    </Box>
                  ))}
                  {pub.label && (
                    <Chip label={pub.label} size="small" sx={{ alignSelf: 'center', bgcolor: '#f5f5f5', color: '#555' }} />
                  )}
                </Stack>
              )}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}

// ─── Proof Verifier ────────────────────────────────────────────────────────────
function ProofVerifier() {
  const [form, setForm] = useState({ phone: '', firstName: '', lastName: '', batchId: '' });
  const [results, setResults] = useState(null);

  const hash = (str) => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(str.trim()));

  const compute = (e) => {
    e.preventDefault();
    const { phone, firstName, lastName, batchId } = form;
    setResults({
      phone_proof:    phone    ? hash(phone)                               : null,
      identity_proof: (phone && firstName && lastName)
                               ? hash(`${firstName}|${lastName}|${phone}`) : null,
      claim_proof:    batchId  ? hash(batchId)                             : null,
    });
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700} color="#03045e">
          Cryptographic Proof Verifier
        </Typography>
        <Typography variant="body2" color="#888" mt={0.5}>
          Recompute hashes from real data and compare with proofs published on HCS.
          Matching values confirm the proof is valid.
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 3, p: 3 }}>
        <form onSubmit={compute}>
          <Stack spacing={2.5}>
            <Typography variant="subtitle2" fontWeight={700} color="#555">Data to verify</Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField size="small" label="Phone" placeholder="+33767190110"
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                fullWidth helperText="Sufficient for phone_proof" />
              <TextField size="small" label="First name" placeholder="John"
                value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                fullWidth />
              <TextField size="small" label="Last name" placeholder="Doe"
                value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                fullWidth helperText="First + Last + Phone → identity_proof" />
            </Stack>

            <TextField size="small" label="Batch ID" placeholder="BT-2025-001"
              value={form.batchId} onChange={e => setForm(f => ({ ...f, batchId: e.target.value }))}
              sx={{ maxWidth: 320 }} helperText="Batch identifier → claim_proof" />

            <Button type="submit" variant="contained" sx={{ alignSelf: 'flex-start', backgroundColor: '#03045e' }}>
              Compute proofs
            </Button>
          </Stack>
        </form>
      </Paper>

      {results && (
        <Stack spacing={2}>
          <Typography variant="subtitle2" fontWeight={700} color="#03045e">
            Computed proofs — compare with HCS messages
          </Typography>
          {[
            { key: 'phone_proof',    label: 'phone_proof',    desc: 'keccak256(phone)',                    value: results.phone_proof },
            { key: 'identity_proof', label: 'identity_proof', desc: 'keccak256(first|last|phone)',         value: results.identity_proof },
            { key: 'claim_proof',    label: 'claim_proof',    desc: 'keccak256(batch_id)',                 value: results.claim_proof },
          ].map(({ key, label, desc, value }) => value && (
            <Paper key={key} elevation={0} sx={{ border: '1px solid #e3f2fd', borderRadius: 2, p: 2, bgcolor: '#f8fbff' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
                <Box>
                  <Typography variant="caption" color="#1565c0" fontWeight={700} display="block">{label}</Typography>
                  <Typography variant="caption" color="#888">{desc}</Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontFamily="monospace" fontSize="0.78rem" sx={{ wordBreak: 'break-all' }}>
                    {value}
                  </Typography>
                  <Button size="small" variant="outlined" sx={{ minWidth: 0, px: 1, fontSize: '0.7rem', borderColor: '#90caf9', color: '#1565c0' }}
                    onClick={() => navigator.clipboard.writeText(value)}>
                    Copy
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ))}

          <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
            Search these values in the <b>HCS Journal</b> to confirm that an event is linked to this person / allocation.
          </Alert>
        </Stack>
      )}
    </Stack>
  );
}

// ─── Main Depositary Page ──────────────────────────────────────────────────────
export default function Depositary() {
  const [authed, setAuthed]         = useState(!!localStorage.getItem('depositary_token'));
  const [claims, setClaims]         = useState([]);
  const [loading, setLoading]       = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError]   = useState('');
  const [tab, setTab]               = useState(0);

  const loadClaims = async () => {
    setLoading(true);
    try { setClaims(await fetchAllClaims()); } catch { setClaims([]); }
    setLoading(false);
  };

  useEffect(() => { if (authed) loadClaims(); }, [authed]);

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;

  const filtered = filterStatus === 'all' ? claims : claims.filter(c => c.status === filterStatus);

  const handleFormChange = e => {
    const val = e.target.name === 'phone'
      ? e.target.value.replace(/[\s\-().]/g, '')
      : e.target.value;
    setForm(f => ({ ...f, [e.target.name]: val }));
  };

  const handleCreate = async (e) => {
    e.preventDefault(); setFormLoading(true); setFormError('');
    try {
      await createClaim(form);
      setOpenDialog(false); setForm(EMPTY_FORM); loadClaims();
    } catch (err) { setFormError(err.message); }
    setFormLoading(false);
  };

  const handleStatusChange = async (id, status) => {
    try { await updateClaimStatus(id, status); loadClaims(); } catch { /* silently retry */ }
  };

  return (
    <Stack spacing={4}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Box>
          <Typography variant="h5" fontWeight={700} color="#03045e">Depositary Interface</Typography>
          <Typography variant="body2" color="#888">Allocation management · HCS Notarial Journal</Typography>
        </Box>
        {tab === 0 && (
          <Stack direction="row" spacing={2}>
            <Select size="small" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <MenuItem value="all">All statuses</MenuItem>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </Select>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenDialog(true)}
              sx={{ backgroundColor: '#03045e', '&:hover': { backgroundColor: '#020338' } }}>
              New Allocation
            </Button>
          </Stack>
        )}
      </Stack>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: '1px solid #e0e0e0', '& .MuiTab-root': { fontWeight: 600 } }}>
        <Tab label="Allocations" />
        <Tab label="HCS Journal" />
        <Tab label="Proof Verifier" />
      </Tabs>

      {/* ── Tab 0: Allocations ── */}
      {tab === 0 && (
        <>
          <Paper elevation={0} sx={{ border: '1.5px solid #e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
            {loading ? (
              <Stack alignItems="center" p={6}><CircularProgress /></Stack>
            ) : (
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f8f9ff' }}>
                    {['Investor', 'Phone', 'Bond Type', 'Amount', 'Rate', 'Maturity', 'Batch ID', 'Status', 'Actions'].map(h => (
                      <TableCell key={h} sx={{ fontWeight: 700, color: '#03045e', fontSize: 12 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={9} align="center" sx={{ color: '#888', py: 4 }}>No allocations</TableCell></TableRow>
                  )}
                  {filtered.map(c => (
                    <TableRow key={c.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell>{c.bond_type}</TableCell>
                      <TableCell>{Number(c.nominal_amount).toLocaleString()} MGA</TableCell>
                      <TableCell>{Number(c.rate).toFixed(2)}%</TableCell>
                      <TableCell>{new Date(c.maturity_date).toLocaleDateString('en-US')}</TableCell>
                      <TableCell sx={{ fontSize: 11, color: '#666' }}>{c.batch_id}</TableCell>
                      <TableCell><StatusChip status={c.status} /></TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          {c.status === 'available' && (
                            <Button size="small" variant="outlined" onClick={() => handleStatusChange(c.id, 'published')}
                              sx={{ fontSize: 11, borderColor: '#03045e', color: '#03045e' }}>Publish</Button>
                          )}
                          {['available', 'published'].includes(c.status) && (
                            <Button size="small" variant="outlined" color="error" onClick={() => handleStatusChange(c.id, 'cancelled')}
                              sx={{ fontSize: 11 }}>Cancel</Button>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </>
      )}

      {/* ── Tab 1: HCS Journal ── */}
      {tab === 1 && <HCSJournal />}

      {/* ── Tab 2: Proof Verifier ── */}
      {tab === 2 && <ProofVerifier />}

      {/* Create allocation dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: '#03045e', fontWeight: 700 }}>
          New Allocation
          <IconButton onClick={() => setOpenDialog(false)} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <form onSubmit={handleCreate}>
            <Stack spacing={2.5} pt={1}>
              <Button type="button" size="small" variant="outlined" onClick={() => setForm({
                first_name: 'Aina', last_name: 'Raheri', phone: '+33767190110',
                bond_type: BOND_TYPES[0], nominal_amount: '50000', rate: '5',
                maturity_date: '2026-12-12', batch_id: `BT-TEST-${Date.now()}`,
              })} sx={{ alignSelf: 'flex-start', fontSize: 11, borderColor: '#ccc', color: '#888' }}>
                Prefill (test)
              </Button>
              <Stack direction="row" spacing={2}>
                <TextField name="first_name" label="First name" value={form.first_name} onChange={handleFormChange} fullWidth required />
                <TextField name="last_name" label="Last name" value={form.last_name} onChange={handleFormChange} fullWidth required />
              </Stack>
              <TextField name="phone" label="Phone" value={form.phone} onChange={handleFormChange} fullWidth required
                placeholder="+33 7 XX XX XX XX" />
              <FormControl fullWidth>
                <InputLabel>Bond Type</InputLabel>
                <Select name="bond_type" value={form.bond_type} onChange={handleFormChange} label="Bond Type">
                  {BOND_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
              <Stack direction="row" spacing={2}>
                <TextField name="nominal_amount" label="Nominal amount (MGA)" type="number" value={form.nominal_amount}
                  onChange={handleFormChange} fullWidth required InputProps={{ inputProps: { min: 0 } }} />
                <TextField name="rate" label="Rate (%)" type="number" value={form.rate}
                  onChange={handleFormChange} fullWidth required
                  InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment>, inputProps: { step: '0.01', min: 0 } }}
                />
              </Stack>
              <TextField name="maturity_date" label="Maturity date" type="date" value={form.maturity_date}
                onChange={handleFormChange} fullWidth required InputLabelProps={{ shrink: true }} />
              <TextField name="batch_id" label="Batch ID" value={form.batch_id}
                onChange={handleFormChange} fullWidth required placeholder="e.g. BT-2025-001" />
              {formError && <Typography variant="body2" color="error">{formError}</Typography>}
              <Button type="submit" variant="contained" disabled={formLoading} fullWidth
                sx={{ backgroundColor: '#03045e', '&:hover': { backgroundColor: '#020338' }, mt: 1 }}>
                {formLoading ? <CircularProgress size={20} color="inherit" /> : 'Create Allocation'}
              </Button>
            </Stack>
          </form>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
