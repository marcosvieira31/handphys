import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import '../../styles/spike.css';

/**
 * Spike 0.1 — validar hand tracking na webcam do PC da escola.
 * Mede: detecções/s, latência média e instabilidade do gesto de pinça.
 * Nada aqui é código de produção; é evidência para a Fase 2.
 */

type Landmark = { x: number; y: number; z: number };

const CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const video = document.querySelector<HTMLVideoElement>('#video')!;
const overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
const startBtn = document.querySelector<HTMLButtonElement>('#start')!;
const stopBtn = document.querySelector<HTMLButtonElement>('#stop')!;
const copyBtn = document.querySelector<HTMLButtonElement>('#copy')!;
const thresholdInput = document.querySelector<HTMLInputElement>('#threshold')!;
const thresholdOut = document.querySelector<HTMLOutputElement>('#thr')!;
const ctx = overlay.getContext('2d')!;

const el = {
  fps: document.querySelector<HTMLElement>('#fps')!,
  det: document.querySelector<HTMLElement>('#det')!,
  lat: document.querySelector<HTMLElement>('#lat')!,
  hands: document.querySelector<HTMLElement>('#hands')!,
  pinch: document.querySelector<HTMLElement>('#pinch')!,
  flicker: document.querySelector<HTMLElement>('#flicker')!,
  dropouts: document.querySelector<HTMLElement>('#dropouts')!,
  cause: document.querySelector<HTMLElement>('#cause')!,
  delegate: document.querySelector<HTMLElement>('#delegate')!,
};

let landmarker: HandLandmarker | null = null;
let stream: MediaStream | null = null;
let raf = 0;
let lastVideoTime = -1;
let videoFrameCb = 0; // handle do requestVideoFrameCallback (0 = sem suporte/desligado)
let cancelVideoFrame: (() => void) | null = null;

// Suavização exponencial por landmark, CHAVEADA POR MÃO (spike; a Fase 2 usa filtro One Euro).
const smoothedBy = new Map<string, Landmark[]>();
const SMOOTH_ALPHA = 0.4;

// Quanto tempo uma mão pode sumir do quadro sem perder a "pinça".
// Sem isso, um frame perdido vira "soltou + agarrou de novo" = troca falsa.
const GRACE_MS = 400;

// Soltar exige N quadros seguidos acima do limiar: quando o polegar encosta no
// indicador, os landmarks se ocultam e a distância "pula" por1–2 quadros.
const RELEASE_FRAMES = 3;

// Histerese: agarrar abaixo de LIMIAR, soltar acima de LIMIAR + histerese.
// Medido no PC real: pinça fechada0,20–0,24, aberta0,84–0,88 → limiar0,45 tem folga nos dois lados.
const HYSTERESIS = 0.12;

// Estado de pinça por mão (com histerese), chaveado por esquerda/direita —
// a ordem das mãos no resultado do MediaPipe pode trocar entre quadros.
type HandState = { ratio: number; pinched: boolean; handedness: string; raw: Landmark[] };
type Tracked = { pinched: boolean; lastSeen: number; stateSince: number };
const trackedBy = new Map<string, Tracked>();
const pendingRelease = new Map<string, number>();
const ratioStats = new Map<string, { min: number; max: number; at: number }>();
let handsState: HandState[] = [];

// Métricas.
let frames = 0;
let lastFps = 0;
let lastFpsAt = performance.now();
let detections = 0;
let detectMsSum = 0;
// Quadros que o ELEMENTO DE VÍDEO realmente entregou (via requestVideoFrameCallback).
// É a taxa real da webcam: getSettings().frameRate é o pedido, não o entregue
// (muitas webcams caem para 15 fps em luz fraca ou por firmware).
let videoFrames = 0;
let lastVideoFps = 0;
let flickerTimes: number[] = []; // toda troca agarrado↔solto
let tremorTimes: number[] = []; // troca com rastreio contínuo = tremor real do gesto
let replaceTimes: number[] = []; // troca ao (re)aparecer a mão = reposição de estado
let labelTimes: number[] = []; // etiqueta esquerda/direita trocou com o nº de mãos constante
let dropoutTimes: number[] = [];
let cameraInfo = '–';

