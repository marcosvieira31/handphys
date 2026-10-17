# Plano — Laboratório Virtual de Física (Circuitos) em Realidade Mista

> Status: **Fase 0–4 concluídas — share por URL/QR, espelho ao vivo, CSV + JSON, corrente animada, desafios com verificação automática, estação de Kirchhoff (nós + malhas), questão na tela e responsividade mobile (editor + espelho + landing). Próximo: Fase 5 (piloto com turma). Validação do WebRTC em duas máquinas reais pendente (a automação bloqueia ICE); iOS ainda não medido**
> Objetivo: evolução contínua (sem data de entrega marcada), uso real em sala de aula.

---

## 1. Premissa de hardware

Cardboard e hand tracking **não funcionam ao mesmo tempo** (o celular fica dentro do viewer,
mão e câmera indisponíveis). Em vez de forçar os dois, o produto é **um núcleo único com
vários modos de uso**:

| Modo | Dispositivo | Como vê | Como interage | Prioridade |
|---|---|---|---|---|
| **Desktop (base)** | PC da escola | Tela2D/3D única | Mouse/teclado | 1º |
| **Mãos na tela** | PC + webcam | Cena3D + mão sobreposta | MediaPipe Hand Landmarker (pinçar/arrastar) | 2º |
| **Cardboard** | Celular + viewer | Estéreo split-screen + giroscópio | Gaze + toque/tela | 3º |
| **AR de bolso** | Celular na mão | Câmera traseira + mãos | MediaPipe sobre o vídeo | futuro |
| **Quest/WebXR** | Quest 3 | Passthrough `immersive-ar` | WebXR Hands (25 juntas) | futuro |

**Ordem aprovada: Desktop → Mãos (webcam) → Cardboard.**

## 2. Decisões aprovadas

- **Stack**: Vite + TypeScript. **React só para a camada2D/UI** (painéis, gráficos, modo
  professor, exercícios). **three.js "puro"** (sem react-three-fiber) para a camada3D —
  controle direto de múltiplos modos de render (tela única, estéreo com2 viewports, WebXR depois).
- **Solver de circuitos próprio em TS** (MNA — Modified Nodal Analysis), puro e sem DOM,
  testável com Vitest. Nada de SPICE-em-WASM: precisamos de controle total sobre visualização
  (cor por tensão, marcha de elétrons ∝ corrente, sondas instantâneas) e reatividade a knobs
  em tempo real.
- **Hand tracking na webcam: mão como proxy3D na cena** (cursor de pinça + mão-fantasma
  esqueletizada), **sem** exibir o vídeo da câmera por cima da cena. Motivo: privacidade em
  sala de aula (a câmera apareceria na projetora) e custo de performance. Um painel
  **opcional e recolhível** com a prévia da câmera fica disponível para feedback/troubleshooting.
- **Hand tracking é sempre opcional**: o fallback mouse nunca sai do produto.
- Deploy em **hospedagem estática HTTPS** + PWA offline-first (rede escolar instável).

## 3. Arquitetura

```
┌─ UI (React/DOM) ────── painel, gráficos, modo professor, exercícios ─┐
├─ InputAdapters ──────── mouse | gaze+tap | MediaPipe pinça | WebXR ──┤  traduzem tudo para
├─ Scene3D (three.js) ─── bancada, componentes, fios, sondas ──────────┤  a MESMA semântica:
├─ RenderModes ────────── single | stereo(cardboard) | XR ─────────────┤  grab / drag / release
├─ SimulationCore ─────── solver MNA + passo de tempo (puro, sem DOM) ─┤
└─ Content ────────────── experimentos, desafios, relatórios ──────────┘
```

Detalhes de design do hand tracking:
- Pinça = distância normalizada entre ponta do polegar (junta4) e indicador (junta8),
  dividida pelo tamanho aparente da mão (pulso → MCP do médio). Histerese no limiar.
- Suavização com filtro One Euro (sem isso a mão "treme" e o objeto pisca entre agarrado/solto).
- Profundidade via **tamanho aparente da mão** (mão maior = mais perto) → raycast no plano da cena.

## 4. Escopo pedagógico v1 (ensino médio, pt-BR)

**Componentes:** fonte DC, resistor (E24), capacitor, chave, lâmpada (IV não-linear simples),
fios, sondas de voltímetro/amperímetro.

**Estações:**
1. **Lei de Ohm** — variar R, medir V/I, gráfico I×V ao vivo.
2. **Série × paralelo** — equivalente, divisão de tensão, previsão antes de medir.
3. **Kirchhoff** — nós e malhas com corrente animada nos fios (velocidade ∝ I).
4. **Circuito RC** — carga/descarga, constante τ, osciloscópio em tempo real.

**Camada de sala de aula:**
- Modo professor: cena espelhada em2D na projetora + questão na tela.
- Desafios com verificação automática ("leia 15 mA com exatamente3 resistores").
- Relatório CSV/JSON; circuito compartilhável por URL.
- v1 é **só DC/RC linear**; semicondutores e AC ficam para depois.

## 5. Roadmap

| Fase | Entregável | Estimativa |
|---|---|---|
| **0 — Spike de risco** | Validar no hardware real: estéreo+giroscópio no celular, fps do MediaPipe na webcam, deploy HTTPS | 2–4 dias |
| **1 — Núcleo** | Solver MNA testado + editor de circuito no desktop (mouse) | 1–2 semanas |
| **2 — Cena3D + mãos** | Bancada3D, pinch-drag-release, cores por tensão, animação de corrente, sondas | 1–2 semanas |
| **3 — Cardboard** | Split estéreo + `DeviceOrientation` + gaze/tap, fps no celular | 3–5 dias |
| **4 — Sala de aula** | Modo professor (espelho ao vivo), desafios, relatório CSV, salvar/share por URL | ~1 semana |
| **5 — Piloto** | Testar com turma real e iterar | contínuo |

### Espelho ao vivo — onde está

Feito (Fase 4, primeiro passo):
- **Share por URL + QR** (`?c=`): o circuito inteiro cabe no link; `mirror.html` abre
  com ele mesmo sem ninguém transmitindo.
- **Espelho ao vivo na mesma máquina**: botão *Espelhar* no editor publica o estado
  (circuito, enquadramento/zoom, ferramenta em uso) e `mirror.html` acompanha em tempo
  real, com leituras V/I em letra de projeção e nada editável (store em modo `modal` +
  `pointer-events: none`). Transporte: **BroadcastChannel** — sem servidor, offline,
  funciona entre abas/janelas do mesmo PC (projetor ligado no PC do professor).
- Protocolo plugável em [`src/mirror/`](../src/mirror/): `protocol.ts` (estado completo,
  compacto pelo codec do link), `transmitter.ts` (quem conduz), `follower.ts` (o espelho),
  `channel.ts` (transporte local) e `peer.ts` (transporte pela rede).
- **Por que um sinalizador público (PeerJS)**: oferta e resposta do WebRTC precisam
  viajar nos dois sentidos — um QR só resolve um sentido e o QR de resposta sairia da
  tela pequena; relé `ws://` na rede local seria **bloqueado como conteúdo misto** pela
  página HTTPS. Com PeerJS só o *aperto de mão* passa pela internet; depois de pareados,
  os dados andam de aparelho a aparelho, dentro da rede da sala.

Feito (Fase 4, segundo passo) — **sala na rede, aparelhos diferentes**:
- **`peer.ts`**: sala com código curto de 5 caracteres sem letra ambígua
  (prefixo `handphys-`), `openRoom`/`joinRoom`/`mirrorUrl`/`roomFromSearch`; código já
  em uso → sorteia outro (3 tentativas); quem chega antes da sala re-tenta a cada 4 s
  por ~3 min. `peerjs` só é carregado por `import()` dinâmico — chunk separado, fora do
  carregamento normal do editor.
- **No editor**: cartão *Sala na rede* com **QR + código**, contagem de telas
  (local + rede) e *Encerrar sala*. **No espelho**: `mirror.html?sala=XXXXX` (o QR do
  cartão já aponta para cá) entra na sala e mostra chip de status no topo
  (`sala XXXXX` quando conectado, `procurando a sala…` enquanto re-tenta).
- Verificado: **7 testes com rede falsa** (`peer.test.ts` — entra, recebe o estado ao
  vivo, várias telas ao mesmo tempo, chega antes da sala, encerra) e sinalização real
  em navegador (par registrado no sinalizador, oferta/SDP trocados entre abas).
- **Falta**: validar o canal de dados em **duas máquinas reais** — o navegador do
  ambiente de automação reúne **zero candidatos ICE** (WebRTC bloqueado nele: nem
  host, nem STUN, nem TURN/TLS), então o aperto de mão só pode ser comprovado em
  navegador normal. O espelho da mesma máquina (BroadcastChannel) continua cobrindo a
  projeção ligada no PC do professor.

### Bancada expandida (trilhos dentro da bancada + inserir em 1 gesto) — onde está

Feito (refino de uso com as mãos, em três passos com o usuário):
- **O que mudou**: a paleta lateral original (componentes + Conectar), o alternador `2D/3D`,
  as **cores por tensão** e o zoom `− / % / +` passaram a morar em **trilhos verticais
  sobre a própria bancada** ([`src/editor/Rails.tsx`](../src/editor/Rails.tsx)):
  componentes à esquerda, vista/cores/zoom à direita, posicionados de forma absoluta
  DENTRO de `.canvas-view` (a bancada virou a superfície inteira da área de trabalho).
  História: primeiro numa faixa embaixo; depois o usuário apontou o **limite INFERIOR da
  câmera** (descer o braço perde o rastreio); depois apontou que as opções ainda estavam
  **fora** da bancada — e o gesto de inserção "ficava preso na borda".
- **Inserir em UM gesto (o bug real)**: antes, pinçar o item só *armava*; ao entrar no
  quadro o `pressAt` disparava NA BORDA (primeira célula que a mira encontrava) e
  posicionava ali — tinha que pinçar de novo para arrastar até o lugar. Agora a semântica
  é **apertar = pegar, soltar = posicionar** ([`src/editor/store.ts`](../src/editor/store.ts)):
  `pressAt` com item armado guarda a célula em `carry` (o fantasma gruda na mira — vem do
  store, então acompanha a PINÇA, não só o mouse), `moveAt` leva o `carry`, `releaseAt`
  posiciona e limpa. `arm`/`armWire`/`setModal`/`place`/`cancelDraft`/`load`/`clear`
  zeram o `carry`. O teste do store cobre pegar→levar→soltar.
- **Sem quebrar a pinça (trilho sobre o SVG)**: como os trilhos agora podem cair por cima
  do retângulo do quadro (janela retrato), a mira que estiver sobre um `[data-hand]`
  devolve `null` no locator — `overHandButton()` em
  [`src/editor/coords.ts`](../src/editor/coords.ts), aplicado no 2D
  ([`HandsLayer.tsx`](../src/editor/HandsLayer.tsx)) e no 3D
  ([`SceneView.tsx`](../src/editor/SceneView.tsx)). O botão que clica, o quadro não aperta
  por baixo; a soltura continua no `lastCell` (última célula válida), então soltar sobre
  o trilho posiciona no último ponto do quadro.
