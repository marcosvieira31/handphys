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

## Status

- [x] Fase 0 — setup + spikes de validação
  - [x] **Spike 0.1 — hand tracking: APROVADO** (15 Hz real da câmera, latência17,7 ms, pinça estável, GPU, offline)
  - [ ] Spike 0.2 — Cardboard no celular (pendente: fps estéreo + giroscópio no aparelho real)
  - [ ] Spike 0.3 — deploy HTTPS
- [x] Fase 1 (parcial) — **solver MNA** em [`src/core/circuit.ts`](src/core/circuit.ts), 15 testes passando (divisor, série/paralelo, Kirchhoff, RC)
- [ ] Fase 1 — editor de circuito no desktop
- [ ] Fase 2 — cena3D + interação por mãos
- [ ] Fase 3 — modo Cardboard
- [ ] Fase 4 — camada de sala de aula
- [ ] Fase 5 — piloto com turma
