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
| **4 — Sala de aula** | Modo professor, desafios, relatório CSV, salvar/share por URL | ~1 semana |
| **5 — Piloto** | Testar com turma real e iterar | contínuo |

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
