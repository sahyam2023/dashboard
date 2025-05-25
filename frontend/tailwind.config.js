/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Enable class-based dark mode
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-primary': '#00529B',    // Placeholder from theme.ts
        'brand-secondary': '#6D6E71',  // Placeholder from theme.ts
        'brand-error': '#D32F2F',      // Placeholder from theme.ts
        'brand-warning': '#FFA000',    // Placeholder from theme.ts
        'brand-info': '#1976D2',       // Placeholder from theme.ts
        'brand-success': '#388E3C',    // Placeholder from theme.ts
      },
    },
  },
  plugins: [],
};
