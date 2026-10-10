# Fase 0 — spikes de validação

Objetivo: derrubar as3 incertezas técnicas **antes** de escrever código de produção.

| # | Spike | Pergunta que responde | Arquivo |
|---|---|---|---|
| 0.1 | Hand tracking na webcam | O PC da escola roda MediaPipe a ~30 fps e o gesto de pinça é estável? | `spikes/hands.html` |
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

## Decisões tomadas ao fim da Fase 0

Registrar aqui o que os spikes decidirem (ex.: "webcam roda a30fps → mãos valem a Fase 2"; "celular sem giroscópio → Cardboard adiado").

-