function prune5s(now: number) {
  flickerTimes = flickerTimes.filter((t) => now - t < 5000);
  tremorTimes = tremorTimes.filter((t) => now - t < 5000);
  replaceTimes = replaceTimes.filter((t) => now - t < 5000);
  labelTimes = labelTimes.filter((t) => now - t < 5000);
  dropoutTimes = dropoutTimes.filter((t) => now - t < 5000);
}

// Cursor "agarrado".
let cursor: { x: number; y: number } | null = null;
const trail: Array<{ x: number; y: number }> = [];

function setStatus(msg: string, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

async function createLandmarker(): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks('/mp/wasm');
  const common = {
    baseOptions: { modelAssetPath: '/mp/hand_landmarker.task' },
    runningMode: 'VIDEO' as const,
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    const lm = await HandLandmarker.createFromOptions(fileset, {
      ...common,
      baseOptions: { ...common.baseOptions, delegate: 'GPU' },
    });
    el.delegate.textContent = 'GPU';
    el.delegate.className = 'good';
    return lm;
  } catch {
    const lm = await HandLandmarker.createFromOptions(fileset, common);
    el.delegate.textContent = 'CPU (GPU falhou)';
    el.delegate.className = 'warn';
    return lm;
  }
}

async function start() {
  startBtn.disabled = true;
  try {
    if (!landmarker) {
      setStatus('Carregando modelo do MediaPipe…');
      landmarker = await createLandmarker();
    }
    setStatus('Pedindo acesso à câmera…');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    // Resolução/fps reais da câmera: se detecções/s é baixa, o limite pode ser a webcam
    // (notebooks caem para15 fps em luz fraca), não o MediaPipe.
    const settings = stream.getVideoTracks()[0]?.getSettings();
    cameraInfo = settings
      ? `${settings.width}×${settings.height} @ ${Math.round(settings.frameRate ?? 0)} fps`
      : '–';
    setStatus('Mãos à vista — faça a pinça.');
    stopBtn.disabled = false;
    scheduleVideoFrame(); // detecção no ritmo do vídeo (30/s), não no rAF
    loop();
  } catch (err) {
    setStatus(`Falha ao iniciar: ${(err as Error).message}`, true);
    startBtn.disabled = false;
  }
}

function stop() {
  cancelAnimationFrame(raf);
  cancelVideoFrame?.(); // para o ciclo de detecção por quadro de vídeo
  cancelVideoFrame = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  lastVideoTime = -1;
  handsState = [];
  trackedBy.clear();
  smoothedBy.clear();
  pendingRelease.clear();
  ratioStats.clear();
  flickerTimes = [];
  dropoutTimes = [];
  cursor = null;
  trail.length = 0;
  stopBtn.disabled = true;
  startBtn.disabled = false;
  setStatus('Parado.');
}

function pinchRatio2D(hand: Landmark[]): number {
  // Distância polegar×indicador normalizada pelo tamanho aparente da mão.
  const d = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
  const handSize = d(hand[0], hand[9]) || 1e-6;
  return d(hand[4], hand[8]) / handSize;
}

function pinchRatio3D(world: Landmark[]): number {
  // Mesma razão, mas em coordenadas de mundo (metros). Mais estável quando as
  // pontas dos dedos se tocam: em imagem o landmark de um dedo some atrás do outro.
  const d = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const handSize = d(world[0], world[9]) || 1e-6;
  return d(world[4], world[8]) / handSize;
}

/**
 * Uma rodada de detecção. Chamada uma vez por quadro DE VÍDEO real
 * (`requestVideoFrameCallback`) quando disponível — no rAF puro o ciclo de
 * ~30 ms do detectForVideo batia com o de ~33 ms do vídeo e metade dos
 * quadros era descartada (15 det/s com câmera de 30 fps).
 */