- **Lixeira dentro da bancada** (topo do trilho esquerdo — o alto fica sempre na faixa
  que a mão alcança; o fundo é onde a câmera corta): `trash()` no
  [`src/editor/store.ts`](../src/editor/store.ts) é o MESMO destino de soltar por lá e de
  clicar selecionado — apaga o item segurado/selecionado (grip implica seleção), cancela
  fio na mão, sai do modo fio e desarma item em arraste; Ctrl+Z desfaz. Onde "por lá" é
  detectado em dois caminhos: no **mouse**, `overTrash(clientX, clientY)` em
  [`Schematic.tsx`](../src/editor/Schematic.tsx) no `pointerup` (o `capture` passou a
  incluir `placing`, senão o soltar em cima do botão se perdera no caminho); na **pinça**,
  `miraOverTrash(draw.cursor)` no passo de soltura do
  [`controller.ts`](../src/hands/controller.ts) — a mira VISÍVEL do quadro anterior, que
  continua válida mesmo porque a mira congela sobre o botão (guard do item anterior).
  Com algo na mão a lixeira ganha a classe `holding` (acende como alvo de soltura).
- **Alvo de mão**: itens ≥ 46 px de altura; em janela baixa (`max-height: 620px`) o trilho
  esconde os valores impressos e, se ainda não couber, vira uma 2ª coluna
  (`flex-wrap`) — nunca estoura nem rola.
- Verificado: `tsc` limpo, 167 testes (store: apagar por grip/seleção, cancelar fio/modo
  fio/arrastado; controller: soltar a pinça sobre a lixeira apaga com DOM simulado), build
  ok; no navegador (dev) — clicar no item arma, apertar PEGA (`carry` + fantasma), levar e
  soltar NA LIXEIRA apaga; item armado solto lá só desarma; clique na lixeira apaga a
  seleção; modo fio sai; `holding` acende/apaga; `2D/3D` e zoom pelos trilhos — 0 erros de
  console. (Depois disto: chave passou a alternar por clique — ver a seção abaixo.)

### Chave: clique na chave abre/fechara — onde está

