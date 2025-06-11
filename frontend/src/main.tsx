// src/main.tsx (or index.tsx) - CORRECTED
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css'; 
// ToastContainer is no longer needed here because it's rendered in App.tsx
// import { ToastContainer } from 'react-toastify'; 
import 'react-toastify/dist/ReactToastify.css';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles'; // Renamed for clarity
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeContextProvider, useTheme } from './context/ThemeContext';
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
        {/* 
          The <ToastContainer /> that was previously here has been removed.
          The single <ToastContainer /> inside App.tsx will now handle all toasts.
        */}
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