function detectOnce() {
  if (!landmarker || video.readyState < 2) return;

  const t0 = performance.now();
  const result = landmarker.detectForVideo(video, t0);
  const dt = performance.now() - t0;

  detections += 1;
  detectMsSum += dt;

  const thr = Number(thresholdInput.value);
  const hysteresis = HYSTERESIS;
  const now = performance.now();
  const seen = new Set<string>();
  const before = new Set(trackedBy.keys());

  handsState = result.landmarks.map((lm, i) => {
    // Chavear por mão (esquerda/direita), nunca por posição no array:
    // a ordem das mãos pode trocar entre quadros e gerava trocas falsas.
    const side = result.handedness[i]?.[0]?.categoryName ?? `mão${i}`;
    seen.add(side);

    const prev = smoothedBy.get(side);
    const raw = lm.map((p, j) => {
      const s = prev?.[j];
      if (!s) return { x: p.x, y: p.y, z: p.z };
      return {
        x: s.x + (p.x - s.x) * SMOOTH_ALPHA,
        y: s.y + (p.y - s.y) * SMOOTH_ALPHA,
        z: s.z + (p.z - s.z) * SMOOTH_ALPHA,
      };
    });
    smoothedBy.set(side, raw);

    const world = result.worldLandmarks[i];
    const ratio = world ? pinchRatio3D(world) : pinchRatio2D(raw);

    const prevTracked = trackedBy.get(side);
    const wasPinched = prevTracked?.pinched ?? false;

    // Agarrar é imediato (precisa estar responsivo); soltar passa por debounce.
    let pinched = wasPinched;
    if (!wasPinched) {
      if (ratio < thr) pinched = true;
    } else {
      const above = ratio > thr + hysteresis;
      const count = above ? (pendingRelease.get(side) ?? 0) + 1 : 0;
      pendingRelease.set(side, count);
      if (count >= RELEASE_FRAMES) pinched = false;
    }

    // Faixa da razão nos últimos2 s, separando estado fechado/aberto.
    // Só mede em estado ESTÁVEL (sem troca há ≥300 ms): durante a transição a
    // razão atravessa todo o intervalo e contaminava a faixa (medição inútil).
    const stateSince = pinched === wasPinched ? (prevTracked?.stateSince ?? now) : now;
    if (now - stateSince >= 300) {
      const stateKey = `${side} ${pinched ? 'fechada' : 'aberta'}`;
      const rs = ratioStats.get(stateKey);
      if (!rs || now - rs.at > 2000) ratioStats.set(stateKey, { min: ratio, max: ratio, at: now });
      else {
        rs.min = Math.min(rs.min, ratio);
        rs.max = Math.max(rs.max, ratio);
      }
    }

    if (pinched !== wasPinched) {
      flickerTimes.push(now);
      // Motivo: rastreio contínuo = tremor real; estado novo = reposição (mão/etiqueta surgiu).
      if (prevTracked) tremorTimes.push(now);
      else replaceTimes.push(now);
    }
    trackedBy.set(side, { pinched, lastSeen: now, stateSince });

    return { ratio, pinched, raw, handedness: side };
  });

  // Etiqueta esquerda/direita trocou com o mesmo nº de mãos em campo = classificador oscilando.
  const appeared = [...seen].filter((s) => !before.has(s)).length;
  const pending = [...before].filter((s) => !seen.has(s)).length;
  if (appeared > 0 && pending > 0 && seen.size === before.size) labelTimes.push(now);

  // Mão sumiu: só perde o estado (e conta "perda de rastreio") depois da graça.
  for (const [side, tracked] of [...trackedBy]) {
    if (!seen.has(side) && now - tracked.lastSeen > GRACE_MS) {
      trackedBy.delete(side);
      smoothedBy.delete(side);
      pendingRelease.delete(side);
      // As chaves de razão são "<lado> <estado>", por isso o apagamento por prefixo.
      for (const key of [...ratioStats.keys()]) {
        if (key.startsWith(`${side} `)) ratioStats.delete(key);
      }
      dropoutTimes.push(now);
    }
  }

  // Entrada de razão sem atualização há >4 s (mão que saiu sem passar pela graça).
  for (const [key, r] of [...ratioStats]) {
    if (now - r.at > 4000) ratioStats.delete(key);
  }

  prune5s(now);
}

