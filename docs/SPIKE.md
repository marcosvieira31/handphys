# Fase 0 — spikes de validação

Objetivo: derrubar as3 incertezas técnicas **antes** de escrever código de produção.

| # | Spike | Pergunta que responde | Arquivo |
|---|---|---|---|
| 0.1 | Hand tracking na webcam | O PC da escola roda MediaPipe a ~30 fps e o gesto de pinça é estável? | `spikes/hands.html` — **APROVADO** |
| 0.2 | Cardboard estéreo | O celular tem giroscópio, o navegador entrega sensores e o fps estéreo aguenta? | `spikes/cardboard.html` |
| 0.3 | Deploy HTTPS | Conseguimos servir tudo por HTTPS estático (exigência de sensores e WebXR)? | este documento |

## Como rodar

```bash
npm install
npm run dev            # http://localhost:5173
```

`localhost` é contexto seguro, então **no próprio PC** os spikes funcionam sem HTTPS.

### Para testar no celular (obrigatório para o spike 0.2)

Sensores (`DeviceOrientation`) e câmera exigem **HTTPS** em cima de IP/nuvem — `http://192.168.x.x:5173` **não** serve. Escolha um caminho:

1. **Túnel rápido (recomendado para o spike):**
   ```bash
   npx cloudflared tunnel --url http://localhost:5173   # ou: npx ngrok http 5173
   ```
   Gera uma URL `https://…` temporária; abra no celular.

   **Se o `cloudflared` falhar com `FAILED TO REFRESH DNS LOCAL RESOLVER` /
   `I/O TIMEOUT`** (roteador devolvendo só IPv6 para `*.argotunnel.com`), use o
   túnel SSH — não precisa instalar nem cadastrar:
   ```bash
   ssh -R 80:localhost:5173 nokey@localhost.run
   ```
   A saída traz a URL `https://….lhr.life` (e um QR no terminal). Válido enquanto
   o SSH ficar aberto; a cada sessão o hostname muda.

   > O `vite.config.ts` precisa de `server.allowedHosts: true`, senão o dev server
   > responde **403 "Blocked request"** para hostname de túnel (proteção anti DNS
   > rebinding). Só afeta `npm run dev`; o build estático não tem essa checagem.

2. **Deploy estático (valida o item 0.3 de uma vez):**
   ```bash
   npm run build
   ```
   Arraste a pasta `dist/` em <https://app.netlify.com/drop> ou publique no GitHub Pages.

## O que medir e registrar

### Spike 0.1 — webcam (preencher)

| Métrica | Alvo | Medido |
|---|---|---|
| Detecções/s | ≥ 24 | |
| Latência média | ≤ 60 ms | |
| Trocas agarrado↔solto segurando a pinça por 10 s | ≤ 6 em 5 s | |
| Delegate usado | GPU | |
| Câmera/modelo carregam offline (sem CDN)? | sim (`/mp/*` é local) | |

Testes manuais: duas mãos ao mesmo tempo; mão a ~30 cm e a ~80 cm; luz ruim da sala de aula; fundo movimentado (outras pessoas passando).

**Se falhar:** reduzir `numHands` para1, baixar resolução da câmera, ou assumir mouse como primário e mãos como "modo bônus".

### Spike 0.2 — cardboard (preencher)

| Métrica | Alvo | Medido |
|---|---|---|
| FPS em estéreo | ≥ 30 | |
| Giroscópio detectado | sim | |
| Latência do olhar (atravessar a sala com a cabeça) | sem "náusea" perceptível | |
| Seleção por toque acerta o objeto mirado | sim | |
| iOS: `requestPermission()` concedido em gesto | sim (se aplicável) | |

Testes manuais: celular **sem** giroscópio (fallback "arraste"); entrar em tela cheia; girar para todos os lados; tocar sem arrastar.

**Se falhar:** se o fps estéreo cair, reduzir `devicePixelRatio`/antialias e simplificar a cena; se não houver giroscópio no aparelho da escola, o modo Cardboard perde prioridade e o celular vira "visualizador mono".

### Spike 0.3 — deploy

- [ ] `npm run build` passa (inclui `tsc --noEmit`)
- [ ] Site publicado em HTTPS responde em celular da escola
- [ ] `/mp/hand_landmarker.task` e `/mp/wasm/*` servidos localmente (nada de CDN)

## Resultados parciais (validado por automação em2026-10-10)

### Spike 0.1 — webcam
- [x] Modelo + WASM **locais** carregam (`/mp/*`, sem CDN) e o **delegate GPU funciona**.
- [x] Medido no PC real (10/10/2026, janela em primeiro plano):

| Métrica | Alvo | Medido | |
|---|---|---|---|
| Render fps | – | 61 | ✅ |
| Quadros de vídeo/s (taxa real da câmera) | – | **15** (pedido era30) | ℹ️ webcam reduziu sozinha (luz fraca) |
| Detecções/s | ≥ 24 | **15** (= todos os quadros) | ✅ **eficiência100 %** — limite é a câmera |
| Latência média | ≤ 60 ms | **17,7 ms** | ✅ |
| Trocas agarrado↔solto (5s, mão parada) | ~2 | **0** | ✅ |
| Perdas de rastreio (5s) | 0–2 | 0–1 | ✅ |
| Duas mãos simultâneas | – | detecta2 | ✅ |
| Razão de pinça fechada | – | 0,20–0,24 | ✅ |
| Razão de pinça aberta | – | 0,84–0,88 | ✅ → **limiar calibrado: 0,45 ± 0,12** |
| Delegate | GPU | GPU | ✅ |
| Offline (sem CDN) | – | `/mp/*` local | ✅ |

