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
  delegate: document.querySelector<HTMLElement>('#delegate')!,
};

let landmarker: HandLandmarker | null = null;
let stream: MediaStream | null = null;
let raf = 0;
let lastVideoTime = -1;

// Suavização exponencial por landmark (spike; a Fase 2 usa filtro One Euro).
const smoothed: Landmark[][] = [];
const SMOOTH_ALPHA = 0.4;

// Estado de pinça por mão (com histerese).
type HandState = {
  ratio: number;
  pinched: boolean;
  handedness: string;
  raw: Landmark[];
};
let handsState: HandState[] = [];

// Métricas.
let frames = 0;
let lastFpsAt = performance.now();
let detections = 0;
let detectMsSum = 0;
let flickerTimes: number[] = [];

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
    setStatus('Mãos à vista — faça a pinça.');
    stopBtn.disabled = false;
    loop();
  } catch (err) {
    setStatus(`Falha ao iniciar: ${(err as Error).message}`, true);
    startBtn.disabled = false;
  }
}

function stop() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  handsState = [];
  cursor = null;
  trail.length = 0;
  stopBtn.disabled = true;
  startBtn.disabled = false;
  setStatus('Parado.');
}

function pinchRatio(hand: Landmark[]): number {
  // Distância polegar×indicador normalizada pelo tamanho aparente da mão.
  const d = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
  const handSize = d(hand[0], hand[9]) || 1e-6;
  return d(hand[4], hand[8]) / handSize;
}

function detectLoop() {
  if (!landmarker || video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const t0 = performance.now();
  const result = landmarker.detectForVideo(video, t0);
  const dt = performance.now() - t0;

  detections += 1;
  detectMsSum += dt;

  const thr = Number(thresholdInput.value);
  const hysteresis = 0.05;
  const now = performance.now();
  const next: HandState[] = result.landmarks.map((lm, i) => {
    const prev = smoothed[i];
    const raw = lm.map((p, j) => {
      if (!prev || !prev[j]) return { x: p.x, y: p.y, z: p.z };
      return {
        x: prev[j].x + (p.x - prev[j].x) * SMOOTH_ALPHA,
        y: prev[j].y + (p.y - prev[j].y) * SMOOTH_ALPHA,
        z: prev[j].z + (p.z - prev[j].z) * SMOOTH_ALPHA,
      };
    });
    smoothed[i] = raw;

    const ratio = pinchRatio(raw);
    const old = handsState[i];
    const wasPinched = old?.pinched ?? false;
    const pinched = wasPinched ? ratio > thr + hysteresis : ratio < thr;
    if (pinched !== wasPinched) flickerTimes.push(now);

    return {
      ratio,
      pinched,
      raw,
      handedness: result.handedness[i]?.[0]?.categoryName ?? '?',
    };
  });
  handsState = next;
  smoothed.length = next.length;
  flickerTimes = flickerTimes.filter((t) => now - t < 5000);
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
  frames += 1;
  if (now - lastFpsAt >= 1000) {
    el.fps.textContent = String(frames);
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
}

function loop() {
  raf = requestAnimationFrame(loop);
  detectLoop();
  draw();
  updateStats(performance.now());
}

// Gancho de depuração: permite medir o spike por automação (não faz parte do produto).
(window as unknown as { __spike?: unknown }).__spike = {
  stats: () => ({
    renderFps: frames,
    hands: handsState.length,
    pinch: handsState.map((h) => ({ side: h.handedness, ratio: Number(h.ratio.toFixed(3)), pinched: h.pinched })),
    flicker5s: flickerTimes.length,
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
