// src/main.tsx (or index.tsx)
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css'; 
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles'; // Renamed for clarity
import CssBaseline from '@mui/material/CssBaseline';
// import theme from './theme'; // Old static theme, will be replaced by dynamic palettes
import { ThemeContextProvider, useTheme } from './context/ThemeContext';
// Assuming theme.ts will export these after the next step
import { lightPalette, darkPalette, typographySettings } from './theme'; 

const AppWithProviders: React.FC = () => {
  const { themeMode } = useTheme(); // Consume your theme mode context

  const muiTheme = React.useMemo(() => createTheme({
    palette: themeMode === 'dark' ? darkPalette : lightPalette,
    typography: typographySettings,
  }), [themeMode]);

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      <AuthProvider>
        <App />
        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          // Toast theme will adapt based on MUI theme through CSS or context in future if needed
          // For now, it might remain light or dark based on its own prop, or be styled globally
          theme={themeMode} // Simple adaptation for react-toastify
        />
      </AuthProvider>
    </MuiThemeProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeContextProvider> {/* Manages light/dark mode state */}
      <AppWithProviders /> {/* Consumes mode state and provides MUI theme + Auth + App */}
    </ThemeContextProvider>
  </React.StrictMode>
);