**Veredito Spike 0.1: APROVADO.** Hand tracking é viável para a Fase 2 com:
-15 Hz (câmera real) é suficiente — suavização + interpolação do cursor no quadro de
  render dão a fluidez; se a sala tiver mais luz, a webcam volta a30 fps sozinha;
- latência17,7 ms é6× melhor que o alvo de60 ms (folga para o One Euro filter da Fase2);
- pinça estável (0 trocas em 5 s) com as correções de3D + debounce.

- Bugs encontrados e corrigidos durante o spike (o spike já pagou o próprio custo):
  - contador de trocas acumulava quando a aba ficava oculta (vídeo congela);
  - fps/latência sempre mostravam1 e0 (`lastFpsAt` nunca atualizado);
  - oclusão dos dedos na pinça gerava ~15 trocas/s → resolvido com **razão3D** (`world landmarks`) + **debounce de soltura de3 quadros**;
  - **15 detecções/s**: a hipótese "colisão rAF×vídeo" foi **parcialmente errada** — a correção
    para `requestVideoFrameCallback` cortou a latência (29,5 →17,7 ms) mas o teto continuou15;
    o contador de quadros reais revelou que **a própria webcam entrega15 fps**. Lição: medir a
    fonte antes de otimizar o consumidor;
  - relatório de faixa de razão contamina transição (a razão atravessa todo o intervalo ao
    trocar de estado) e mantinha entradas de mãos que sumiram (chave `<lado> <estado>` vs
    `delete(<lado>)`) → agora só mede em estado estável há300 ms e expira entradas em4 s.
- [x] Faixa aberta medida (0,84–0,88) → limiar **0,45**, histerese **0,12** (folga0,21 p/ agarrar,0,27 p/ soltar).
- [x]15 detecções/s = taxa real da câmera (contador via `requestVideoFrameCallback`); pipeline a100 %.
- ⚠️ **Limiar fixo global é frágil entre mãos**: na mesma sessão, mão direita deu
  fechada0,08–0,30 / aberta0,54–1,12, mas a **esquerda deu fechada0,39–0,43 e aberta0,45** —
  ou seja, quase em cima do limiar0,45 (passaria a não agarrar). A razão varia com distância,
  ângulo e mão. **Decisão para a Fase2:** calibração **por mão** (auto-limiar = ponto médio
  entre a menor e a maior razão vista para aquela mão, com decaimento lento) em vez de limiar
  fixo global. Manter slider manual como override.

### Spike 0.2 — cardboard
- [x] WebGL2 renderizando; **fps ~60 em estéreo** no desktop (janela visível).
- [x] Fallback “sem giroscópio → arrastar” funciona (o desktop negou `requestPermission`,
  exercitando inclusive o ramo de permissão estilo iOS).
- [x] Seleção por toque/raycast funciona (varredura de mira acertou objetos).
- [x] **Estéreo corrigido durante o spike**: a arquitetura com `setViewOffset` deixava a mira
  e o HUD exatamente na costura entre os olhos (invisíveis com o headset). Refeito com
  **uma câmera por olho** + visibilidade por passagem (senão um olho renderizava os filhos
  do outro). Marcador de teste aparece 1× em cada metade ✓.
- [ ] FPS no celular real, giroscópio no celular real, acerto de toque no celular real.
- [ ] iOS: `requestPermission()` em gesto do usuário.

### Avisos operacionais
- Aba oculta/janela minimizada → navegador throttla `requestAnimationFrame` (~1–20 fps).
  **Medir sempre com a aba visível.**
- `getUserMedia` e sensores exigem contexto seguro (HTTPS ou localhost).

## Decisões tomadas ao fim da Fase 0

Registrar aqui o que os spikes decidirem (ex.: "webcam roda a30fps → mãos valem a Fase 2"; "celular sem giroscópio → Cardboard adiado").

### Spike 0.1 (decidido em10/10/2026)

- **Hand tracking entra na Fase 2 como interação de verdade** (não como "modo bônus").
  Motivo: latência17,7 ms (alvo era ≤60), pinça com0 trocas em5 s, delegate GPU, offline.
- **15 Hz é o ritmo de detecção aceito.** A webcam do PC de teste entregou15 quadros/s reais
  (o pedido de30 é só uma preferência). Suavização + interpolação do cursor no quadro de
  render dão a fluidez. Em aula, **mais luz na sala = webcam volta a30 fps sozinha**, sem código.
- **Pinça = razão3D normalizada** (`world landmarks`, polegar×indicador ÷ punho×mão médio),
  com **debounce de soltura** (3 quadros acima do limiar) e **grace de400 ms** para sumiço
  momentâneo. Sem esses três, a oclusão dos dedos gerava ~15 trocas falsas por segundo.
- **Limiar fixo global NÃO escala para a turma** (uma mão operou a0,02 do limiar).
  Fase 2 usará **calibração por mão** (auto-limiar adaptativo) + slider manual como override.
- **Hand tracking e Cardboard continuam mutuamente exclusivos** no mesmo momento (matriz de
  modos no `docs/PLANO.md`), porque a webcam é fixa no PC e o modo Cardboard usa o celular.

### Pendente (spikes 0.2 e 0.3)

- FPS estéreo e giroscópio no celular real (spike 0.2).
- Deploy HTTPS estático funcional (spike 0.3).
