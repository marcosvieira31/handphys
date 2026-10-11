import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O tsconfig é do browser (types: vite/client) e o app não é Node. Declaro só a
// fatia de `process` que este arquivo usa — evita @types/node vazando p/ src/.
declare const process: { env: Record<string, string | undefined> };

// GitHub Pages de projeto publica em /handphys/ (subdiretório), então o build
// precisa do base correspondente — caminho absoluto quebraria tudo em produção.
// Dev e preview continuam na raiz; o CI define BASE_PATH.
// `import.meta.env.BASE_URL` espelha este valor (usado pelos assets de /mp/).
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
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
        editor: 'editor.html',
        hands: 'spikes/hands.html',
        cardboard: 'spikes/cardboard.html',
      },
    },
  },
});
