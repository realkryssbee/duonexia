// vite.config.ts — dev : le proxy /api envoie les appels vers le serveur
// local sans CORS ni cookie inter-domaine (l'utilisateur reste sur
// http://localhost:5173). En production, VITE_API_URL pointe vers l'API du
// VPS (voir web/.env.example).
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: false,
      },
    },
  },
});
