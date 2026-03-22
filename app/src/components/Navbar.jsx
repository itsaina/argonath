import { AppBar, Button, Toolbar, Typography, Box } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWalletInterface } from '../services/wallets/useWalletInterface';
import { WalletSelectionDialog } from './WalletSelectionDialog';

const NAV_LINKS = [
  { label: 'Dépositaire', path: '/depositary' },
  { label: 'Investisseur', path: '/investor' },
  { label: 'Marché', path: '/market' },
];

export default function NavBar() {
  const [open, setOpen] = useState(false);
  const { accountId, walletInterface } = useWalletInterface();
  const navigate = useNavigate();
  const location = useLocation();

  const handleConnect = async () => {
    if (accountId) {
      walletInterface.disconnect();
    } else {
      setOpen(true);
    }
  };

  useEffect(() => {
    if (accountId) setOpen(false);
  }, [accountId]);

  return (
    <AppBar position="relative" elevation={0} sx={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0e0' }}>
      <Toolbar>
        <Typography
          variant="h6"
          fontWeight={700}
          color="#03045e"
          sx={{ cursor: 'pointer', mr: 4 }}
          onClick={() => navigate('/')}
          noWrap
        >
          Argonath
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, flexGrow: 1 }}>
          {NAV_LINKS.map(({ label, path }) => (
            <Button
              key={path}
              onClick={() => navigate(path)}
              sx={{
                color: location.pathname === path ? '#03045e' : '#555',
                fontWeight: location.pathname === path ? 700 : 400,
                borderBottom: location.pathname === path ? '2px solid #03045e' : '2px solid transparent',
                borderRadius: 0,
                px: 2,
              }}
            >
              {label}
            </Button>
          ))}
        </Box>

        <Button
          variant="contained"
          onClick={handleConnect}
          sx={{ backgroundColor: '#03045e', '&:hover': { backgroundColor: '#020338' } }}
        >
          {accountId ? `Connecté: ${accountId.slice(0, 10)}…` : 'Connecter Wallet'}
        </Button>
      </Toolbar>
      <WalletSelectionDialog open={open} setOpen={setOpen} onClose={() => setOpen(false)} />
    </AppBar>
  );
}
