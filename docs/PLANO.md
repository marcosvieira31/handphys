# Plano — Laboratório Virtual de Física (Circuitos) em Realidade Mista

> Status: **Fase 0–3a concluídas — Fase 4 em execução (começou pelo share por URL + QR)**
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
- Pendente do plano: relatório **JSON**; leitura por **nó** (estação de Kirchhoff) se o
  professor pedir; desafios com verificação automática vêm em seguida.

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
