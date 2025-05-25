// frontend/src/theme.ts
import { PaletteOptions } from '@mui/material/styles'; // For typing if needed

const placeholderColors = {
  primary: '#00529B',    // A shade of blue
  secondary: '#6D6E71',  // A shade of gray
  error: '#D32F2F',
  warning: '#FFA000',
  info: '#1976D2',
  success: '#388E3C',
  // General background/paper for light/dark
  paperLight: '#ffffff',
  defaultLight: '#f4f6f8', // A light gray background for pages
  paperDark: '#2c2c2c',    // Darker paper for components like Cards, Paper
  defaultDark: '#1e1e1e',   // Even darker background for the page itself
};

export const lightPalette: PaletteOptions = {
  mode: 'light',
  primary: { main: placeholderColors.primary },
  secondary: { main: placeholderColors.secondary },
  error: { main: placeholderColors.error },
  warning: { main: placeholderColors.warning },
  info: { main: placeholderColors.info },
  success: { main: placeholderColors.success },
  background: {
    default: placeholderColors.defaultLight,
    paper: placeholderColors.paperLight,
  },
  text: {
    primary: 'rgba(0, 0, 0, 0.87)',
    secondary: 'rgba(0, 0, 0, 0.6)',
    disabled: 'rgba(0, 0, 0, 0.38)',
  }
};

export const darkPalette: PaletteOptions = {
  mode: 'dark',
  primary: { main: placeholderColors.primary }, // Consider a slightly lighter shade for better contrast on dark if needed
  secondary: { main: '#a9a9a9' }, // Lighter gray for secondary elements in dark mode
  error: { main: placeholderColors.error }, // Often errors can use same color if it's vibrant enough
  warning: { main: placeholderColors.warning }, // Same for warning
  info: { main: placeholderColors.info }, // Same for info
  success: { main: placeholderColors.success }, // Same for success
  background: {
    default: placeholderColors.defaultDark,
    paper: placeholderColors.paperDark,
  },
  text: { 
    primary: '#ffffff',
    secondary: 'rgba(255, 255, 255, 0.75)', // Adjusted for better readability
    disabled: 'rgba(255, 255, 255, 0.5)',
  }
};

export const typographySettings = {
  fontFamily: 'Roboto, Arial, sans-serif',
  // Example: Customize h1, h2, etc. if needed
  // h1: { fontSize: '2.5rem', fontWeight: 500 },
};
