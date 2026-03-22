import Footer from './components/Footer';
import CssBaseline from '@mui/material/CssBaseline';
import NavBar from './components/Navbar';
import { Box, ThemeProvider } from '@mui/material';
import { AllWalletsProvider } from './services/wallets/AllWalletsProvider';
import AppRouter from './AppRouter';
import { theme } from './theme';
import { BrowserRouter } from 'react-router-dom';
import "./App.css";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <AllWalletsProvider>
        <CssBaseline />
        <BrowserRouter>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100vh',
              backgroundColor: '#ffffff'
            }}
          >
            <header>
              <NavBar />
            </header>
            <Box flex={1} p={3}>
              <AppRouter />
            </Box>
            <Footer />
          </Box>
        </BrowserRouter>
      </AllWalletsProvider>
    </ThemeProvider>
  );
}

export default App;
