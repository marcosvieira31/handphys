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
- [x] Fase 1 — **editor de circuito no desktop** ([`editor.html`](editor.html), código em [`src/editor/`](src/editor/)): quadro esquemático 2D em SVG (paleta, arrastar com snap, fios terminal→terminal, R gira, Delete apaga, Ctrl+Z desfaz, cores por tensão), modelo em [`src/core/netlist.ts`](src/core/netlist.ts) + 24 testes, leituras V/I/nós ao vivo no painel. Total: 39 testes.
- [x] Fase 1 (extra) — **modo fio** (botão Conectar/tecla F, mira generosa, clique tolerante a tremida) + **fio com desvio automático** (sem curto fantasma ao cruzar componentes)
- [x] Fase 2a — **vista 3D do mesmo modelo** (bancada three.js, mesma leitura V/I/cor)
- [x] Fase 2b — **mãos na webcam** (gesto de pinça na ponta dos dedos: aperta/move/solta como o mouse, também no 3D por raycast; a pinça também clica nos botões da tela; **mira travada na palma** ao fechar — os dedos convergindo não deslocam o ponto; esqueleto sem vídeo; calibração; laço de reserva p/ navegadores sem rVFC — iOS)
- [x] Fase 2c — **mira por fixação (3 s) no Cardboard** (olhar fixa 3 s num componente e ele é selecionado, com anel de progresso) — exclusivo do giroscópio, pois com as mãos o gesto é a pinça
- [x] Fase 2b+ — **profundidade da mão + zoom**: o esqueleto fica maior quando a mão se aproxima da câmera (o único indicador de profundidade que a webcam entrega de verdade); a razão de pinça passou a usar as coordenadas de **mundo (eixo Z, em metros)** e o painel diz se ela está em `3D` ou só `2D`. Zoom do quadro 2D e da bancada 3D pelos botões `− / % / +` (canto), pela **roda do mouse** (amplia embaixo do cursor), pela **pinça de dois dedos** no toque (zoom + arraste) e pelo gesto de **DUAS mãos abrindo/juntando** — teclas `+ − 0` também valem
- [x] Fase 2b++ — **seletor de UMA mão**: no painel Mãos, `Qualquer / Direita / Esquerda / Travá-la` decide quem comanda. O lado vem de um **voto entre as últimas amostras** (o rótulo Direita/Esquerda do modelo troca sozinho no meio do gesto); no modo *Travar* a app gruda na mão que estiver em uso, sem depender do rótulo. Só a mão escolhida move cursor, pinça e calibração — a outra fica **apagada** na cena e aparece como “ignorada” no painel. Escolhida UMA mão a outra **não interage para nada** — nem o gesto de duas mãos para zoom, que fica reservado a `Qualquer`
- [x] Fase 3a — **Cardboard de produção** ([`cardboard.html`](cardboard.html): bancada estéreo, mira+toque V/I, fixação por olhar)
- [x] Fase 4 (parcial) — **share por URL + QR**: o circuito inteiro cabe num link `?c=` (JSON compacto → base64url; ids regenerados na abertura; payload validado de ponta a ponta — link podro abre o editor vazio com o selo `link inválido`). O botão **Compartilhar** da barra abre o cartão com **QR** e link, e escolhe o destino: **PC (editor)** ou **Celular (viewer)**. No celular, o link vira a primeira opção `Circuito do link` no viewer. Enquanto o cartão está aberto a cena fica intocável (`store.modal`): nem mouse, nem pinça, nem tecla mexem atrás dele
- [x] Fase 4 (parcial) — **espelho ao vivo (projeção)**: o botão **Espelhar** da barra publica o estado da tela e [`mirror.html`](mirror.html) acompanha a MESMA imagem em tempo real — circuito, enquadramento/zoom, ferramenta em uso e leituras V/I em letra de projeção — sem nada editável (store em modo `modal` + `pointer-events: none`). Transporte hoje: BroadcastChannel (mesma máquina, sem servidor, offline). O transporte para aparelhos diferentes na mesma rede é o próximo passo e é plugável ([`src/mirror/`](src/mirror/), detalhe em [`docs/PLANO.md`](docs/PLANO.md))
- [ ] Fase 4 — camada de sala de aula (modo professor, desafios, relatório CSV)
- [ ] Fase 5 — piloto com turma
