import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

const FEATURES = [
  { label: "Depositary",   desc: "Register T-Bill rights for identified investors.", path: "/depositary", chip: "Operator" },
  { label: "Investor",     desc: "View your T-Bills, redeem on-chain and use them as repo collateral.", path: "/investor", chip: "Holder" },
  { label: "Repo Market",  desc: "Fund open repo positions and manage your positions.", path: "/market", chip: "Public" },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <Stack alignItems="center" spacing={6} pt={8} pb={8}>
      <Stack alignItems="center" spacing={2} maxWidth={640} textAlign="center">
        <Typography variant="h3" fontWeight={800} color="#03045e">
          Argonath
        </Typography>
        <Typography variant="h6" color="#555" fontWeight={400}>
          T-Bill tokenization and on-chain repo platform on Hedera.
        </Typography>
        <Typography variant="body2" color="#888">
          A central depositary records T-Bill rights for investors. Investors redeem them as tokens, then use them as collateral in repo transactions to obtain liquidity.
        </Typography>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} justifyContent="center" width="100%" maxWidth={900}>
        {FEATURES.map(({ label, desc, path, chip }) => (
          <Box
            key={path}
            onClick={() => navigate(path)}
            sx={{
              flex: 1, p: 4, border: '1.5px solid #e0e0e0', borderRadius: 3,
              cursor: 'pointer', transition: 'all .2s',
              '&:hover': { borderColor: '#03045e', boxShadow: '0 4px 24px rgba(3,4,94,.08)' },
            }}
          >
            <Stack spacing={1.5}>
              <Chip label={chip} size="small" sx={{ alignSelf: 'flex-start', backgroundColor: '#eef2ff', color: '#03045e', fontWeight: 600 }} />
              <Typography variant="h6" fontWeight={700} color="#03045e">{label}</Typography>
              <Typography variant="body2" color="#666">{desc}</Typography>
              <Button variant="contained" size="small" sx={{ alignSelf: 'flex-start', mt: 1, backgroundColor: '#03045e', '&:hover': { backgroundColor: '#020338' } }}>
                Access
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
