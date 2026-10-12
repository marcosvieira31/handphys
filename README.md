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
- [x] Fase 1 — **editor de circuito no desktop** ([`editor.html`](editor.html), código em [`src/editor/`](src/editor/)): quadro esquemático 2D em SVG (trilhos com paleta/fio aos lados do quadro, arrastar com snap, fios terminal→terminal, R gira, Delete apaga, Ctrl+Z desfaz, cores por tensão), modelo em [`src/core/netlist.ts`](src/core/netlist.ts) + 24 testes, leituras V/I/nós ao vivo no painel. Total: 39 testes.
- [x] Fase 1 (extra) — **modo fio** (botão Conectar/tecla F, mira generosa, clique tolerante a tremida) + **fio com desvio automático** (sem curto fantasma ao cruzar componentes)
- [x] Fase 2a — **vista 3D do mesmo modelo** (bancada three.js, mesma leitura V/I/cor)
- [x] Fase 2b — **mãos na webcam** (gesto de pinça na ponta dos dedos: aperta/move/solta como o mouse, também no 3D por raycast; a pinça também clica nos botões da tela; **mira travada na palma** ao fechar — os dedos convergindo não deslocam o ponto; esqueleto sem vídeo; calibração; laço de reserva p/ navegadores sem rVFC — iOS)
- [x] Fase 2c — **mira por fixação (3 s) no Cardboard** (olhar fixa 3 s num componente e ele é selecionado, com anel de progresso) — exclusivo do giroscópio, pois com as mãos o gesto é a pinça
- [x] Fase 2b+ — **profundidade da mão + zoom**: o esqueleto fica maior quando a mão se aproxima da câmera (o único indicador de profundidade que a webcam entrega de verdade); a razão de pinça passou a usar as coordenadas de **mundo (eixo Z, em metros)** e o painel diz se ela está em `3D` ou só `2D`. Zoom do quadro 2D e da bancada 3D pelos botões `− / % / +` (no trilho à direita do quadro), pela **roda do mouse** (amplia embaixo do cursor), pela **pinça de dois dedos** no toque (zoom + arraste) e pelo gesto de **DUAS mãos abrindo/juntando** — teclas `+ − 0` também valem
- [x] Fase 2b++ — **seletor de UMA mão**: no painel Mãos, `Qualquer / Direita / Esquerda / Travá-la` decide quem comanda. O lado vem de um **voto entre as últimas amostras** (o rótulo Direita/Esquerda do modelo troca sozinho no meio do gesto); no modo *Travar* a app gruda na mão que estiver em uso, sem depender do rótulo. Só a mão escolhida move cursor, pinça e calibração — a outra fica **apagada** na cena e aparece como “ignorada” no painel. Escolhida UMA mão a outra **não interage para nada** — nem o gesto de duas mãos para zoom, que fica reservado a `Qualquer`
- [x] Fase 2b+++ — **bancada expandida (trilhos dentro da bancada + inserir em 1 gesto)**: a paleta, o modo fio, o `2D/3D`, as cores por tensão e o zoom saíram da sidebar e da barra superior (cantos da tela) e passaram a morar em **trilhos verticais POR CIMA da própria bancada** — componentes à esquerda, vista/cores/zoom à direita; a área de trabalho inteira virou superfície do quadro. Nada embaixo: o **limite inferior da câmera** é o mais perto, e descer o braço perde o rastreio da mão justamente onde o item está. E a inserção virou **UM gesto só**: apertar o item **pega** (o fantasma gruda na mira e segue a pinça), leva até onde quiser e **soltar posiciona** — antes o item caía “preso na borda” no primeiro aperto que encontrava célula e exigia pinçar de novo. A mira sobre um botão não aperta o quadro por baixo (o botão que clica). **Lixeira no topo do trilho esquerdo** (o alto é onde a mão alcança sempre): solte o item carregado por lá — com a pinça ou o mouse — ou clique com ele selecionado para apagar; ela **acende quando tem algo na mão**, cancela também fio/armado e o Ctrl+Z desfaz. Alvos grandes (≥ 46 px) com os MESMOS `data-hand`; em janela baixa o trilho abre mão dos valores impressos e vira 2ª coluna antes de estourar
- [x] Fase 2b++++ — **chave que abre e fecha por clique**: apertar a chave no quadro e soltar **sem arrastar** alterna (`toggleSwitch`) — a mesma semântica da pinça (clique = apertar e soltar sem andar) e do mouse; arrastar continua só movendo. Antes o único caminho era o checkbox "Fechada (conduz)" no Inspector, que **a pinça não alcançava** (sem `data-hand`) — por isso montar o circuito e apertar a chave não fechava nada. O checkbox e as ações do Inspector (`Girar`, `Excluir`) agora têm `data-hand` e a pinça clica neles. O modelo (`buildNetlist`) já tratava `switch`/`closed` — o buraco era afordância, não solver
- [x] Fase 3a — **Cardboard de produção** ([`cardboard.html`](cardboard.html): bancada estéreo, mira+toque V/I, fixação por olhar)
- [x] Fase 4 (parcial) — **share por URL + QR**: o circuito inteiro cabe num link `?c=` (JSON compacto → base64url; ids regenerados na abertura; payload validado de ponta a ponta — link podro abre o editor vazio com o selo `link inválido`). O botão **Compartilhar** da barra abre o cartão com **QR** e link, e escolhe o destino: **PC (editor)** ou **Celular (viewer)**. No celular, o link vira a primeira opção `Circuito do link` no viewer. Enquanto o cartão está aberto a cena fica intocável (`store.modal`): nem mouse, nem pinça, nem tecla mexem atrás dele
- [x] Fase 4 (parcial) — **espelho ao vivo (projeção)**: o botão **Espelhar** da barra publica o estado da tela e [`mirror.html`](mirror.html) acompanha a MESMA imagem em tempo real — circuito, enquadramento/zoom, ferramenta em uso e leituras V/I em letra de projeção — sem nada editável (store em modo `modal` + `pointer-events: none`). Dois transportes plugáveis em [`src/mirror/`](src/mirror/): **BroadcastChannel** (mesma máquina, sem servidor, offline — o projetor no PC do professor) e **sala na rede** (cartão *Sala na rede* com código + QR; outro aparelho da escola abre `mirror.html?sala=…` e acompanha por **WebRTC/PeerJS** — só o pareamento passa pela internet, os dados andam de aparelho a aparelho). O canal de dados ainda precisa de validação em duas máquinas reais: o navegador do ambiente de automação bloqueia WebRTC (zero candidatos ICE), detalhe em [`docs/PLANO.md`](docs/PLANO.md)
- [x] Fase 4 (parcial) — **relatório CSV**: o botão **CSV** da barra baixa o circuito montado como planilha (`handphys-circuito-AAAA-MM-DD.csv`: UTF-8 com BOM, separador `;` e vírgula decimal — abre direto no Excel/LibreOffice pt-BR). Uma linha por componente: id, tipo, valor+unidade, posição, rotação, estado da chave, tensão, corrente e nós — as MESMAS leituras da tela (`readCircuit` do painel; a chave fechada registra `fechada` com os dois nós iguais, curto ideal de 0 V, como no painel). Desativado com o quadro vazio, alcançável pela pinça (`data-hand="csv"`) e o download é 100 % local (Blob + `<a download>`) — [`src/editor/report.ts`](src/editor/report.ts)
- [ ] Fase 4 — camada de sala de aula (desafios com verificação, questão na tela; relatório JSON se pedirem)
- [ ] Fase 5 — piloto com turma