function draw() {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;
  if (overlay.width !== w || overlay.height !== h) {
    overlay.width = w;
    overlay.height = h;
  }

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w, 0); // espelha como espelho de verdade
  ctx.scale(-1, 1);

  let pinchedNow = false;
  for (const hand of handsState) {
    const lm = hand.raw;
    ctx.strokeStyle = hand.pinched ? '#3fb950' : '#58a6ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
    }
    ctx.stroke();

    ctx.fillStyle = '#e6edf3';
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Linha da pinça.
    ctx.strokeStyle = hand.pinched ? '#3fb950' : '#d29922';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(lm[4].x * w, lm[4].y * h);
    ctx.lineTo(lm[8].x * w, lm[8].y * h);
    ctx.stroke();

    if (hand.pinched) {
      pinchedNow = true;
      cursor = { x: ((lm[4].x + lm[8].x) / 2) * w, y: ((lm[4].y + lm[8].y) / 2) * h };
    }
  }

  // Nenhuma pinça ativa neste quadro → larga o cursor.
  if (!pinchedNow) {
    cursor = null;
    trail.length = 0;
  }

  // Cursor agarrado + rastro (mostra a instabilidade do gesto).
  if (cursor) {
    trail.push({ ...cursor });
    if (trail.length > 40) trail.shift();
    ctx.lineWidth = 2;
    for (let i = 1; i < trail.length; i++) {
      ctx.strokeStyle = `rgba(63, 185, 80, ${i / trail.length})`;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    ctx.fillStyle = '#3fb950';
    ctx.strokeStyle = '#0d1117';
    ctx.lineWidth = 2;
    ctx.fillRect(cursor.x - 18, cursor.y - 18, 36, 36);
    ctx.strokeRect(cursor.x - 18, cursor.y - 18, 36, 36);
  }

  ctx.restore();
}

function updateStats(now: number) {
  prune5s(now); // janela honesta mesmo quando a detecção para (aba oculta congela o vídeo)
  frames += 1;
  if (now - lastFpsAt >= 1000) {
    lastFps = frames;
    lastFpsAt = now;
    lastVideoFps = videoFrames; // quadros/s reais entregues pela câmera
    videoFrames = 0;
    el.fps.textContent = `${lastFps} render / ${lastVideoFps} vídeo`;
    el.det.textContent = detections ? String(detections) : '0';
    el.lat.textContent = detections ? `${(detectMsSum / detections).toFixed(1)} ms` : '–';
    const good = detections > 15;
    el.det.className = good ? 'good' : 'warn';
    el.lat.className = good ? 'good' : 'warn';
    frames = 0;
    detections = 0;
    detectMsSum = 0;
  }

  el.hands.textContent = String(handsState.length);
  el.pinch.textContent = handsState
    .map((h) => `${h.handedness}:${h.pinched ? 'PINÇA' : h.ratio.toFixed(2)}`)
    .join('  ') || '–';
  el.flicker.textContent = String(flickerTimes.length);
  el.flicker.className = flickerTimes.length > 6 ? 'warn' : 'good';
  el.dropouts.textContent = String(dropoutTimes.length);
  el.dropouts.className = dropoutTimes.length > 2 ? 'warn' : 'good';
  el.cause.textContent =
    `tremor ${tremorTimes.length} · reposição ${replaceTimes.length} · etiqueta ${labelTimes.length}`;
  el.cause.className = tremorTimes.length > 6 ? 'warn' : 'good';
}

