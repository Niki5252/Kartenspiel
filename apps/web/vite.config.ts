import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serverUrl = process.env.ORLAN_SERVER_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // auch im lokalen Netzwerk erreichbar (Test mit echtem Smartphone)
    port: 5173,
    proxy: {
      '/socket.io': { target: serverUrl, ws: true },
    },
  },
});
