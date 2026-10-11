import * as THREE from 'three';
import './style.css';
import { readCircuit, type Reading } from '../core/netlist';
import { EXAMPLES } from '../editor/examples';
import { voltageColor } from '../editor/colors';
import { applyLayoutReading, buildBoard, buildCircuitGroup, compIdOf, disposeGroup } from '../scene/buildScene';
import { layoutScene } from '../scene/layout';

/**
 * Fase 3a — Cardboard de produção: os circuitos de verdade na bancada 3D,
 * estéreo split-screen + giroscópio (arrastar como fallback), mira + toque
 * para ver V/I. Arquitetura do spike 0.2 (uma câmera por olho: mira e HUD
 * precisam estar centrados em cada olho), com a cena real no lugar das formas.
 */

const IPD = 0.064;
const EYE_FOV = 75;
const HEAD_POS: [number, number, number] = [0, 15, 21];
const HEAD_PITCH = -0.55; // olhar na bancada (30 de lado, centro na origem)

const KIND_LABEL: Record<string, string> = {
  vsource: 'Fonte',
  resistor: 'Resistor',
  capacitor: 'Capacitor',
  lamp: 'Lâmpada',
  switch: 'Chave',
  ground: 'Terra',
};

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const gate = document.querySelector<HTMLElement>('#gate')!;
const gateMsg = document.querySelector<HTMLElement>('#gate-msg')!;
const startBtn = document.querySelector<HTMLButtonElement>('#start')!;
const portraitEl = document.querySelector<HTMLElement>('#portrait')!;
const stereoBtn = document.querySelector<HTMLButtonElement>('#toggle-stereo')!;
const fullscreenBtn = document.querySelector<HTMLButtonElement>('#fullscreen')!;
const examplesEl = document.querySelector<HTMLElement>('#examples')!;
const exampleSel = document.querySelector<HTMLSelectElement>('#example')!;
const gateLog = document.querySelector<HTMLElement>('#gate-log')!;

// Diário de bordo: cada etapa da inicialização deixa uma linha. Se o celular
// falhar, a última linha diz onde parou (sem isso, "nada acontece" é indebugável).
function bootLog(line: string) {
  gateLog.textContent += (gateLog.textContent ? '\n' : '') + line;
}

