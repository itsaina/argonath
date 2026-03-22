import { createTheme } from "@mui/material";

export const theme = createTheme({
  typography: {
    fontFamily: '"Styrene A Web", "Helvetica Neue", Sans-Serif',
  },
  palette: {
    mode: 'light',
    primary: {
      main: '#03045e'
    },
    background: {
      default: '#ffffff',
      paper: '#ffffff',
    }
  }
});