import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: the preview proxies /api and /socket.io to the Express server, so the
// browser only ever talks to its own origin (required for the hosted preview:
// the user's browser can never reach the sandbox's localhost directly).
const API_PORT = process.env.SERVER_PORT || process.env.PORT || '8080';
const API_TARGET = process.env.VITE_API_TARGET || `http://127.0.0.1:${API_PORT}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // Allow the platform preview host (https://<port>-<sandboxId>.e2b.app).
    allowedHosts: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true, ws: true },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
  },
});
