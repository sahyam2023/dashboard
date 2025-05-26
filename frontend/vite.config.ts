import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      // Proxy API requests
      '/api': {
        target: 'http://127.0.0.1:7000',
        changeOrigin: true,
        // secure: false, // Not needed for http to http
      },
      // Proxy file download requests for official documents, patches, and links (uploaded files)
      '/official_uploads': {
        target: 'http://127.0.0.1:7000',
        changeOrigin: true,
        // secure: false,
        // No rewrite needed if the backend expects the same path prefix
      },
      // Proxy file download requests for miscellaneous uploads
      '/misc_uploads': {
        target: 'http://127.0.0.1:7000',
        changeOrigin: true,
        // secure: false,
        // No rewrite needed if the backend expects the same path prefix
      }
    }
  }
});