Feito (relato do usuário: "a chave interruptor não está fechando o circuito"):
- **O problema não era o modelo**: `buildNetlist` já trata `switch`/`closed` — chave aberta
  remove o componente do solver e une os dois terminais quando fechada
  ([`src/core/netlist.ts`](../src/core/netlist.ts)), coberto por teste ("aberta => corrente
  zero", "fechada => conduz"). O buraco era **afordância**: o único caminho para alternar
  era o checkbox "Fechada (conduz)" no Inspector — que a **pinça não alcança** (sem
  `data-hand`) — e **não existia clique na chave no quadro**. Quem montava o circuito e
  apertava a chave via mouse/pinça via nada acontecer.
- **Clique na chave = alternar** ([`src/editor/store.ts`](../src/editor/store.ts)): o `grip`
  ganhou `moved` (`false` no `pressAt`, vira `true` em `moveComp` quando o item anda de
  verdade); no `releaseAt`, soltar **sem ter andado** num componente `switch` alterna
  (`toggleSwitch`) e solta a mão — sem isso a chave ficaria colada na mira (pegou no
  teste). Arrastou e soltou = só posiciona, não alterna. É a MESMA semântica da pinça
  (apertar e soltar sem andar = clique) e do mouse (pointerdown+up na mesma célula).
  Fio encostado no terminal continua sendo o primeiro a pegar (apertar perto do terminal
  puxa fio, não alterna).
- **Inspector alcançável pela pinça** ([`src/editor/Inspector.tsx`](../src/editor/Inspector.tsx)):
  o checkbox da chave, "Girar 90°" e "Excluir" ganharam `data-hand`
  (`switch-toggle`/`insp-rotate`/`insp-delete`) — a pinça clica neles como em qualquer
  botão da bancada. A dica do Inspector agora ensina "clique na chave (sem arrastar)
  abre/fecha".
- Verificado: `tsc` limpo, 168 testes (novo: clique alterna 2×, arrastar não alterna e
  move, resistor não alterna), build ok; no navegador (dev) — circuito fonte→chave→lâmpada:
  chave aberta 0 A, clique fecha e a leitura passa a 0,09 A, clique de novo abre; arrastar
  move sem alternar; checkbox do Inspector alterna; 0 erros de console.

### Modo professor — relatório CSV — onde está

Feito (primeira fatia da camada de sala de aula do roadmap; o espelho já existia):
- **O que é**: botão `CSV` na barra ([`src/editor/App.tsx`](../src/editor/App.tsx)) baixa
  `handphys-circuito-AAAA-MM-DD.csv` com o circuito montado —
  [`src/editor/report.ts`](../src/editor/report.ts) monta a tabela com UMA linha por
  componente: id, tipo, valor + unidade, posição, rotação, estado, tensão, corrente e nós.
- **Abre direto na planilha da aula**: separador `;`, vírgula decimal, CRLF e BOM UTF-8
  (`Ω`, `µF` e acentos chegam certos no Excel/LibreOffice pt-BR). Posição em DUAS colunas
  (`pos_x`/`pos_y`): com vírgula decimal, `4,6` numa coluna só o Excel leria como o
  número 4,6.
- **As leituras são as da tela**: `csvReport(doc, readCircuit(doc))` — o mesmo solver do
  painel. A chave fechada é curto ideal (os dois terminais viram UM nó; o solver não a tem
  como incógnita): `estado=fechada`, `tensao_V=0`, `corrente_A=0` — igual ao painel; quem
  conduz aparece nos componentes da série (bat entrega `0,45`, lâmpada `0,45`).
- **Alcance**: `data-hand="csv"` (a pinça baixa o relatório como qualquer botão da
  bancada); desativado com o quadro vazio; download 100 % local (Blob + `<a download>`,
  sem servidor — nada da aula sai do navegador).
- Verificado: `tsc` limpo, 175 testes (7 novos do relatório: cabeçalho + 12 colunas,
  0,45 A em vírgula decimal, GND na fonte, chave fechada com os dois nós iguais, chave
  aberta ⇒ lâmpada 0 mA, µF/mF do capacitor, vazio ⇒ só o cabeçalho), build ok; no
  navegador (dev) — botão baixa o arquivo com nome e data, bytes iniciais `EF BB BF`
  (BOM), CSV com as linhas esperadas, 0 erros de console.
- Pendente do plano: relatório **JSON** — feito, na seção própria abaixo.
  (Leitura por **nó**, malhas de Kirchhoff e desafios com verificação
  automática: feitos, nas seções próprias.)

### Corrente animada nos fios — onde está

Feito (efeito visual com interruptor — o aluno vê a corrente ANDAR no esquemático):
- **O que é**: traços-gota em movimento sobre cada fio por onde corrente passa.
  A **velocidade é proporcional à corrente**: 450 mA corre em 0,4 s por ciclo, 15 mA
  anda a ritmo de aula (≈ 3 s) e µA vira cunha (12 s) — `flowDuration(amps)` em
  [`src/core/flow.ts`](../src/core/flow.ts). O **sentido dos traços é o sentido da
  corrente** (sinal de cada trecho).
- **O interruptor é do usuário**: botão **Corrente / nos fios** no trilho direito
  (depois de *Cores*), `data-hand="flow"` — a pinça liga e desliga. Estado `flow` no
  store (`default true`), refletido no **espelho** (campo `f` no protocolo, aditivo —
  sem bump de versão) e na **vista 3D**.
- **Onde a corrente é calculada**: [`src/core/flow.ts`](../src/core/flow.ts) →
  `computeFlow(doc, reading)` monta um grafo dos **sub-traços de fio** (cada fio pode
  ser partido por emenda de terminal no meio — igual o netlist) e distribui as
  injeções do solver (`reading.comps`, sinal uniforme: `amps > 0` = terminal 0 → 1)
  por uma **árvore DFS com KCL exata**. A chave fechada entra como **aresta livre**
  entre os terminais (não como fio) — sem ela a malha quebra e a corrente da série
  não atravessaria o curto; a chave aberta não injeta nada ⇒ mapa vazio ⇒ nada anima.
  Regiões desbalanceadas (união mágica de terras) ainda saem corretas por aresta.
- **Só fios com corrente**: o mapa devolve apenas trechos com `|I| > 1 nA`, e
  partes consecutivas do **mesmo fio** com a MESMA corrente são agrupadas — um fio
  reto em série vira UM traço contínuo; um T no meio divide em trechos distintos
  (0,9 A antes da emenda, 0,45 A depois).
- **2D (editor + espelho)**: overlay `<polyline class="wire-flow">` por trecho, com
  `stroke-dasharray` e `stroke-dashoffset` animados em CSS; a duração e a direção
  vêm no `style` de cada trecho (`animationDirection: reverse` quando o sinal é
  negativo). Por cima do fio, `pointer-events: none` — o clique continua batendo no
  fio embaixo.
- **3D (vista + Cardboard)**: 3 gotas esféricas âmbar emissivas por trecho, andando
  no **comprimento de arco** (`pointAlong`/`cumLength` em
  [`src/scene/layout.ts`](../src/scene/layout.ts)) — não aceleram nas curvas;
  `advanceFlow(circuit)` é chamado a cada quadro nos DOIS laços (desktop e
  Cardboard) com `dt` interno. O botão do trilho liga e desliga as gotas também no
  3D (`LabView.update(doc, reading, flow)`).
- Verificado: `tsc` limpo, **184 testes** (9 novos: 5 do fluxo — série com os 6 fios
  em +0,45 e sentido da circulação, chave aberta ⇒ mapa vazio, paralelo com T no meio
  do fio separando 0,9/0,45 nas duas emendas, KCL nas junções, `flowDuration`
  monotônica e restrita a 0,4–12 s — e 4 das gotas 3D: 3 por trecho, invisível com a
  animação desligada, distribuição 0/⅓/⅔ no primeiro quadro e avanço de 0,1 s no
  comprimento de arco), build ok.

### Pan da vista e centralização (2D + 3D) — onde está

Feito (o circuito reposicionável no workbench, com mouse E pinça):

- **O que é**: arrastar a **área vazia** do quadro desloca a vista — o circuito
  acompanha o ponteiro (mouse, dedo no toque e **pinça+puxar** das mãos);
  **duplo-clique no vazio leva o circuito ao centro** mantendo o zoom. Na bancada
  3D o mesmo: a pinça no vazio desloca a câmera, e o duplo-clique no vazio volta ao
  **enquadramento de chegada** (câmera e alvo juntos, órbita intacta). Nada disso
  toca em componente — apertar em componente/fio/terminal continua sendo edição.
- **Por que em px e não em célula**: a célula da mira é derivada da vista; se o pan
  medisse células, cada movimento da vista mudaria a célula sob o dedo e a vista
  correria sozinha (realimentação). O mouse guarda `panLast` em px no
  [`Schematic.tsx`](../src/editor/Schematic.tsx); a pinça guarda `panPrev` em
  **fração de tela** no [`controller.ts`](../src/hands/controller.ts) e converte com
  `innerWidth/innerHeight`.
- **Onde está o gatilho**: `pressAt` do store reavalia todo aperto — caiu no vazio
  (sem componente, fio nem terminal por perto) marca **`panning`**; `releaseAt`,
  `stopPan` (chegada do 2º dedo do toque), `setModal` e `setView` encerram. Com
  `panning` ligado: o [`Schematic.tsx`](../src/editor/Schematic.tsx) ignora
  `moveAt` e chama `panBy(dx, dy, largura)` por evento; o controller, enquanto a
  pinça estiver fechada, chama **`applyPan`** — o MESMO caminho duplo do zoom em
  [`src/editor/zoom.ts`](../src/editor/zoom.ts): vista 2D → `store.panBy`, vista 3D →
  `target3d.panBy`. Em componente/fio/terminal o flag nunca liga, então os dois
  lados caem no `moveAt` normal.
- **Centralizar**: `centerView` (novo) zera o `pan` **mantendo o zoom** — é o que o
  duplo-clique dispara quando não encosta em nada (guarda de modal/armado/fio).
  A tecla `0` e o botão `%` continuam sendo o `resetView` completo (zoom 1 + centro).
- **3D**: `panCameraBy(camera, alvo, dx, dy, altura)` em
  [`src/scene/buildScene.ts`](../src/scene/buildScene.ts) anda com câmera e alvo
  juntos no plano da tela, na escala certa (mundo/px = `2·tan(fov/2)·dist/altura`);
  `LabView.panBy` é o novo método do `ZoomTarget`. O duplo-clique do canvas só
  recentraliza se o raio **não** achar componente/fio (`dyn`); bancada e gotas
  contam como vazio. O pan do mouse já existia no OrbitControls (botão direito) —
  o que entrou foi o centralizar e o gesto da pinça.
- **Limite conhecido**: em zoom 1 o quadro inteiro cabe, então `clampCenter` congela
  o pan em zero (por design — não há o que deslocar; amplie para posicionar).

- Verificado: `tsc` limpo, **196 testes** (12 novos: 6 do store — aperto no vazio
  vira pan e solta encerra, componente e terminal NÃO viram pan, `stopPan` do 2º
  dedo, `centerView` mantém o zoom, `moveAt` durante o pan não mexe no doc; 2 do
  controller — pinça no vazio e puxa desloca a vista sem tocar em componente e
  abrir a mão solta, pinça no terminal leva o fio e a vista fica parada; 4 do pan
  3D — câmera+alvo juntos preservando a órbita, sentido do conteúdo acompanhando o
  dedo, escala proporcional à distância, altura 0 sem NaN), build ok. Validação dev
  com eventos: arraste no vazio (zoom 2) moveu a vista **exatamente na conta**
  (dx = 100 px ⇒ Δpan −89,82 = −100·240/267,2), duplo-clique devolveu pan `{0,0}`
  mantendo zoom 2, arraste sobre componente moveu só o componente (pan intacto),
  `__lab.panBy` na bancada mudou a mira (15,16)→(8,19) e o duplo-clique no vazio
  devolveu (15,16), **0 erros de console**.

### Trilhos ao lado do quadro — onde está

Feito (os itens encostados na bancada, sem esticar o braço):

- **O que é**: os trilhos de ferramentas saíram das **bordas da janela** e viraram
  **irmãos de flex do próprio quadro** ([`.canvas-view`](../src/styles/editor.css)):
  componentes à esquerda, vista/cores/zoom à direita, com **gap de 10 px** da
  borda do quadro — pegar → carregar → soltar é um gesto curto (antes sobravam
  ~150 px de vão de cada lado e o braço esticava para alcançar o item).
- **Como o quadrado sobrevive ao flex**: `height: 100%` fixo + shrink achataria o
  quadro (medido: 448×588). O quadrado passou a sair da **largura disponível**
  com teto na **altura** — `width: min(100%, 100cqh)` com `height: auto`, em
  regras escopadas em `.canvas-view > .schematic/.scene-wrap` (o espelho, fora
  da bancada, fica com a regra antiga). A bancada virou `container-type: size`
  para o `cqh` existir; o canvas 3D é `absolute inset: 0` e o ResizeObserver do
  renderer só o preenche.
- **Bancada estreita**: container < 600 px não cabe trilho AO LADO sem amassar o
  quadro — a **container query** devolve os trilhos às bordas (o comportamento
  antigo, sobreposto), e o quadro volta a `min(largura, altura)`. Esse fallback
  hoje só manda quando a janela passa de 760 px: no celular o `@media` do fim do
  arquivo vence e os trilhos viram **faixas horizontais** (ver "Responsividade
  mobile — onde está").
- Verificado: `tsc` limpo, **196 testes**, build ok; dev em janela larga: gap
  esq/dir = 10 px, quadro 2D quadrado (diff 0) e canvas 3D quadrado; janela
  estreita: fallback sobreposto com quadro quadrado; interação no layout novo —
  armou Fonte no trilho, soltou na grade (1 comp), aperto em cima **selecionou**
  (`selection` ligado, `panning` falso) e a lixeira apagou; **0 erros de
  console** (2 `setPointerCapture` são artefato de evento sintético sem
  pointerId, não de clique real). Produção (run 38438204449): CSS novo no ar,
  `container-type: size`, gaps 10/10, quadro 448×448, canvas 3D 448×448, alvo
  de mão 64×62 com `data-hand`, 0 erros.

### Gesto das duas mãos completo (zoom + enquadramento + giro de Z) — onde está

Feito (o gesto de zoom das mãos virou o pinça COMPLETO, como o do toque):

- **O que é**: com as DUAS mãos abertas na tela (seletor em "Qualquer mão
  comanda"), o gesto faz as três coisas de uma vez — medida do quadro
  anterior para o atual, na seção 5.5 do
  [`controller.ts`](../src/hands/controller.ts):
  1. **afastar/juntar** => zoom (`applyZoom`), **ancorado no ponto do quadro
     sob o MEIO das mãos** (`boardAt` via `clientToBoard`) — o ponto fica
     preso na mão, como o pinch do toque já fazia;
  2. **deslocar o meio** => enquadramento (`applyPan`, em px da janela sobre a
     largura do quadro) — vertical e horizontal, enquanto se amplia;
  3. **girar a linha entre as mãos** => eixo Z da bancada 3D: `applyRoll` =>
     `rollBy` => `rollCameraBy` (novo, em
     [`src/scene/buildScene.ts`](../src/scene/buildScene.ts)) — a câmera
     orbita o eixo VERTICAL passando pelo alvo: distância, altura e alvo
     intactos, só o azimute muda. O esquemático é diagrama: lá o giro é
     no-op. (O eixo foi corrigido na fase seguinte — ver "Enquadramento
     coerente 2D↔3D": orbitava o Z horizontal da cena.)
- **Travas**: o par tem de ser o MESMO (ids das mãos) — mão trocada no meio
  do gesto não gira nada naquele quadro (sem salto de π); distância mínima
  0,08 nos dois quadros; trava por quadro no zoom (±5%) e no giro (±0,25
  rad); pan com folga de 0,05 px (o tremor da suavização não anda a vista).
  Seguem as regras de antes: só "Qualquer mão comanda", nenhuma mão pinçando.
- Verificado: `tsc` limpo, **202 testes** (6 novos: 3 do `rollCameraBy` —
  órbita pura em Z com distância/alvo intactos, sinal "mão horária leva o
  conteúdo junto" e contra-giro idêntico; 3 do controller — o meio posiciona
  o enquadramento nos dois eixos, a rotação gira o Z só no 3D com zoom/pan
  parados (a soma do giro ≈ ângulo total) e par trocado não arremessa), build
  ok. Validação dev com `__hands` (gancho novo, só dev, alimenta `ingest` sem
  câmera): 2D — afastar levou o zoom de 2 para 2,75 com a âncora nas mãos e
  deslocar o meio andou o viewBox (pan +163,9 / −66,5, os dois eixos); 3D —
  girar 60° moveu a célula sob o ponto fixo (8,13)→(10,11) e transladar o meio
  moveu (11,10)→(20,12); **0 erros de console**.

### Enquadramento coerente 2D↔3D (a câmera nunca se perde na troca) — onde está

Feito (o enquadramento virou ÚNICO das duas vistas):

- **O que é**: trocar `2D ⇄ 3D` nunca mais reposiciona o que o professor
  estava olhando. O enquadramento (O QUÊ está enquadrado: centro + escala)
  tem fonte de verdade única — o `zoom`/`pan` do store — e a bancada 3D o
  segue:
  - **2D → 3D**: a câmera herda o enquadramento do quadro ao montar
    (`applyFrameFrom2D` em [`src/editor/zoom.ts`](../src/editor/zoom.ts) →
    `frameTo`): o alvo cai no centro do viewBox sobre a bancada
    (`boardToWorld`, centro do quadro = centro da mesa) e a distância sai do
    zoom (`distForZoom`: zoom 1 = a distância de chegada, bancada inteira).
  - **no 3D / 3D → 2D**: a câmera escreve DE VOLTA no quadro a cada
    movimento (listener `'change'` do OrbitControls → `setFraming` →
    `frameAt`, com os MESMOS clamps da vista) — a roda do mouse, o dolly, o
    pan do botão direito, o arraste da pinça no vazio e o gesto das duas
    mãos atualizam o quadro 2D em tempo real; voltar ao 2D mostra exatamente
    o que a câmera estava vendo.
  - **só o 3D tem os ÂNGULOS**: azimute e elevação da órbita são exclusivos
    da bancada e sobrevivem ao desmontar a cena (guardados no módulo no
    `dispose`) — antes, toda entrada em 3D voltava à câmera fixa de chegada.
    `resetView` (botão `enquadrar`/tecla `0`/duplo-clique) devolve enquadro
    E ângulos, e o quadro 2D acompanha.
- **Correção do eixo do giro das duas mãos**: `rollCameraBy` orbitava o **Z
  do mundo**, que nesta cena (Y-em-cima, bancada deitada no plano XZ) é um
  eixo HORIZONTAL — a "altura intacta" que o doc prometia não valia (a
  câmera balançava em altura e azimute ao mesmo tempo). Passou a orbitar o
  **eixo VERTICAL** (`AXIS_UP`): o "Z" que o professor gira com as mãos é o
  eixo fora do plano do quadro 2D, que na bancada deitada é o Y — prato
  giratório de verdade: distância, altura e alvo intactos, só o azimute
  muda, e o sinal "mão horária leva o conteúdo" segue valendo (na vista
  elevada, conteúdo girando +θ ao redor do vertical = imagem horária na
  tela).
- **Trava de montagem**: o primeiro `update()` do OrbitControls SEMPRE
  dispara `'change'` (`lastPosition` começa zerado) — sem o gate `primed`
  essa escrita de chegada estourava o enquadramento do quadro ANTES de o
  `frameTo` rodar; agora a câmera só reporta enquadramento depois do
  primeiro `frameTo`/`resetView`.
- **Limites**: o quadro 2D só representa zoom 1..4 — dolly além do teto
  (`zoomForDist` clampa) mostra o quadro no teto ao voltar, e mais longe que
  a chegada vira "cabe tudo"; o pan em zoom 1 é travado por design (o mesmo
  clamp de sempre).
- Verificado: `tsc` limpo, **212 testes** (10 novos: 4 de mapeamento
  quadro↔bancada e ida-e-volta zoom/distância em
  [`pan3d.test.ts`](../src/scene/pan3d.test.ts)
  (`boardToWorld`/`worldToBoard`/`zoomForDist`/`distForZoom`) + 3 do
  `rollCameraBy` reescritos no eixo vertical; 3 de `frameAt` em
  [`zoomMath.test.ts`](../src/editor/zoomMath.test.ts); 3 de `setFraming`
  na store), build ok. Validação dev (`__lab`/`__ed`): 2D→3D com zoom
  2/pan (60,−40) => a célula sob o centro da tela virou (18,12) = o centro
  do viewBox; roda do mouse no 3D => zoom 1→1,13 escrito no quadro; `panBy`
  andou a vista (pan 60→29,5) e o viewBox 2D ao trocar bateu exato
  (189,48 / 117,97 / 160); giro de 0,6 rad moveu o ponto sob (0,05;0,5) de
  (13,12)→(13,14) = a rotação vertical esperada, e o contra-giro devolveu
  (13,12) EXATO; ida e volta 2D⇄3D com a câmera girada manteve o ponto
  (13,14), o centro (16,12) e a store idênticos (ângulos persistidos);
  montagem fresca = bancada inteira (zoom 1); `resetView` devolveu (1,0)
  nos dois lados; **0 erros de console**.

### Girar sem rasgar o desenho (giro de 180°) — onde está

Feito (girar duas vezes mantém o traçado e inverte os terminais):

- **O problema**: a ponta de fio acompanhava SEMPRE o mesmo terminal
  (`reattachWires` mapeava `before[i] → terminalPos(novo, i)`). No primeiro
  giro isso é certo (o terminal foi para cima e o fio vai junto), mas no
  segundo os dois terminais voltam para a horizontal TROCADOS de lugar: os
  fios acabavam trocados de lado e os dois precisavam contornar o corpo do
  resistor — e os dois escolhiam a MESMA faixa (a linha y=4 do laço da Lei
  de Ohm), de modo que a corrente animada corria por baixo do componente,
  como se ele não estivesse no caminho. Era exatamente a "outra estrutura
  de caminho" que não passava pelo resistor.
- **O que é**: `reattachWires` ([`src/core/netlist.ts`](../src/core/netlist.ts))
  separa **girar** de **arrastar** pelo centro: se o centro de `before` é o
  próprio componente, ele girou no lugar — e aí a ponta escolhe, entre as
  duas montagens possíveis (seguir o terminal ou trocar os dois), a que
  **não obriga rodeio** (`needsDetour`: o traçado de uma dobra só bateria
  em corpo/terminal). Empate => vale a montagem de sempre (seguir o
  terminal), que é o que mantém o comportamento antigo nos giros de 90°.
  Quando o centro anda de lugar (arrasto) a escolha não entra: continua o
  arrasto rígido de sempre, e é por isso que arrastar nunca religa um fio
  no terminal errado.
- **Resultado**: 1 giro (90°) = a ponta vai junto com o terminal como
  antes; 2 giros (180°) = o traçado volta **idêntico ao original** (fios
  retos, sem rodeio) e quem se inverte são os **terminais** — o resistor é
  simétrico e nada muda nele, mas numa fonte o +/− troca de lado e a
  corrente inverte (a leitura do resistor foi de +0,09 A para −0,09 A);
  4 giros devolvem o documento original. O terra (1 terminal) continua
  girando no próprio lugar sem mexer em nada (`samePoints`).
- Para saber se é giro sem guardar estado: o centro dos terminais de
  `before` **é** a posição do componente — igual à nova => girou; mudou =>
  arrastou.
- Verificado: `tsc` limpo, **215 testes** (3 novos em
  [`src/core/netlist.test.ts`](../src/core/netlist.test.ts): giro de 90°,
  dois giros com a leitura invertida, terra), build ok. Validação dev
  (`__ed.store`, laço da Lei de Ohm): 1 giro levou `w1`→(10,2) e
  `w2`→(10,4); 2 giros devolveram os 5 fios **IDÊNTICOS** aos originais e
  o SVG ficou reto (`80,48 144,48` e `176,48 224,48`), com os 5 fios
  animando corrente; 4 giros = documento original byte a byte; `undo`
  volta ao estado anterior; **`__ed.log` vazio**.

### Paralelo em escada (retorno contornando por baixo) — onde está

- O que mudou: só o **exemplo** "Paralelo" em
  [`src/editor/examples.ts`](../src/editor/examples.ts) — mesma topologia,
  mesmas leituras (270 mA no total, 90 mA por ramo, sem curto), outro
  traçado.
- Antes: o retorno saía do **meio** do trilho direito (`w11` de (15,4) a
  (3,4)) e voltava em linha reta até o − da fonte. Essa reta atravessava o
  banco inteiro, o [`wireRoute`](../src/core/netlist.ts) marcava o traçado
  como bloqueado (corpo e terminais de r2 no caminho) e desviava por uma
  **fileira vazia** — a do meio. Resultado: o retorno se espremia entre r2
  e r3, parecia passar por dentro dos resistores, e os potenciais ficavam
  ilegíveis (um mesmo fio exibindo duas tensões na tela).
- Agora: escada clássica. O **+ alimenta um trilho à esquerda** (x=8) que
  ramifica nas três entradas; um **trilho à direita** (x=15) coleta as três
  saídas; e o retorno **desce pelo fim desse trilho** (`w11`, (15,6)→(15,9)),
  **contorna por baixo do banco** (`w12`, y=9, abaixo do r3 em y=6) e
  **sobe pela esquerda até o −** — entrando no terminal pela lateral, que é
  a direção de saída dele (rot 0). Um laço fechado, um caminho de corrente
  por fio, sem cruzar o banco.
- Cor por tensão: o lado do + fica laranja (9 V) e o trilho/retorno fica
  cinza (GND, 0 V) — as duas metades do laço se distinguem à mostra.
- Travado por teste em
  [`src/editor/examples.test.ts`](../src/editor/examples.test.ts): o
  retorno tem de sair exatamente `[(15,9),(2,9),(2,4),(3,4)]`, e **nenhum
  fio pode passar pelas fileiras vazias (y=3 e y=5) dentro do banco** (x de
  9 a 14) — a regressão que o teste impede é exatamente o espremimento no
  meio.
- Verificado: `tsc` limpo, **216 testes**, build ok. No dev
  (`__ed.store`, aba do editor): SVG do retorno
  `240,144 32,144 32,64 48,64` (desce, contorna, sobe, entra no −), 12
  fios com trecho de corrente, painel `bat1 270 mA GND → N1` e
  `r1/r2/r3 90 mA N1 → GND`, **`__ed.log` vazio**.

### O mesmo padrão nos outros dois exemplos — onde está

- O padrão da escada era só do Paralelo; o **Divisor** e a **Lei de Ohm**
  ainda eram declarados tortos. O roteador então insere **degraus de 1
  célula** para respeitar a saída dos terminais:
  - Divisor, fio do meio: `(13,2)→(13,7)` saía...

    `13,2 → 14,2 → 14,7 → 13,7`

    ...e o retorno `(3,7)→(3,2)` fazia o espelho disso do lado esquerdo
    (`3,7 → 2,7 → 2,2 → 3,2`).
  - Lei de Ohm: o retorno era declarado em x=3 mas corria em x=2
    (`3,8 → 2,8 → 2,3 → 3,3`) — mesmo degrau, uma coluna fora.
- Agora os três falam a mesma língua: o **nó do meio do Divisor** ganha um
  **trilho à direita** (x=15 — lugar natural para pendurar um voltímetro) e
  o retorno desce pela **base** e sobe pela **coluna da esquerda (x=2)**,
  entrando no − pela lateral; a Lei de Ohm usa o mesmo desenho (o helper
  `LOOP` passou de 5 para 6 retas). Nenhum fio tem degrau longe do terminal.
- Nenhuma leitura mudou: Lei de Ohm 90 mA; Divisor 45 mA com 4,5 V no nó do
  meio; Paralelo 270 mA (90 mA por ramo).
- Travado por teste em
  [`src/editor/examples.test.ts`](../src/editor/examples.test.ts): percorre
  **todos** os exemplos e exige que **todo trecho de 1 célula esteja
  encostado num terminal** — um degrau no meio de uma reta é a assinatura
  de um fio declarado torto. (A entrada de 1 célula no terminal é admitida:
  é o fio entrando no lado para onde o terminal aponta.)
- Verificado: `tsc` limpo, **217 testes**, build ok. No dev, os traçados
  saem retos — Lei de Ohm `5,3 9,3 / 11,3 14,3 / 14,3 14,8 / 14,8 2,8 /
  2,8 2,3 / 2,3 3,3`; Divisor `5,2 11,2 / 13,2 15,2 / 15,2 15,7 /
  15,7 13,7 / 11,7 2,7 / 2,7 2,2 / 2,2 3,2` — e o painel confere
  (Divisor `r1 4,50 V 45 mA N1 → N2`, `N2 4,50 V`), **`__ed.log` vazio**.

### Divisor com leituras todas positivas — onde está

- O problema: na malha em série a corrente entra pelo lado **direito** do
  r2, então ele lia **`−4,50 V | −45 mA`** enquanto o r1 lia `+4,50 V`. O
  sinal negativo não é erro nenhum — é a orientação do terminal `a` —, mas
  no meio da explicação ele pede uma pausa que não ajuda a turma.
- A saída: como o símbolo do resistor é **simétrico**, o `r2` foi colocado
  com `rot: 180` (o `terminal 0` passa para a direita). O desenho fica
  **idêntico** — terminais continuam em (11,7) e (13,7) — e as leituras
  saem positivas: `r1 4,50 V | 45 mA N1 → N2` e `r2 4,50 V | 45 mA
  N2 → GND`.
- Travado por teste em
  [`src/editor/examples.test.ts`](../src/editor/examples.test.ts) dos dois
  lados: a **geometria renderizada** (`wireRoute` das 7 retas, byte a byte)
  e `volts > 0 && amps > 0` nos três componentes — girar o r2 não pode
  mover fio nenhum, e nenhuma leitura pode voltar a sair negativa.
- Verificado: `tsc` limpo, **218 testes**, build ok. No dev: `g.symbol` do
  r2 em `translate(192 112) rotate(180)`, as 7 retas iguais às de antes, e
  o painel `r1 4,50 45 mA N1 → N2 / r2 4,50 45 mA N2 → GND`, **`__ed.log`
  vazio**.
- **Decisão (14/10/2026): manter o SINAL na exibição.** `V` e `I` continuam
  com sinal no `Inspector` e no `Espelho` (`−4,50 V`). O sinal não é defeito:
  é o sentido da corrente no terminal `a → b`, e é matéria da estação de
  Kirchhoff (entrando/saindo do nó). Nos exemplos ele já não atrapalha — os
  três estão com leituras positivas, graças ao giro de 180° do r2. Se um dia
  a turma pedir valor absoluto, a troca é pequena (`formatAmps` + o `toFixed`
  do `V` no `Inspector` e no `Espelho`); **o CSV e os desafios não mudam**:
  o relatório guarda o valor cru de `readCircuit` e os verificadores leem
  por módulo (o desafio de série passou a agrupar por `Math.abs(amps)`
  justamente para não reprovar série com um resistor girado).

### Desafios com verificação automática — onde está

- O problema: a bancada media e mostrava tudo, mas **ninguém dizia ao aluno se a
  tarefa foi cumprida** — o professor checava três resistores na mão, um a um.
  A Fase 4 pedia "desafios com verificação automática"; é o que entrou agora.
- O que é: [`src/editor/challenges.ts`](../src/editor/challenges.ts) é uma lista
  fechada de seis tarefas — **Acenda a lâmpada, Lei de Ohm, Divisor de tensão,
  Três em paralelo, Três em série, A chave** — cada uma uma função **pura**
  `check(doc, reading)`: `null` = conseguiu; string = o próximo passo, dito como
  dica acionável e com o número na mão ("O nó mais alto está em 9,00 V — precisava
  de 4,50 V", "A chave está ABERTA — clique nela (sem arrastar)"). Nada de estado
  escondido: a mesma bancada avaliada duas vezes dá o mesmo resultado, então
  **cada desafio é teste de unidade** e o professor pode confiar na marcação.
- Onde aparece: no topo do painel de Medições, seis botões de 46 px com
  `data-hand="challenge:<id>"` (a pinça escolhe) e o veredito embaixo, ao vivo —
  é o mesmo número que o aluno está olhando (90 mA) que aprova ou reprova.
- **O espelho recebe o desafio pelo fio, mas recalcula o veredito sozinho**: o
  protocolo ganhou o campo `k` (aditivo, sem bump de versão — sem `k` ou com id
  que o outro lado não conhece, vira `null`) e o `Espelho` roda o MESMO `check`
  sobre o MESMO doc. Assim a projeção lê a mesma tarefa e não tem como
  discordar da bancada: a veredito não viaja pelo fio, quem julga é a conta.
- Um detalhe que o modelo real ensinou: **a chave não é componente do solver**
  (fechada ela vira união de nós, `netA = netB`), então "passa pela chave" é os
  dois terminais num nó só **+** corrente em algum lugar do laço; e **0 A em três
  resistores soltos não é série**, por isso o grupo de corrente só conta quem
  conduz de verdade.
- Travado por teste em
  [`src/editor/challenges.test.ts`](../src/editor/challenges.test.ts): os seis na
  lista com id único; **nunca aprova o quadro vazio** (sempre há dica); o Divisor
  aprova o exemplo; o Paralelo é **reprovado** no desafio de série por
  compartilhar nós ("estão em paralelo, não em série"); a Lei de Ohm aponta
  `45 mA` onde faltam `90 mA`; chave aberta manda clicar; e a avaliação é pura
  (mesmo veredito, doc intocado). Mais um teste novo em
  [`src/mirror/mirror.test.ts`](../src/mirror/mirror.test.ts): o desafio sobe e
  desce pelo fio e id desconhecido vira `null`.
- Verificado: `tsc` limpo, **228 testes**, build ok. No dev, com o Paralelo
  carregado: *Lei de Ohm* → `challenge ok` + "Circuito aprovado ✓" (cada 100 Ω
  ali vê os 9 V inteiros ⇒ 90 mA), *Divisor* → "O nó mais alto está em 9,00 V —
  precisava de 4,50 V…", *Três em série* → "Esses três compartilham nós: estão
  em paralelo, não em série." E de ponta a ponta no espelho (`Espelhar` +
  `mirror.html` em outra aba, `ao vivo`): a faixa "Desafio: Lei de Ohm /
  conseguiu ✓" aparece com o **mesmo** veredito calculado do outro lado.

### Estação de Kirchhoff — leitura por nó — onde está

- O problema: a bancada dizia a tensão de cada nó (`Tensão dos nós`) e a
  corrente de cada componente, mas **a 1ª lei de Kirchhoff não aparecia em
  lugar nenhum** — o aluno não conseguia conferir, num nó, o que entra menos o
  que sai. (A estação 3 do escopo é "nós e malhas": os **nós** entraram aqui;
  as **malhas**, na seção seguinte.)
- O que é: [`src/core/kirchhoff.ts`](../src/core/kirchhoff.ts) → `porNo(reading)`
  reorganiza a MESMA leitura do solver por nó: para cada junção, os **ramos**
  com o **sentido relativo àquele nó** — `entra`/`sai`, e o mesmo ramo é "sai"
  num nó e "entra" no outro, porque a corrente anda de `netA` para `netB`
  quando `amps > 0` —, e a conta `Σ(entram) − Σ(saem)`.
- A lei vale **por construção** (é o que o solver impõe para achar o circuito),
  então o valor da estação é **ler e confirmar**, não descobrir. Por isso o Σ
  nunca vem "errado": ele flutua em ~1e-16 por ponto flutuante (`KCL_TOL`
  cobre), nunca um defeito a corrigir — e a seção fica verde.
- Detalhes de modelo travados por teste: **ramo parado (0 mA) não ganha lado**
  (dizer "entra 0 mA" ensinaria errado — é `sentido: null`); **resistor curto
  não infla a junção** (derrubado pelo solver, não vira dois ramos); **um ramo
  só não é nó de Kirchhoff** (a lei ali vale sozinha, não há junção para
  conferir); e **sem solução não há conta** — `reading.error` ⇒ lista vazia,
  com o aviso vermelho já em cima.
- Onde aparece: [`src/editor/Kirchhoff.tsx`](../src/editor/Kirchhoff.tsx) é a
  MESMA tabela no painel (logo depois de "Tensão dos nós") e no rodapé do
  `Espelho` (letra de projeção, 16 px) — as duas rodam `porNo` sobre o
  `reading` local, então nada novo viaja pelo fio e elas não têm como
  discordar.
- Junto entrou o **7º desafio — "Nó de Kirchhoff"**: achar um nó com **3
  ramos**. O Paralelo aprova de cara (dois nós de 4 ramos); a série reprova
  com "O nó mais cheio tem 2 ramos — a 1ª lei de Kirchhoff quer um nó com
  3 ramos."
- Verificado: `tsc` limpo, **238 testes** (6 novos em
  [`src/core/kirchhoff.test.ts`](../src/core/kirchhoff.test.ts), 2 da varredura
  dos exemplos, 1 do desafio), build ok. No dev, com o Paralelo carregado:
  `GND | entram 270 mA · saem 270 mA · Σ 0 mA` com `bat1 Fonte sai 270 mA` e
  os três `entra 90 mA` (Σ em verde); no espelho de outra aba, a MESMA tabela
  em 16 px com o desafio "conseguiu ✓"; e duas fontes ideais em conflito ⇒
  seção some, vermelho do erro no lugar. A **2ª lei (malhas)** entrou logo na
  seção seguinte.

### Estação de Kirchhoff — 2ª lei (malhas) — onde está

- O problema: a 1ª lei mostrava a corrente entrando e saindo de cada nó, mas
  a **2ª lei não tinha por onde ser lida** — sem um percurso escrito o aluno
  não conseguia "andar" no laço somando tensões. (Estação 3 do escopo:
  "nós **e malhas**" — as malhas faltavam.)
- O que é: `malhas(reading)` (no MESMO
  [`src/core/kirchhoff.ts`](../src/core/kirchhoff.ts)) monta a **base de
  malhas independentes**: uma volta para cada aresta que não entrou na árvore
  de ligação — isso é **E − V + C** de grafos, a MESMA base de voltas
  independentes que a análise de malhas usa na escola (o número de voltas
  independentes, não todas as que o desenho deixa imaginar).
- Cada volta sai de **`GND`** quando passa por ele, e o sentido é escolhido
  para atravessar a fonte **do − para o +** (o jeito do livro começar a
  conta). Daí a leitura: `bat1 Fonte +9.00 V sobe`, `r1 Resistor −4.50 V cai`
  — **o mesmo número da tabela de leituras** (|V(a) − V(b)| não muda quando os
  terminais trocam de lado), com o sinal da volta em cima. O percurso aparece
  escrito: `GND → N1 → N2 → GND`.
- Assim como a 1ª lei, o `Σ` é zero **por construção** (o solver acha tensões
  de nó; volta fechada fecha por definição) — ler e conferir é o trabalho da
  estação. Caso de aula travado por teste: **chave aberta** — a volta existe,
  a tensão inteira (`−9.00 V`) fica na chave e o resistor parado lê `0.00 V`,
  **nem sobe nem cai** (o mesmo cuidado do ramo de 0 mA: parado não tem lado).
- Fora da conta: ramo curto não vira volta (derrubado pelo solver), laço
  aberto não tem volta, e `reading.error` ⇒ lista vazia (o aviso vermelho já
  está em cima).
- Onde aparece: a MESMA [`src/editor/Kirchhoff.tsx`](../src/editor/Kirchhoff.tsx)
  — a seção "Kirchhoff — tensão nas malhas" entra logo depois da de nós, no
  painel e na projeção do `Espelho`, calculada das duas partes sobre o
  `reading` local (nada novo viaja pelo fio).
- Junto entrou o **8º desafio — "Malha de três"**: uma volta com **3
  elementos** (a fonte + dois no mesmo laço). O Divisor aprova; a Lei de Ohm e
  o Paralelo reprovam com "Sua volta maior tem 2 elementos — a 2ª lei quer 3:
  fonte + dois no mesmo laço."
- Verificado: `tsc` limpo, **246 testes** (6 novos em
  [`src/core/kirchhoff.test.ts`](../src/core/kirchhoff.test.ts) — partida em
  GND, série dividindo 9 = 4,5 + 4,5, paralelo com **3 − 2 + 1 = 2** voltas
  independentes, chave aberta, ramo curto, sem laço e sem solução —, 1 da
  varredura dos exemplos — as independentes são **1, 1 e 3** — e 1 do desafio),
  build ok. No dev: o Divisor mostra `Volta 1 · 3 elementos` com `Σ 0.00 V` em
  verde, `bat1 +9.00 V sobe / r1 −4.50 V cai / r2 −4.50 V cai` e percurso
  `GND → N1 → N2 → GND`; o Paralelo mostra **3 voltas** `GND → N1 → GND`
  (fonte + um resistor cada); e no espelho de outra aba, `ao vivo`, com as
  duas seções em letra de projeção e a faixa "Desafio: Malha de três /
  conseguiu ✓".

### Questão na tela + relatório JSON — onde está

Feito (fim da camada de sala de aula do roadmap — o que faltava do Fase 4):

**Questão na tela (modo professor)**
- **O que é**: campo **Questão da aula** no painel, antes dos desafios
  ([`src/editor/Inspector.tsx`](../src/editor/Inspector.tsx) — `maxLength` =
  `QUESTAO_MAX`, alvo de 46 px como os trilhos). A pergunta viaja pelo fio do
  espelho (campo `q`, aditivo como `k`/`f` — sem bump de versão) e vira um
  cartão no TOPO da projeção em letra `clamp(20px, 2.6vh, 30px)`: a turma lê do
  fundo da sala.
- **Regra do cartão**: com questão escrita ⇒ ela (rótulo "Questão da aula");
  vazia com desafio ativo ⇒ o **enunciado** do desafio (rótulo "Desafio"); sem
  as duas ⇒ nada. O rodapé do espelho ficou com **título + veredito** só — o
  enunciado saiu de lá para não duplicar o que subiu para o topo.
- **O fio não confia em quem manda**: `textoLivre()`
  ([`src/mirror/protocol.ts`](../src/mirror/protocol.ts)) transforma o que
  chega em UMA linha limpa — o que não é string vira `''`, controle vira
  espaço, espaço vira espaço, `.trim()` e corte em `QUESTAO_MAX` (200). Número
  manda pergunta vazia, cola de terminal com quebra de linha não quebra o
  cartão e pergunta gigante não derruba a projeção.
- **Veredito continua puro**: a questão não tem conferência (é enunciado, não
  tarefa); quem confere continua sendo o `check(doc, reading)` do desafio,
  recalculado em cada tela.

**Relatório JSON**
- **O que é**: botão **JSON** na barra ([`src/editor/App.tsx`](../src/editor/App.tsx)),
  irmão do CSV (mesmo desenho: desativado com o quadro vazio, `data-hand="json"`,
  download 100 % local por Blob), baixa `handphys-circuito-AAAA-MM-DD.json`.
- **Mesmo dado, forma de máquina**: `jsonReport(doc, reading, desafio)`
  ([`src/editor/report.ts`](../src/editor/report.ts)) devolve `schema` assinado
  e `geradoEm`; a **montagem crua** (`circuito.componentes` + `circuito.fios` —
  reconstrói o circuito inteiro, coisa que o CSV não faz, sem fios); uma
  `leitura` por componente (valor em **SI puro**, sem prefixo de etiqueta —
  capacitor em `F` —, tensão, corrente e os dois nós; chave com
  `estado: fechada|aberta`); `nos` com GND primeiro; `desafio` (id, título,
  `ok` e dica quando reprovado — o MESMO `check` do painel, recalculado na
  hora); e `erros.solver` + `diagnosticos`.
- **Número de máquina**: ponto decimal e arredondamento em 9 casas só para tirar
  a poeira do float (`4.50000000001 ⇒ 4.5`); vírgula decimal é conversão de
  planilha, não de JSON.
- Verificado: `tsc` limpo, **254 testes** (1 novo do fio da questão — ida e
  volta, número vira `''`, cola vira UMA linha cortada em `QUESTAO_MAX` — e 7
  novos do JSON — assinatura + fios cruos, 9 V/0,45 A em SI, GND primeiro,
  chave fechada/aberta, capacitor em `F`, veredito do desafio, vazio válido),
  build ok. No dev: pergunta escrita no painel aparece no cartão do espelho de
  outra aba (`ao vivo`); apagada ⇒ cartão vira "Desafio" com o enunciado e o
  rodapé fica `Desafio: Divisor de tensão / conseguiu ✓`, sem duplicar; o JSON
  do Divisor abre com `N2 = 4.5 V`, `r2 = 100 Ω / 45 mA` e 7 fios.

### Responsividade mobile — onde está

Feito (o plano pedia "celular na bancada" desde a Fase 0; até aqui o editor era
só desktop — **um único media query** em todo o CSS):

- **Celular é bancada, não console**: em janela estreita (`max-width: 760px`)
  a barra dispensa o título, o painel de medições deixa de ser coluna e vira
  **gaveta de baixo** — botão-pílula **Medições** fixo no pé (46 px, alvo de
  toque; `aria-expanded` e `data-hand="painel"` para a pinça), gaveta com
  `max-height: 58vh`, sombra e `overscroll-behavior: contain`; fechada ela
  `translateY(110%)` + `visibility: hidden` (some até do Tab). A bancada fica
  com a altura **inteira** (705 px em 390 × 844) e as colunas do `.body` viram
  uma só (`grid-template-rows: minmax(0, 1fr)` — a gaveta é `fixed` e sai do
  fluxo).
- **Aberto ou fechado na chegada**: `matchMedia('(max-width: 760px)')` lido
  **uma vez** no [`src/editor/App.tsx`](../src/editor/App.tsx) — desktop nasce
  com o painel à vista (como sempre esteve), celular nasce com a bancada limpa;
  depois quem decide é o aluno, e o estado não briga com a media query (o CSS
  manda na gaveta, o React manda no rótulo/`aria-expanded`).
- **Nada mudou no desktop**: medido na janela de 1000 px — duas colunas
  `680px 320px`, `<h1>` visível, pílula fora (`display: none`); os trilhos
  continuam em coluna ao lado do quadro, e a **container query** que já existia
  segue de fallback para bancada < 600 px com janela acima de 760 px
  (sobreõem as bordas, como sempre).
- **Trilhos em faixas horizontais** (o pedido: "containers de itens ACIMA e
  ABAIXO, com scroll horizontal adaptado à web e ao mobile"): em janela
  ≤ 760 px a bancada vira **grid de três linhas** (`auto minmax(0, 1fr) auto`)
  — lixeira/componentes/fio **em cima**, vista/cores/zoom **embaixo** e o
  quadro com a **sobra** de altura no meio; cada trilho vira fileira com
  `overflow-x: auto`. No **toque** o dedo arrasta (a barra some em
  `hover: none`); com **mouse**, barra fina de 6 px ou a própria **roda** —
  `deslocDaRoda()` em [`src/editor/Rails.tsx`](../src/editor/Rails.tsx)
  traduz `deltaY` em rolagem lateral (trackpad manda `deltaX` nativo e fica
  com o navegador; roda antiga em linhas/páginas volta para pixels), com 4
  testes em [`src/editor/rails.test.ts`](../src/editor/rails.test.ts).
  O `@media` é obrigatório aqui: **`@container` só estiliza descendentes do
  contêiner** e o `.canvas-view` É o contêiner — dentro da container query ele
  ficava de fora (medido: `display` continuava `flex`, trilhos com
  `width: 100%` e o quadro espremido a 2 px). A `.canvas` ganhou
  `padding-bottom: 62px` para a pílula **não** cobrir a faixa de baixo.
  Medido no iframe de 390 × 844: grid `98px 404px 135px`, os 8 itens na mesma
  fileira, roda rolando 150 px, pílula 9 px abaixo da faixa, `scrollHeight`
  dentro da bancada; em 800 × 600 (desktop estreito) o fallback overlay
  continua intacto (trilhos a 6–7 px das bordas, quadro quadrado 454 px).
- **Espelho no celular** ([`src/mirror/espelho.css`](../src/mirror/espelho.css)):
  letra de toque — tabela 14 px, cartão de questão 18 px (fora do `clamp`),
  cabeçalho e rodapé mais enxutos e rodapé com 48 vh — em 390 px a leitura
  **não rola na horizontal**.
- **Landing com CSS de verdade**: [`index.html`](../index.html) não tinha
  `<link>` nem `<script>` — no build a página saía **crua** (os estilos
  `.landing` do [`spike.css`](../src/styles/spike.css) nunca eram pedidos).
  Agora o link está no `<head>`, a landing ganhou padding de celular
  (`max-width: 600px`) e um entry novo aponta o **espelho** (a página existia
  e não era listada). [`src/styles/landing.test.ts`](../src/styles/landing.test.ts)
  trava as três pontas (link do CSS, viewport de aparelho e hrefs das páginas
  da sala) — sem CSS ligado, o teste falha antes de qualquer deploy.
- Verificado: `tsc` limpo, **261 testes** (3 novos da landing + 4 da roda no
  trilho), build ok (a
  landing sai com `<link … href="/assets/spike-*.css">`). No dev, medido dentro
  de um **iframe de 390 × 844** (a media query responde ao viewport do iframe):
  editor — pílula visível de 46 px, `<h1>` escondido, gaveta escondida
  (`visibility: hidden`, `translateY(538px)`) e, ao tocar, gaveta de 490 px
  com `aria-expanded="true"` e rótulo "Fechar medições"; desktop — duas
  colunas, sem pílula; espelho `ao vivo` — tabela 14 px, 3 linhas + 1 malha e
  **sem rolagem horizontal**; landing — fundo `#0d1117`, padding 28/16 px e os
  cinco links.

### Integração: um app, uma porta, três telas — onde está

- **Shell do app**: `src/main.tsx` — monta as telas do hash com `React.lazy` (`Bancada`, `Espelho`, `Sala`), roda `bootFromLink()` **antes** do React montar (o `?c=` entra sem frame em branco) e põe o `document.title` por vista. O gancho `__ed` de dev importa o hands **dinâmico** (o bloco `DEV` é cortado em produção — nada do tracking vira o peso das outras telas).
- **Rotas**: `src/rotas.ts` (`viewDaHash`, `TITULOS`) — `#/` (ou nada) = bancada, `#/espelho` = projeção, `#/ajuda` (alias `#/sala`, `#/inicio`) = sala; rota desconhecida cai na bancada (link podre não vira tela em branco). **Hash, não History API**: o deploy é estático em subdiretório (GitHub Pages) e o link `?c=…#/espelho` precisa sobreviver a QR antigo sem rewrites de servidor.
- **Páginas de entrada**: `index.html` = shell (`#root` + módulo + `<noscript>`); `editor.html` e `mirror.html` = **redirecionamentos** clássicos (~600 B) que preservam a query **inteira** (`?c=` do circuito e `?sala=` da sala na rede) — todo QR impresso continua entrando; `spikes/index.html` = estante de desenvolvimento (os spikes saíram do produto); `cardboard.html` = **intocado**, vista própria do celular.
- **Sala (ajuda)**: `src/Sala.tsx` + `src/styles/sala.css` — a antiga landing virou tela de "como usar" dentro do app: os 3 passos da aula (montar → projetar → cardboard) e o link da estante. CSS **escopado em `.sala`** (sem `body`/`:root` globais: o chunk da rota entra depois e não pode apontar o resto do app quando as telas trocam no mesmo documento — por isso `spike.css` não foi reaproveitado; ele tem `body` global).
- **Share**: `shareLinks(doc)` em `src/editor/share.ts` devolve os **três destinos** do mesmo circuito (`bancada` `?c=`, `espelho` `?c=…#/espelho`, `cardboard` `cardboard.html?c=`) e `appBase()` paga o nome de página que o dev ainda estiver usando; `swapPage()` morreu. O `src/editor/ShareDialog.tsx` ganhou o seletor **PC / Celular / Projetor** (lembra a última escolha). `mirrorUrl()` do `src/mirror/peer.ts` gera `?sala=…#/espelho` e o *Abrir espelho* do `src/editor/MirrorToggle.tsx` abre a rota na **mesma janela de navegação**, herdando o `?c=` atual.
- **Identidade**: a bancada ganhou o link **Ajuda** na barra (o antigo "Voltar" apontava para a landing, que morreu) e o h1 virou "handphys — bancada"; o espelho ganhou o discreto `.espelho-volta` ("bancada", `href="#/"`) — quase invisível na projeção, um clique no PC.
- **Cardboard continua página própria — de propósito** (decisão registrada com o usuário): virar rota do app custaria ~45 kB gz de React no celular da escola e exigiria refactor do gate/alarme vanilla — o alarme é script **clássico** no HTML e só roda se o módulo não rodar, justamente o caso que ele cobre (rede lenta). Unificação total ficaria para um passo futuro, com medição de payload antes/depois.
- **Cobertura**: `src/styles/landing.test.ts` (shell = `#root` + módulo e **sem** menu de links; redirects preservam a query; cardboard intacto com `__cbReady`; estante com CSS ligado e volta), `src/rotas.test.ts` (hash → vista, alias, fallback, caixa, títulos distintos), `share.test.ts` (três destinos, mesma payload, barra final da base, base vazia no node) e `peer.test.ts` (link da sala na rota). Total: **274 testes**.
- **Verificado no navegador** (dev): `/editor.html?c=` → `/?c=` com chip "vindo do link" e circuito na bancada; `/mirror.html?c=` → `/?c=…#/espelho` com o circuito do QR (4 linhas, título novo, volta); `/mirror.html?sala=K7QW3` → rota com chip "procurando a sala…"; `#/ajuda` com os 3 passos e links certos; share com os 3 destinos (PC = padrão, sem `#`); volta espelho → bancada por hash sem reload; mobile 390 px (gaveta + faixas `98px/404px/135px`); cardboard (gate, alarme, sem React) e estante com **0 erros** de console.

### Portão do cardboard: botão do circuito carregado invisível — onde está

- **Sintoma** (reportado pelo usuário na tela do celular): o **primeiro item** do portão do cardboard saía "vazio" — só o azul do botão, sem texto.
- **Causa medida em produção**: o botão do circuito CARREGADO recebe a classe `.active-example` (o `i === 0` nasce carregado) e a regra `button.active-example { color: #58a6ff }` pintava o texto do **mesmo azul do fundo** do botão (`background: #58a6ff`). Sonda no ar: `color === backgroundColor === rgb(88, 166, 255)` no primeiro botão — o texto "Lei de Ohm" existia, só era invisível; os outros dois seguiam com o texto escuro normal.
- **Correção**: estado **invertido** — `background: #0a0d12` (escuro) + texto e borda `#58a6ff` (`src/cardboard/style.css`): continua legível como "selecionado" no painel escuro do portão.
- **Trava**: `src/cardboard/style.test.ts` — a regra `.active-example` tem que existir e a cor do texto tem que diferir do fundo (o próprio, ou o do `button` base como fallback) — a comparação que pegaria o azul-sobre-azul. O teste lê o CSS por `node:fs` (`?raw` de `.css` volta vazio no vitest: o pipeline de CSS intercepta) e, como o tsconfig é de browser sem `@types/node`, a superfície usada está declarada em `src/cardboard/fs.d.ts`. **276 testes**.
- **Conferido no ar**: `cardboard.html` de produção — primeiro botão com texto "Lei de Ohm", `background: rgb(10, 13, 18)` e texto azul; 0 erros de console.

### Estação RC — carga e descarga, τ e o osciloscópio — onde está

- **Núcleo puro** ([`src/core/rc.ts`](../src/core/rc.ts)): `rcStation(doc, capId?)` devolve `{ capId, temFonte, temChave, carga, descarga }`, cada regime uma `RcCurve` (`v0`, `vinf`, `tau`, `window`, `t[]`, `v[]`, `i[]`) ou `null`. Tudo função pura do documento e nada de relógio: o espelho recalcula a MESMA curva do MESMO doc, então a projeção não tem como discordar da bancada (a filosofia da estação de Kirchhoff).
- **O par carga/descarga do livro não existe com UMA chave simples** (descoberta ao desenhar o exemplo): na topologia fonte — chave — R — C, abrir a chave não fecha laço nenhum (o capacitor fica carregado e pronto); e na R ∥ C a fonte ideal curto-circuita o resistor, dando τ = 0. Quem resolve na bancada de verdade é a chave **comutadora de duas posições**, cuja 2ª posição troca a fonte por um fio — que é `semFontes(doc)`: cada `vsource` vira uma chave fechada (= fio). Carga = chaves fechadas com as fontes (v0 = 0); descarga = o mesmo com as fontes trocadas por fio, partindo do regime que a carga alcança (`carregado()` lê o DC da variante fechada). No RC de sempre os dois τ coincidem **por construção**; num circuito em que cada regime vê um resistor diferente, os τ saem diferentes — e a tela mostra os dois, que é a lição.
- **O τ é medido como o osciloscópio mede**: `medirTau(t, v, v0, vinf)` acha o cruzamento de `v0 + 63,2%·(vinf − v0)` (`TAU_FRACAO = 1 − e⁻¹`) **interpolado** entre as duas amostras que o abraçam — vale subindo (carga) e descendo (descarga), porque o alvo está sempre entre v0 e vinf; sem salto (`|vinf − v0| < 1e-12`) devolve `null` em vez de inventar um τ na reta parada.
- **A escala do tempo é descoberta, não suposta**: ΣR é limite superior do R de Thévenin visto pelo capacitor (R_th ≤ ΣR — paralelo só diminui), então a janela começa em ΣR·C/64 e **dobra** até a curva assentar (sobra ≤ 0,5% do salto, `ASSENTOU`), com tetos `MAX_DOBRAS = 40` e `JANELA_MAX = 1e12 s` para circuito que não condiciona; medido o τ, roda uma passada FINA de 400 amostras em 4,5 τ — é essa a janela plotada, então o eixo do tempo cai sempre em "0 … ~4,5 τ" (o τ mostrado é o da passada fina; a grossa só deu a escala, e é por isso que a janela fica ~1% acima de 4,5 τ).
- **Recusas honestas**: sem capacitor não há estação (`rcStation` → `null`); capacitor de valor zero é derrubado pelo solver ⇒ curva `null`; sem resistor (capacitor direto na fonte) não há escala ⇒ `null`; circuito sem solução (montagem pela metade, matriz singular) cai no `try` do `simulate` ⇒ `null` e a tela mostra a dica em vez de uma curva inventada; sem fonte (`temFonte: false`) a tela diz que não há o que carregar.
- **O osciloscópio** ([`src/editor/Rc.tsx`](../src/editor/Rc.tsx)): SVG `288 × 132` com as duas curvas (a do regime escolhido acesa, a outra apagada), a linha dos 63,2%, a marca do τ no eixo do tempo, os números de ponta (τ medido, V final) e a leitura da varredura (V · I no instante). O seletor **Carregar / Descarregar** (`data-hand="rc-carga"` / `"rc-descarga"`) é a chave comutadora na tela e *Rodar de novo* (`data-hand="rc-replay"`) repete a varredura. A varredura (traço crescendo + bolinha correndo) é enfeite LOCAL de cada tela — `requestAnimationFrame`, reiniciada a cada mexida no doc, `prefers-reduced-motion` entrega a curva pronta e **aba escondida** também (sem foco o rAF não roda: melhor a curva inteira que uma curva de 2 pontos parada no zero; e o timestamp do rAF pode vir ANTES do `t0` do efeito no mesmo quadro, daí o piso em zero).
- **Onde aparece**: painel de Medições ([`src/editor/Inspector.tsx`](../src/editor/Inspector.tsx), logo depois da estação de Kirchhoff) e rodapé da projeção ([`src/mirror/Espelho.tsx`](../src/mirror/Espelho.tsx)) — as duas telas usam o MESMO componente. CSS: bloco `.rc` em [`src/styles/editor.css`](../src/styles/editor.css) e letra de sala em [`src/mirror/espelho.css`](../src/mirror/espelho.css).
- **Junto, um conserto de integração**: o `espelho.css` tinha ficado **sem import** desde a integração de um app só (o antigo `src/mirror/main.tsx` o importava e morreu na unificação), então a projeção vinha saindo com letra de bancada desde `48b53c7`. O `Espelho.tsx` (chunk preguiçoso) voltou a importá-lo: medido no dev, `.rc-nums` e `.kirchhoff .nos` dão **16 px na projeção** contra 12 px na bancada, e o CSS sai no chunk `Espelho-*.css` (~3,4 kB) — quem abre a bancada não paga.
- **O 4º exemplo** ([`src/editor/examples.ts`](../src/editor/examples.ts)): "Circuito RC" — fonte 9 V → chave → 1 kΩ → 1000 µF, tudo em **série** numa fileira, com o retorno contornando por baixo do banco (`[(16,9),(2,9),(2,4),(3,4)]`). τ = R·C = **1,0 s** com números redondos de propósito (dá para acompanhar com o dedo) e o capacitor carrega até os 9 V da fonte. Em regime permanente o capacitor é circuito aberto: a tabela de leituras mostra 9,00 V e 0 A nele — quem mostra o instante da chave é a estação RC logo abaixo.
- **Testes** ([`src/core/rc.test.ts`](../src/core/rc.test.ts)): carga de 0 a 9 V com τ = R·C medido nos 63,2% (curva monótona valendo 0,632 do caminho em t = τ), corrente inicial de 9 mA caindo a zero e a 36,8% em t = τ, τ dobrando com C e caindo à metade com R/2; descarga partindo do valor carregado até zero com o **mesmo** τ e a corrente invertida; `semFontes` trocando só as fontes por fio; `medirTau` unitário (subindo, descendo e `null` na reta); as recusas (sem capacitor, valor zero, sem fonte, montagem pela metade) e a pureza (dois cálculos, os mesmos números). Em [`src/editor/examples.test.ts`](../src/editor/examples.test.ts) o 4º exemplo entra na conta de malhas (`[1, 1, 3, 1]`) e ganha teste próprio (9,00 V e 0 A no capacitor, τ ≈ 1 s). Total: **292 testes**.
- **Verificado no navegador** (dev): exemplo *Circuito RC* na bancada — τ medido 1,0 s, V final 9,00 V, rótulos "63%", τ e "4,6 s" no eixo, curva acesa de (42, 105) a (278, 20) com a outra apagada, 3 alvos de mão (`rc-carga`, `rc-descarga`, `rc-replay`); no regime *Descarregar*, 9,00 V → 0,00 V com −9 mA; rota `#/espelho` com a MESMA estação e letra de projeção (17 px no título, 16 px nos números); abrir a chave do circuito mantém as curvas (são canônicas); apagar o capacitor faz a seção sumir; chave fora do lugar ⇒ aviso "matriz singular" do solver e a dica no lugar da curva; cardboard com os **4 circuitos** ("WebGL ok · bancada pronta (4 circuitos)"), primeiro botão legível (fundo `rgb(10,13,18)`, texto azul) e **0 erros** de console em todas as telas.

### Tema claro/escuro + Painel de Medições v2 + barra arrumada — onde está

A reforma visual pedida pelo professor: manter as funções, arrumar a cara, os textos de auxílio e os nomes. O diagnóstico (auditoria de tela inteira) foi: barra com 12 controles sem hierarquia (quebrava em 3 linhas), jargão cru sem explicação, blocos de texto longos e fontes de 9–11 px onde o aluno deveria ler.

- **Tema: um documento, dois conjuntos de nomes.** [`src/editor/theme.ts`](src/editor/theme.ts) é um singleton minúsculo (`useSyncExternalStore`, fora do store do zustand de propósito): o tema é propriedade do DOCUMENTO (`[data-theme]` no `<html>`), não do circuito — não deve viajar no link `?c=` nem no fio do espelho. `temaInicial(guardado, sistema)` faz a escolha salva vencer o `prefers-color-scheme` e o escuro ser o padrão; `iniciarTema(document.documentElement)` roda em [`src/main.tsx`](src/main.tsx) **antes do React montar** (mesma razão do `bootFromLink`: quem escolheu o claro não pode levar um piscar escuro a cada recarga); `aplicarTema` escreve `dataset.theme` **e** `style.colorScheme` (os campos nativos e as barras de rolagem do navegador não leem variável CSS); `trocarTema` grava em `handphys.tema` com `try/catch` (aba privada com storage bloqueado não derruba nada).
- **Os tokens.** [`src/styles/editor.css`](src/styles/editor.css) começa com o bloco `:root` (paleta escura, a casa do handphys — nasceu para o projetor e o visor do cardboard) e o mesmo conjunto em `[data-theme='claro']`. Nome por **função**, nunca por cor: `--sunken` é o poço (quadro, campos), `--card` a superfície dentro do painel, `--raise` o realce (hover, cabeçalho), `--viz` o fundo de gráfico, `--rail` o trilho flutuante, `--flow` as gotas de corrente, `--on-accent` o texto em cima do botão de acento. Todo o resto do app (inclusive [`src/mirror/espelho.css`](src/mirror/espelho.css) e [`src/styles/sala.css`](src/styles/sala.css)) passou a pintar por eles — eram 45 cores soltas no `editor.css`.
- **O quadro 2D por tema.** [`src/editor/symbol.tsx`](src/editor/symbol.tsx) ganhou `CORES_QUADRO: Record<Tema, CoresQuadro>` e o `Symbol` lê o tema por dentro do componente (`useTema()`), sem prop nova nos três lugares que o desenham: o tema claro tem **tabuleiro branco**, e o interior das peças (que existe para o fio não aparecer por dentro do símbolo) tem de ser branco também, com o traço escurecido (`#1f2937`) e o âmbar da chave mais fechado — o desenho continua legível nos dois fundos. Já grade, fio em repouso, fio-rascunho e anéis de encaixe saíram do TSX para classes CSS (`.grid-line`, `.wire-line`, `.draft-line`, `.ring`), porque `var()` não vale em atributo SVG. A escala de tensão ([`src/editor/colors.ts`](src/editor/colors.ts)) **não** mudou: ela é física e vale nos dois fundos.
- **O 3D e o cardboard mantêm a própria paleta.** A bancada three.js tem iluminação própria (âmbar de filamento, sombra) e o cardboard é um visor: pintar por token de tema deixaria a bancada lavada. Ficou anotado como próximo passo — o que muda de tema hoje é a UI, o quadro 2D e o painel.
- **Painel de Medições v2.** [`src/editor/Inspector.tsx`](src/editor/Inspector.tsx): cabeçalho com ícone, subtítulo de uma linha, e cada assunto num **cartão** (`.card`) com ícone, título em letra de gente (17 px no painel, 14 px no cartão — contra 12 px em caixa alta) e uma linha de apoio; o **nome técnico de prova** não desaparece, ganha um **selo** ao lado do título (`1ª lei de Kirchhoff`, `2ª lei de Kirchhoff`, `constante τ`, `nó`) — é ele que o aluno reencontra na prova. A tabela de leituras virou **quatro colunas** (Peça · V · I · Nós) com o valor **embaixo do nome** (com cinco colunas "1.000 Ω" e "0 mA" quebravam no meio em 340 px), o ícone da peça na frente e `white-space: nowrap` nos números; a tensão de cada nó ganhou **barrinha proporcional** (comparar sem ler o número); o vazio virou convite; o cartão *Editar* mostra a explicação da peça (`KIND_HINT`); e o painel de Mãos trocou o parágrafo de 8 linhas por uma lista de três gestos (*Pinça*, *Zoom*, *Mão que comanda*).
- **Uma fonte só para os nomes.** [`src/core/kinds.ts`](src/core/kinds.ts) tem `KIND_LABEL` e `KIND_HINT`; as cinco cópias (`Inspector`, `Kirchhoff`, `report`, `Espelho`, `cardboard/main.ts`) e os rótulos dos trilhos passaram a importar de lá. O `cardboard` importa o módulo puro sem levar React junto (é o mesmo caminho que ele já usava para `readCircuit`).
- **A barra do topo.** Medida na janela real: 12 controles iguais, quebra em **3 linhas** (133 px de 379 px de altura!). Agora há **grupos** com separador (Ajuda · exemplos · projetar/compartilhar · `⋯ Mais` · tema), o que é de fim de aula (CSV, JSON, Limpar) mora num **`<details>` nativo** (`data-hand="mais"`, sem estado no React, fecha clicando de novo) e abaixo de 1100 px a marca vira só o ícone para a barra caber em **uma linha** (51 px medidos). O link *Ajuda* ganhou área de dedo/pinça como os botões.
- **Ícones desenhados à mão.** [`src/editor/icons.tsx`](src/editor/icons.tsx): 33 glifos numa grade 24×24, `stroke="currentColor"`, `stroke-width 1.7`, `aria-hidden="true"` (quem lê em voz alta é o texto ao lado), incluindo os **símbolos de livro das seis peças** (`KIND_ICON`) usados na tabela do painel e na projeção. Nada de biblioteca, nada de asset: o app continua offline-first e sem CDN.
- **A projeção acompanha.** [`src/mirror/Espelho.tsx`](src/mirror/Espelho.tsx) reusa `Kirchhoff` e `Rc` — como os dois viraram cartões, a projeção ganhou as mesmas caixas, e o `espelho.css` (que já tem a "letra de sala") ganhou as medidas de projeção para os cartões novos (título 17 px, linha de apoio 15 px, selo 13 px, número da tabela 22 px) e voltou a 15/13 px no celular. O espelho **também tem o botão de tema**, mas quem manda na sala é o que estiver no projetor.
- **A sala** ([`src/Sala.tsx`](src/Sala.tsx)) ganhou o botão de tema no alto — o aluno que abre `#/ajuda` no celular com a luz acesa precisa poder clarear a tela também.
- **Testes** (25 novos, total **317**): [`src/editor/theme.test.ts`](src/editor/theme.test.ts) (validação do storage podre, escolha vence o sistema, alternância involutiva, os dois sinais no `<html>`, boot antes do React, storage bloqueado, ouvinte que cancela), [`src/editor/icons.test.tsx`](src/editor/icons.test.tsx) (`renderToStaticMarkup` — sem jsdom: todo ícone é SVG `aria-hidden`, com `currentColor`, sem `<text>`, **nenhum par com o mesmo desenho**, e as seis peças com ícones distintos), [`src/core/kinds.test.ts`](src/core/kinds.test.ts) (todo `CompKind` coberto, rótulos únicos, explicação de uma linha minúscula, e **nenhum dos seis arquivos redeclara a tabela**) e [`src/styles/tema.test.ts`](src/styles/tema.test.ts) (lê o CSS por `node:fs` — o vitest devolve vazio para `?raw` de `.css`: todo `var(--x)` usado está declarado, o claro traz **todas** as cores do escuro, nenhuma paleta aponta para si mesma, e **contraste WCAG AA ≥ 4,5:1** nos 13 pares texto/fundo dos dois temas — o teste pegou o acento claro `#1f6feb`, que dava 4,35:1 e virou `#0969da`).
- **Verificado no navegador** (dev, janela 912×379): barra em **uma linha** (51 px, contra 133 px); painel com 8 cartões, 13 ícones, tabela de 272 px sem estouro, barras de nó em 0/100/100%; tema escuro medido (fundo `#0d1117`, painel `#161b22`, cartão `#12171e`, poço do Kirchhoff `#0a0d12`, grade `#1c2128`, fio `#7d8590`) e claro (fundo `#eef2f8`, painel branco, cartão `#f5f8fc`, quadro branco, grade `#e3e9f1`), com **contraste medido no DOM**: 14,6–18,4 (texto), 5,6–6,4 (apoio), 5,2 (selo); projeção com 3 cartões em letra de sala e 8 ícones; cardboard com os 4 circuitos e **0 erros de console** nas três telas.

## 6. Riscos e mitigações

1. **PCs fracos + MediaPipe** → medir fps no spike; `GPU` delegate com fallback CPU; mouse sempre disponível.
2. **Celular sem giroscópio** → detectar ausência de `DeviceOrientation` e cair para "arrastar para olhar".
3. **Permissão de sensores** → `DeviceOrientation` e `getUserMedia` exigem **HTTPS** (ou localhost); iOS exige `requestPermission()` em gesto do usuário. Deploy HTTPS é requisito desde a Fase 0.
4. **Ambição vs. prazo** → travar v1 em DC/RC linear.
5. **Fidelidade pedagógica** → professor de física revisando as estações antes do piloto.
6. **Rede escolar** → PWA offline-first, sem dependência de CDN em aula.

## 7. Fase 0 — checklist do spike

Validar **antes** de escrever código de produção (ver `docs/SPIKE.md` para o que medir e registrar):
- [ ] `spikes/hands.html` — MediaPipe HandLandmarker na webcam do PC da escola: fps estáveis, pinça detectável.
- [ ] `spikes/cardboard.html` — estéreo + giroscópio no celular da escola (é preciso HTTPS).
- [ ] Deploy HTTPS servindo os dois spikes a partir deste repositório.
