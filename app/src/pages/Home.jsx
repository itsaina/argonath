import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

const FEATURES = [
  { label: "Dépositaire central", desc: "Enregistrez des droits sur des titres pour des investisseurs identifiés.", path: "/depositary", chip: "Opérateur" },
  { label: "Investisseur",        desc: "Consultez vos titres, redeem on-chain et mettez-les en pension.",          path: "/investor",   chip: "Porteur"   },
  { label: "Marché repo",         desc: "Financez des positions repo ouvertes et gérez vos positions.",             path: "/market",     chip: "Public"    },
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
          Plateforme de tokenisation de titres financiers et de repo on-chain sur Hedera.
        </Typography>
        <Typography variant="body2" color="#888">
          Un dépositaire central enregistre des droits sur des bons du Trésor. Les investisseurs les redeem sous forme de tokens, puis les placent en pension pour obtenir de la liquidité.
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
                Accéder
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>

    </Stack>
  );
}
