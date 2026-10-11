# handphys

Laboratório virtual de física (circuitos) por realidade mista, para uso em sala de aula.

- **Plano completo:** [`docs/PLANO.md`](docs/PLANO.md)
- **Fase 0 — spikes:** [`docs/SPIKE.md`](docs/SPIKE.md)

## Rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build estático (saída em dist/)
npm test         # testes do solver (Vitest)
```

## Deploy

Publicação automática no **GitHub Pages** a cada push em `main`
(<https://marcosvieira31.github.io/handphys/>) — o workflow
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) roda `npm test` +
`npm run build` antes de publicar.

- O `base` vem do `BASE_PATH`: o CI define `/handphys/` (subdiretório do Pages),
  dev e `preview` ficam na raiz.
- Para publicar em domínio raiz (ex.: Netlify), é só buildar **sem** `BASE_PATH`.
- Local: `npm run build && npm run preview` (build de produção servido em `:4173`).

## Status

- [x] Fase 0 — setup + spikes de validação
  - [x] **Spike 0.1 — hand tracking: APROVADO** (15 Hz real da câmera, latência17,7 ms, pinça estável, GPU, offline)
  - [x] **Spike 0.2 — Cardboard: APROVADO** (60 fps estéreo no celular real, giroscópio OK, toque acertou; pendência: iOS não medido)
  - [x] **Spike 0.3 — deploy HTTPS: APROVADO** → <https://marcosvieira31.github.io/handphys/> (GitHub Pages + Actions, deploy automático a cada push)
- [x] Fase 1 (parcial) — **solver MNA** em [`src/core/circuit.ts`](src/core/circuit.ts), 15 testes passando (divisor, série/paralelo, Kirchhoff, RC)
- [ ] Fase 1 — editor de circuito no desktop
- [ ] Fase 2 — cena3D + interação por mãos
- [ ] Fase 3 — modo Cardboard
- [ ] Fase 4 — camada de sala de aula
- [ ] Fase 5 — piloto com turma
