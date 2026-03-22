import { Box, Typography } from '@mui/material';

export default function Footer() {
  return (
    <Box
      sx={{
        borderTop: '1px solid #e0e0e0',
        px: 3,
        py: 2,
        mt: 'auto',
        backgroundColor: '#ffffff',
      }}
    >
      <Typography variant="body2" color="#9e9e9e" textAlign="center">
        © {new Date().getFullYear()} Argonath
      </Typography>
    </Box>
  );
}
