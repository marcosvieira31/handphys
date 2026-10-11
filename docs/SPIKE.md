# Fase 0 — spikes de validação

Objetivo: derrubar as3 incertezas técnicas **antes** de escrever código de produção.

| # | Spike | Pergunta que responde | Arquivo |
|---|---|---|---|
| 0.1 | Hand tracking na webcam | O PC da escola roda MediaPipe a ~30 fps e o gesto de pinça é estável? | `spikes/hands.html` — **APROVADO** |
| 0.2 | Cardboard estéreo | O celular tem giroscópio, o navegador entrega sensores e o fps estéreo aguenta? | `spikes/cardboard.html` — **APROVADO** |
| 0.3 | Deploy HTTPS | Conseguimos servir tudo por HTTPS estático (exigência de sensores e WebXR)? | **APROVADO** — `https://marcosvieira31.github.io/handphys/` |

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
- [x] FPS no celular real, giroscópio no celular real, acerto de toque no celular real.
  Medido no celular real (11/10/2026, Android + Chrome, via túnel HTTPS):

  | Métrica | Alvo | Medido | |
  |---|---|---|---|
  | FPS em estéreo, headset posto | ≥ 25 | **60** | ✅ |
  | Giroscópio | funciona | `GIROSCÓPIO: OK` | ✅ |
  | Seleção por toque | acerta | **1 (resistor)** | ✅ |
  | Estéreo: uma câmera por olho | – | metades corretas, mira+HUD por olho | ✅ |
  | WebGL2 no aparelho | – | sim | ✅ |

- [ ] iOS: `requestPermission()` em gesto do usuário (código já trata; falta aparelhe Apple).

**Veredito Spike 0.2: APROVADO.** Cardboard estéreo + giroscópio + toque é viável para a Fase 3.
- Bugs encontrados e corrigidos durante o spike (o spike pagou o próprio custo):
  - mira/HUD na costura entre os olhos (arquitetura `setViewOffset` → refazer com câmera por olho);
  - um olho renderizando os filhos do outro (visibilidade por passagem);
  - **JS "vivo mas morto" no celular**: o `<script type="module">` não terminava de carregar pelo
    túnel lento (modo dev = centenas de módulos) e os listeners nunca eram ligados → página
    mostrando só texto e botão. Agora: servir o **build** (bundle único) e expor erro de
    WebGL/JS **na tela** (`fatal()`), com retry sem `antialias` e `webglcontextlost` tratado;
  - **cabeça em `z=0` = mesmo plano da mesa** → quem vestia o cardboard olhava para o vazio;
    reposicionada a1,0 m da bancada com olhar baixo;
  - **HUD cortado pela mesa**: o cartão (1 m) ficava atrás da borda da mesa (0,55 m) e o
    `depthTest` padrão deixava a geometria desenhar por cima → `depthTest: false` + `renderOrder`.

### Avisos operacionais
- Aba oculta/janela minimizada → navegador throttla `requestAnimationFrame` (~1–20 fps).
  **Medir sempre com a aba visível.**
- `getUserMedia` e sensores exigem contexto seguro (HTTPS ou localhost).
- **Em aparelho real, servir o `dist/` (`npm run build` + `npx vite preview`), nunca o dev
  server.** O modo dev entrega o three.js como centenas de módulos separados; pelo túnel
  lento o `<script type="module">` não termina de carregar e a página fica "viva mas morta"
  (texto e botão sem resposta) — parece bug de WebRTC/sensor, mas é só carga incompleta.
- O túnel `localhost.run` **cai e reconecta com hostname novo**; se der `502 / no tunnel`,
  releia a URL no terminal do SSH. `cloudflared`/`ngrok` não funcionam neste ambiente
  (DNS local só IPv6 para `*.argotunnel.com`).

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

### Spike 0.2 (decidido em11/10/2026)

- **Cardboard estéreo + giroscópio entra na Fase 3 como caminho de visualização do celular.**
  Motivo: **60 fps em estéreo no celular real** (alvo ≥25), giroscópio `OK`, seleção por toque
  acertou na bancada. Sobrou folga de performance para a cena real da Fase 1/3.
