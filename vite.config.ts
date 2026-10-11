import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// MPA: a landing (index) e os spikes da Fase 0.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expõe na LAN para testar o celular via IP/HTTPS
    // Túneis (localhost.run/cloudflared) entregam hostnames novos a cada sessão e o
    // Vite os bloqueia por padrão (anti DNS rebinding). Só vale para o dev server —
    // o build estático não tem essa checagem.
    allowedHosts: true,
  },
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
