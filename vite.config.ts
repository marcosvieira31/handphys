import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// MPA: a landing (index) e os spikes da Fase 0.
export default defineConfig({
  plugins: [react()],
  server: { host: true }, // expõe na LAN para testar o celular via IP/HTTPS
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        hands: 'spikes/hands.html',
        cardboard: 'spikes/cardboard.html',
      },
    },
  },
});