- **Uma câmera por olho, nunca `setViewOffset`.** `setViewOffset` parte a cena, mas os filhos
  da câmera (mira, HUD) caem exatamente na costura entre os olhos — invisíveis com o headset.
  Uma câmera por olho mantém cada filho centrado no seu olho; a passagem de render garante que
  um olho não desenhe os filhos do outro.
- **HUD/mira da cena = `depthTest: false`.** O cartão ficava a1 m e a mesa a0,55 m: a borda da
  mesa desenhava na frente do HUD e o deixava ilegível só quando se olhava para a bancada.
  Overlay de interface não disputa profundidade com a cena.
- **Posição da cabeça relativa à cena importa**: cabeça em `z=0` (mesmo plano da mesa) = vazio
  escuro no headset. Pose inicial sempre com a cabeça atrás e acima da bancada, olhar baixo.
- **Servir o build, não o dev, em aparelho real.** O modo dev entrega o three.js como centenas
  de módulos; pelo túnel lento o `<script type="module">` não terminava e a página ficava com
  "texto e botão morto". Erro de WebGL/JS precisa aparecer **na tela** (`fatal()`), não só no
  console — senão dá para confundir com cena preta normal.
- **`antialias: true` não é garantia em GPU móvel** → retry automático sem MSAA antes de
  desistir. `webglcontextlost` precisa de aviso (celular recupera a GPU ao trocar de app).
- **iOS segue não medido**: o ramo `DeviceOrientationEvent.requestPermission()` já está no
  código e foi exercitado pelo desktop (que nega), mas falta um aparelhe Apple real.

### Spike 0.3 (decidido em11/10/2026)

**Deploy: GitHub Pages público via Actions** — `https://marcosvieira31.github.io/handphys/`
(repo público `marcosvieira31/handphys`, deploy automático a cada push em `main`).

Medido/verificado em produção:

| Verificação | Resultado |
|---|---|
| Landing `/` | 200 |
| `/spikes/hands.html` | 200 · carrega · **0 erros de console** |
| `/spikes/cardboard.html` | 200 · WebGL2 + estéreo · **0 erros de console** |
| `/mp/hand_landmarker.task` | 200 |
| `/mp/wasm/vision_wasm_internal.wasm` | 200 |
| Bundle JS referenciado | 200 (159 KB) |
| `BASE_URL` embutido no bundle | `/handphys/` ✓ |

Decisões:

- **GitHub Pages, repo público.** Páginas em repo privado exige **GitHub Pro** (pago); no
  plano Free só dá site público. Site do Pages é público de qualquer forma — o que muda com
  o repo é a visibilidade do **código**. Se um dia precisar de código fechado: Cloudflare
  Pages (aceita repo privado de graça) ou Netlify Drop (sobe só o `dist/`).
- **`base` configurável por `BASE_PATH`** (vite.config). Pages de projeto publica em
  subdiretório `/handphys/` — caminho absoluto fixo quebraria tudo. Dev e `preview` seguem
  na raiz; o CI define `BASE_PATH=/handphys/`.
- **Caminhos de runtime precisam de `import.meta.env.BASE_URL`** (os assets `/mp/`), nunca
  `'/mp/…'` literal: este é exatamente o tipo de bug que só aparece em produção, no
  subdiretório, com o console limpo — o wasm daria 404 e o spike "não iniciava".
- **Links internos relativos** (`spikes/…`, `../`) em vez de `/spikes/…`: funcionam em
  dev, no Pages e num futuro domínio raiz sem mexer em nada.
- **Push de `.github/workflows/*.yml` exige escopo `workflow` no token** do `gh` — sem ele
  o GitHub recusa o push (proteção contra injeção de pipeline). `gh auth refresh -s workflow`.
- **CI roda os testes antes do deploy** (`npm test` no job `build`) — deploy quebrado por
  regressão do solver não chega ao ar.
- Avisos do Actions (não bloqueiam): actions ainda alvo Node 20 (forçadas a rodar em 24) e
  `ubuntu-latest` migra para Ubuntu 26 em19/10/2026.

### Pendente da Fase 0

- **iOS**: medir `DeviceOrientationEvent.requestPermission()` num aparelhe Apple real
  (código pronto, caminho exercitado só pelo desktop que nega). Único item em aberto —
  não bloqueia a Fase 1.