// Falha de WebGL/JS não pode virar "tela preta sem explicação" (lição do spike).
function fatal(msg: string) {
  gate.classList.remove('hidden');
  gateMsg.textContent = msg;
  gateMsg.style.color = '#ff7b72';
  gateMsg.style.fontWeight = '600';
  startBtn.disabled = true;
}
window.addEventListener('error', (e) => fatal(`Erro: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => fatal(`Erro: ${String(e.reason)}`));
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  fatal('A GPU liberou o contexto 3D (comum no celular). Recarregue a página.');
});

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  } catch {
    fatal('Este navegador não conseguiu criar o contexto WebGL. Atualize ou libere memória.');
    throw err;
  }
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d12);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1d22, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(12, 20, 8);
scene.add(sun);
scene.add(buildBoard());

// ------------------------------------------------------------------ câmeras

const head = new THREE.PerspectiveCamera(EYE_FOV, 1, 0.05, 300);
head.rotation.order = 'YXZ';
head.position.set(...HEAD_POS);

type Eye = { cam: THREE.PerspectiveCamera; side: -1 | 1 };
const eyes: [Eye, Eye] = [
  { cam: new THREE.PerspectiveCamera(EYE_FOV, 1, 0.05, 300), side: -1 },
  { cam: new THREE.PerspectiveCamera(EYE_FOV, 1, 0.05, 300), side: 1 },
];
for (const eye of eyes) {
  eye.cam.rotation.order = 'YXZ';
  eye.cam.position.copy(head.position);
  scene.add(eye.cam); // na cena: os filhos (mira/HUD) precisam renderizar
}

// ------------------------------------------------- mira e HUD (por olho)

const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512;
hudCanvas.height = 256;
const hudCtx = hudCanvas.getContext('2d')!;
const hudTexture = new THREE.CanvasTexture(hudCanvas);

for (const eye of eyes) {
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.012, 0.017, 32),
    new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.85, depthTest: false }),
  );
  reticle.position.set(0, 0, -1);
  reticle.renderOrder = 1000;
  eye.cam.add(reticle);

  const hud = new THREE.Mesh(
    new THREE.PlaneGeometry(0.64, 0.32),
    new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, depthTest: false }),
  );
  hud.position.set(0, -0.46, -1);
  hud.renderOrder = 999;
  eye.cam.add(hud);
}

// anel de seleção: deitado na bancada sob o componente mirado
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1.05, 40),
  new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.03;
ring.visible = false;
scene.add(ring);

// ------------------------------------------------------- circuito

let circuit: THREE.Group | null = null;
let layout = layoutScene(EXAMPLES[0].doc, readCircuit(EXAMPLES[0].doc), voltageColor);
let reading: Reading = readCircuit(EXAMPLES[0].doc);
let exampleName = EXAMPLES[0].name;
let selectedId: string | null = null;

function loadCircuit(index: number) {
  const ex = EXAMPLES[index];
  exampleName = ex.name;
  reading = readCircuit(ex.doc);
  layout = layoutScene(ex.doc, reading, voltageColor);
  if (circuit) {
    scene.remove(circuit);
    disposeGroup(circuit);
  }
  circuit = buildCircuitGroup(layout);
  applyLayoutReading(circuit, layout);
  scene.add(circuit);
  selectedId = null;
  ring.visible = false;
  exampleSel.value = String(index);
  [...examplesEl.querySelectorAll('button')].forEach((x, j) => x.classList.toggle('active-example', j === index));
  drawHud();
}

function fmtVolts(v: number): string {
  return `${v.toFixed(2)} V`;
}

function fmtAmps(a: number): string {
  const abs = Math.abs(a);
  return abs >= 1 ? `${a.toFixed(2)} A` : `${(a * 1000).toFixed(0)} mA`;
}

function selectedText(): string {
  if (!selectedId) return 'Mire + toque num componente';
  const r = reading.comps.find((c) => c.id === selectedId);
  if (!r) return '';
  const label = `${r.id} ${KIND_LABEL[r.kind] ?? r.kind}`;
  return `${label} · ${fmtVolts(r.volts)} · ${fmtAmps(r.amps)}`;
}

// ------------------------------------------------------- giroscópio

type GyroState = 'off' | 'active' | 'absent';
let gyroState: GyroState = 'off';
const orientation = { alpha: 0, beta: 0, gamma: 0, screenAngle: 0 };
const euler = new THREE.Euler();
const qScreen = new THREE.Quaternion();
const zAxis = new THREE.Vector3(0, 0, 1);
const qAdjust = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

function onOrientation(e: DeviceOrientationEvent) {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  orientation.alpha = THREE.MathUtils.degToRad(e.alpha);
  orientation.beta = THREE.MathUtils.degToRad(e.beta);
  orientation.gamma = THREE.MathUtils.degToRad(e.gamma);
  orientation.screenAngle = THREE.MathUtils.degToRad(
    screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0,
  );
  if (gyroState !== 'active') {
    gyroState = 'active';
    drawHud();
  }
}

function applyGyro(quat: THREE.Quaternion) {
  euler.set(orientation.beta, orientation.alpha, -orientation.gamma, 'YXZ');
  quat.setFromEuler(euler);
  quat.multiply(qAdjust);
  quat.multiply(qScreen.setFromAxisAngle(zAxis, -orientation.screenAngle));
}

// ------------------------------------------------- fallback: arrastar

const manual = { yaw: 0, pitch: HEAD_PITCH };
let dragging = false;
let moved = 0;
let lastPointer = { x: 0, y: 0 };

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  moved = 0;
  lastPointer = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging || gyroState === 'active') return;
  const dx = e.clientX - lastPointer.x;
  const dy = e.clientY - lastPointer.y;
  lastPointer = { x: e.clientX, y: e.clientY };
  moved += Math.abs(dx) + Math.abs(dy);
  manual.yaw -= dx * 0.004;
  manual.pitch = THREE.MathUtils.clamp(manual.pitch - dy * 0.004, -1.4, 1.4);
});
canvas.addEventListener('pointerup', () => {
  if (dragging && moved < 10) selectCenter();
  dragging = false;
});

// ----------------------------------------------------------- seleção

const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

function selectCenter() {
  if (!circuit) return;
  head.updateMatrixWorld();
  raycaster.setFromCamera(center, head);
  const hit = raycaster.intersectObject(circuit, true)[0];
  const id = hit ? compIdOf(hit.object) : '';
  selectedId = id || null;
  if (selectedId) {
    const node = layout.comps.find((c) => c.id === selectedId);
    if (node) {
      ring.position.set(node.wx, 0.03, node.wz);
      ring.visible = true;
    }
  } else {
    ring.visible = false;
  }
  drawHud();
}

// -------------------------------------------------------------- HUD

function drawHud() {
  const gyroLabel =
    gyroState === 'active' ? 'GIROSCÓPIO OK' :
    gyroState === 'absent' ? 'SEM GIROSCÓPIO · arraste p/ olhar' : 'giroscópio: aguardando';
  hudCtx.clearRect(0, 0, 512, 256);
  hudCtx.fillStyle = 'rgba(13,17,23,0.78)';
  hudCtx.fillRect(0, 0, 512, 256);
  hudCtx.fillStyle = '#e6edf3';
  hudCtx.font = 'bold 30px system-ui';
  hudCtx.fillText(exampleName.slice(0, 24), 24, 52);
  hudCtx.font = '24px system-ui';
  hudCtx.fillStyle = gyroState === 'active' ? '#3fb950' : '#d29922';
  hudCtx.fillText(gyroLabel, 24, 94);
  hudCtx.fillStyle = '#58a6ff';
  hudCtx.font = '26px system-ui';
  hudCtx.fillText(selectedText().slice(0, 30), 24, 142);
  hudCtx.fillStyle = '#8b949e';
  hudCtx.font = '22px system-ui';
  hudCtx.fillText('toque = ver V/I', 24, 184);
  hudCtx.fillText(`estéreo ${stereo ? 'ON' : 'OFF'}`, 24, 216);
  hudTexture.needsUpdate = true;
}

// --------------------------------------------------------- interações

let stereo = true;

function setStereo(next: boolean) {
  stereo = next;
  stereoBtn.textContent = `Estéreo: ${stereo ? 'ON' : 'OFF'}`;
  drawHud();
}

stereoBtn.addEventListener('click', () => setStereo(!stereo));

fullscreenBtn.addEventListener('click', async () => {
  try {
    await document.documentElement.requestFullscreen();
    await screen.orientation.lock('landscape');
  } catch {
    /* nem todo navegador permite; não crítico */
  }
});

EXAMPLES.forEach((ex, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = ex.name;
  if (i === 0) b.classList.add('active-example');
  b.addEventListener('click', () => loadCircuit(i));
  examplesEl.appendChild(b);

  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = ex.name;
  exampleSel.appendChild(opt);
});
exampleSel.addEventListener('change', () => loadCircuit(Number(exampleSel.value)));

startBtn.addEventListener('click', async () => {
  try {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (typeof DOE?.requestPermission === 'function') {
      bootLog('pedindo permissão do sensor…');
      try {
        const res = await DOE.requestPermission();
        bootLog(`sensor: ${res}`);
        if (res !== 'granted') gateMsg.textContent = 'Permissão de sensor negada — modo arrastar ativo.';
      } catch {
        bootLog('sensor: falha no pedido');
        gateMsg.textContent = 'Permissão de sensor falhou — modo arrastar ativo.';
      }
    } else {
      bootLog('sensor: sem pedido (Android/navegador livre)');
    }
    window.addEventListener('deviceorientation', onOrientation);
    gate.classList.add('hidden');
    bootLog('cena ativa: mire e toque');
    setTimeout(() => {
      if (gyroState !== 'active') {
        gyroState = 'absent';
        bootLog('giroscópio ausente: arraste para olhar');
        drawHud();
      } else {
        bootLog('giroscópio ativo');
      }
    }, 2500);
    drawHud();
  } catch (err) {
    fatal(`Falha ao entrar: ${(err as Error).message}`);
  }
});

function checkOrientation() {
  portraitEl.classList.toggle('hidden', window.innerWidth > window.innerHeight);
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
checkOrientation();

// ------------------------------------------------------------ loop

const size = new THREE.Vector2();
const tmpRight = new THREE.Vector3();

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}
window.addEventListener('resize', resize);
resize();

function frame() {
  requestAnimationFrame(frame);
  renderFrame();
}

function renderFrame() {

  if (gyroState === 'active') {
    applyGyro(head.quaternion);
  } else {
    head.quaternion.setFromEuler(new THREE.Euler(manual.pitch, manual.yaw, 0, 'YXZ'));
  }
  head.updateMatrixWorld();

  renderer.getSize(size);
  const w = Math.floor(size.x);
  const h = Math.floor(size.y);
  const halfW = stereo ? Math.floor(w / 2) : w;
  const eyeW = stereo ? halfW : w;
  const eyeOffset = stereo ? IPD / 2 : 0;

  tmpRight.set(1, 0, 0).applyQuaternion(head.quaternion);
  for (const eye of eyes) {
    eye.cam.quaternion.copy(head.quaternion);
    eye.cam.position.copy(head.position).addScaledVector(tmpRight, eye.side * eyeOffset);
    const aspect = eyeW / h;
    if (eye.cam.aspect !== aspect) {
      eye.cam.aspect = aspect;
      eye.cam.updateProjectionMatrix();
    }
  }

  renderer.setScissorTest(true);
  for (let i = 0; i < (stereo ? 2 : 1); i++) {
    const eye = eyes[i];
    const x = stereo ? i * halfW : 0;
    for (let j = 0; j < eyes.length; j++) eyes[j].cam.visible = j === i;
    renderer.setScissor(x, 0, eyeW, h);
    renderer.setViewport(x, 0, eyeW, h);
    renderer.render(scene, eye.cam);
  }
  renderer.setScissorTest(false);
}

loadCircuit(0);
bootLog(`WebGL ok · bancada pronta (${EXAMPLES.length} circuitos)`);
frame();

// Gancho mínimo de suporte (estado legível por automação/remoto).
(window as unknown as { __cb?: unknown }).__cb = {
  stats: () => ({ gyroState, stereo, example: exampleName, selected: selectedId }),
  // Aponta a câmera (testes e suporte): yaw/pitch em radianos, modo manual.
  look: (yaw: number, pitch: number) => {
    gyroState = 'absent';
    manual.yaw = yaw;
    manual.pitch = pitch;
    drawHud();
  },
  // Lê pixels do quadro atual (coordenadas 0..1 a partir do canto superior
  // esquerdo): prova que a cena desenha de verdade, não só que não há erros.
  sample: (points: Array<[number, number]>) => {
    renderFrame();
    const gl = renderer.getContext();
    const bw = gl.drawingBufferWidth;
    const bh = gl.drawingBufferHeight;
    const px = new Uint8Array(4);
    const out: Record<string, number[]> = {};
    for (const [fx, fy] of points) {
      gl.readPixels(Math.floor(fx * bw), Math.floor((1 - fy) * bh), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      out[`${fx},${fy}`] = [px[0], px[1], px[2]];
    }
    return out;
  },
};
