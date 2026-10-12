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

### Bancada expandida (dock) — onde está

Feito (refino de uso com as mãos):
- **O que mudou**: a paleta lateral (componentes + Conectar), o alternador `2D/3D` e o
  zoom `− / % / +` saíram da sidebar e da barra superior e passaram a morar no **dock
  dentro da área de trabalho**, na faixa embaixo do quadro. Motivo: com hand tracking o
  alcance confortável é o CENTRO da tela (o que a câmera enxerga bem) — alcançar os
  cantos exigia braço estendido e ainda trazer o item de lá para o quadro; agora pegar e
  posicionar é o mesmo movimento, e o quadro ganhou a largura da antiga sidebar.
- **Sem quebrar a pinça**: os alvos mantêm os MESMOS `data-hand`
  (`kind:*`, `wire`, `view:2d/3d`, `zoom:*`), então a pinça clica como sempre; o dock
  fica FORA do retângulo do SVG, então a mira não aperta o quadro por baixo do botão.
- **Alvo de mão**: itens ≥ 46 px de altura; em janela baixa (`max-height: 620px`) o dock
  esconde os valores impressos antes de o quadro encolher (piso de 120 px no
  `.canvas-view`).
- Verificado: `tsc` limpo, 162 testes, build ok; no navegador (dev) — clicar no item arma
  `placing`, clique no quadro posiciona (célula 15,15), `2D/3D`, zoom e modo fio
  funcionam pelo dock, ida e volta 2D↔3D sem erros de console.

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