function loop() {
  raf = requestAnimationFrame(loop);
  // Detecção roda no ritmo do VÍDEO (requestVideoFrameCallback); o fallback,
  // para navegadores sem a API, continua no rAF com guarda de quadro repetido.
  if (!videoFrameCb) detectFrame();
  draw();
  updateStats(performance.now());
}

/** Fallback (sem rVFC): detecta só quando o vídeo entregou um quadro novo. */
function detectFrame() {
  if (video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  videoFrames += 1;
  detectOnce();
}

/** Agenda a próxima detecção no próximo quadro de vídeo real (30/s na câmera de 30 fps). */
function scheduleVideoFrame() {
  const el = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  };
  if (typeof el.requestVideoFrameCallback !== 'function') return; // fallback: rAF + guarda
  videoFrameCb = el.requestVideoFrameCallback(() => {
    if (!stream) return; // parou no meio do quadro
    videoFrames += 1;
    detectOnce();
    scheduleVideoFrame();
  });
  cancelVideoFrame = () => {
    if (videoFrameCb && typeof el.cancelVideoFrameCallback === 'function') {
      el.cancelVideoFrameCallback(videoFrameCb);
    }
    videoFrameCb = 0;
  };
}

// Gancho de depuração: permite medir o spike por automação (não faz parte do produto).
(window as unknown as { __spike?: unknown }).__spike = {
  stats: () => ({
    renderFps: lastFps,
    videoFps: lastVideoFps,
    hands: handsState.length,
    pinch: handsState.map((h) => ({ side: h.handedness, ratio: Number(h.ratio.toFixed(3)), pinched: h.pinched })),
    ratioRange2s: [...ratioStats].map(([s, r]) => ({ side: s, min: Number(r.min.toFixed(3)), max: Number(r.max.toFixed(3)) })),
    flicker5s: flickerTimes.length,
    tremor5s: tremorTimes.length,
    replace5s: replaceTimes.length,
    label5s: labelTimes.length,
    dropouts5s: dropoutTimes.length,
    visible: document.visibilityState === 'visible',
    camera: cameraInfo,
    delegate: el.delegate.textContent,
    status: statusEl.textContent,
    modelLoaded: landmarker !== null,
  }),
};

thresholdInput.addEventListener('input', () => {
  thresholdOut.textContent = Number(thresholdInput.value).toFixed(2);
});
startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);

// Copia um resumo das métricas (para o relatório do spike / suporte em aula).
copyBtn.addEventListener('click', async () => {
  const text = [
    `handphys spike0.1 — ${new Date().toLocaleString('pt-BR')}`,
    `aba visível: ${document.visibilityState === 'visible' ? 'sim' : 'NÃO (fps/latência não valem)'} · vídeo pronto: ${video.readyState}`,
    `câmera: ${cameraInfo}`,
    `render fps: ${lastFps}`,
    `quadros de vídeo/s (taxa real da câmera): ${lastVideoFps}`,
    `detecções/s: ${el.det.textContent}`,
    `latência média: ${el.lat.textContent}`,
    `mãos vistas: ${el.hands.textContent}`,
    `pinça: ${el.pinch.textContent}`,
    `razão de pinça (2s): ${[...ratioStats].map(([s, r]) => `${s} ${r.min.toFixed(2)}–${r.max.toFixed(2)}`).join(' · ') || '–'}`,
    `trocas agarrado↔solto (5s): ${el.flicker.textContent}`,
    `causa (5s): ${el.cause.textContent}`,
    `perdas de rastreio (5s): ${el.dropouts.textContent}`,
    `delegate: ${el.delegate.textContent}`,
    `limiar: ${thresholdInput.value}`,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Resultados copiados — cole onde quiser.');
  } catch {
    window.prompt('Copie o texto abaixo:', text);
  }
});
