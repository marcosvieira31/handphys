import * as THREE from 'three';
import '../../styles/spike.css';

/**
 * Spike 0.2 — validar render estéreo (Cardboard) + giroscópio no celular.
 * Mede: fps em estéreo, presença do giroscópio, latência percebida da mira.
 * Sensores exigem HTTPS — se não houver giroscópio, cai para "arrastar para olhar".
 */

const IPD = 0.064; // distância interpupilar típica (m)
const HEAD_HEIGHT = 1.6;
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const gate = document.querySelector<HTMLElement>('#gate')!;
const gateMsg = document.querySelector<HTMLElement>('#gate-msg')!;
const startBtn = document.querySelector<HTMLButtonElement>('#start')!;
const portraitEl = document.querySelector<HTMLElement>('#portrait')!;
const stereoBtn = document.querySelector<HTMLButtonElement>('#toggle-stereo')!;
const fullscreenBtn = document.querySelector<HTMLButtonElement>('#fullscreen')!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
scene.fog = new THREE.Fog(0x0b0f14, 8, 24);

const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 100);
camera.rotation.order = 'YXZ';
const headPos = new THREE.Vector3(0, HEAD_HEIGHT, 0);
camera.position.copy(headPos);
scene.add(camera);

// ---------------------------------------------------------------- cena

scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x20262e, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(2, 4, 2);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x151a21 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
scene.add(new THREE.GridHelper(40, 40, 0x2d333b, 0x1d232b));

const tableTop = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 0.06, 0.9),
  new THREE.MeshStandardMaterial({ color: 0x6b5140 }),
);
tableTop.position.set(0, 0.75, 0);
scene.add(tableTop);
for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
  const leg = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.72, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x3a3f47 }),
  );
  leg.position.set(sx * 0.74, 0.36, sz * 0.39);
  scene.add(leg);
}

type Selectable = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
const selectables: Selectable[] = [];

function addPart(name: string, geo: THREE.BufferGeometry, color: number, pos: [number, number, number], rot?: [number, number, number]) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  mesh.name = name;
  mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  mesh.userData.flashUntil = 0;
  scene.add(mesh);
  selectables.push(mesh);
  return mesh;
}

// Objetos da bancada (formas simples; a Fase 1 modela os componentes reais).
addPart('pilha', new THREE.CylinderGeometry(0.05, 0.05, 0.24, 24), 0xb5342a, [-0.42, 0.83, 0], [0, 0, Math.PI / 2]);
addPart('resistor', new THREE.BoxGeometry(0.18, 0.06, 0.06), 0xd9c39a, [0, 0.81, 0.12]);
addPart('capacitor', new THREE.CylinderGeometry(0.04, 0.04, 0.13, 24), 0x2f5fbf, [0.16, 0.845, -0.14]);
addPart('lâmpada', new THREE.SphereGeometry(0.06, 24, 16), 0xf2d34a, [0.44, 0.84, 0.06]);

// Mira fixa no centro do olho.
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.012, 0.017, 32),
  new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.85 }),
);
reticle.position.set(0, 0, -1);
camera.add(reticle);

// HUD dentro da cena (visível nos dois olhos).
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512;
hudCanvas.height = 256;
const hudCtx = hudCanvas.getContext('2d')!;
const hudTexture = new THREE.CanvasTexture(hudCanvas);
const hud = new THREE.Mesh(
  new THREE.PlaneGeometry(0.64, 0.32),
  new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true }),
);
hud.position.set(0, -0.46, -1);
camera.add(hud);

// ------------------------------------------------------- giroscópio

type GyroState = 'off' | 'active' | 'absent';
let gyroState: GyroState = 'off';
let lastGyroAt = 0;
const orientation = { alpha: 0, beta: 0, gamma: 0, screenAngle: 0 };

const euler = new THREE.Euler();
const qScreen = new THREE.Quaternion();
const zAxis = new THREE.Vector3(0, 0, 1);
// -90° em X: o eixo do celular (y) vira o eixo de visão da cabeça.
const qAdjust = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

function onOrientation(e: DeviceOrientationEvent) {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  orientation.alpha = THREE.MathUtils.degToRad(e.alpha);
  orientation.beta = THREE.MathUtils.degToRad(e.beta);
  orientation.gamma = THREE.MathUtils.degToRad(e.gamma);
  orientation.screenAngle = THREE.MathUtils.degToRad(
    screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0,
  );
  lastGyroAt = performance.now();
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

const manual = { yaw: 0, pitch: 0 };
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
let selections = 0;
let lastSelected = '—';

function selectCenter() {
  raycaster.setFromCamera(center, camera);
  const hit = raycaster.intersectObjects(selectables, false)[0];
  if (!hit) return;
  selections += 1;
  lastSelected = hit.object.name;
  hit.object.userData.flashUntil = performance.now() + 600;
  drawHud();
}

// -------------------------------------------------------------- HUD

let fps = 0;
let hudDirty = 0;

function drawHud() {
  const gyroLabel =
    gyroState === 'active' ? 'GIROSCÓPIO: OK' :
    gyroState === 'absent' ? 'SEM GIROSCÓPIO → arraste' : 'giroscópio: aguardando';
  hudCtx.clearRect(0, 0, 512, 256);
  hudCtx.fillStyle = 'rgba(13,17,23,0.75)';
  hudCtx.fillRect(0, 0, 512, 256);
  hudCtx.fillStyle = '#e6edf3';
  hudCtx.font = 'bold 34px system-ui';
  hudCtx.fillText(`FPS ${fps.toFixed(0)}`, 24, 56);
  hudCtx.font = '30px system-ui';
  hudCtx.fillStyle = gyroState === 'active' ? '#3fb950' : '#d29922';
  hudCtx.fillText(gyroLabel, 24, 104);
  if (lastGyroAt) {
    hudCtx.fillStyle = '#9198a1';
    hudCtx.font = '24px system-ui';
    hudCtx.fillText(`último sinal há ${((performance.now() - lastGyroAt) / 1000).toFixed(1)} s`, 24, 136);
    hudCtx.font = '30px system-ui';
  }
  hudCtx.fillStyle = '#58a6ff';
  hudCtx.fillText(`Estéreo: ${stereo ? 'ON' : 'OFF'} · IPD ${IPD * 1000} mm`, 24, 176);
  hudCtx.fillStyle = '#e6edf3';
  hudCtx.fillText(`Seleções: ${selections} (${lastSelected})`, 24, 224);
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
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 's') setStereo(!stereo);
});

fullscreenBtn.addEventListener('click', async () => {
  try {
    await document.documentElement.requestFullscreen();
    await screen.orientation.lock('landscape');
  } catch {
    /* nem todo navegador permite; não crítico no spike */
  }
});

startBtn.addEventListener('click', async () => {
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  if (typeof DOE?.requestPermission === 'function') {
    try {
      const res = await DOE.requestPermission();
      if (res !== 'granted') gateMsg.textContent = 'Permissão de sensor negada — modo arrastar ativo.';
    } catch {
      gateMsg.textContent = 'Permissão de sensor falhou — modo arrastar ativo.';
    }
  }
  window.addEventListener('deviceorientation', onOrientation);
  gate.classList.add('hidden');
  // Sem evento de orientação em 2,5 s → assume ausência de giroscópio.
  setTimeout(() => {
    if (gyroState !== 'active') {
      gyroState = 'absent';
      drawHud();
    }
  }, 2500);
  drawHud();
});

function checkOrientation() {
  portraitEl.classList.toggle('hidden', window.innerWidth > window.innerHeight);
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
checkOrientation();

// ------------------------------------------------------------ loop

const size = new THREE.Vector2();

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let lastFrame = performance.now();

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = now - lastFrame;
  lastFrame = now;
  fps = fps ? fps * 0.9 + (1000 / Math.max(dt, 1)) * 0.1 : 1000 / Math.max(dt, 1);

  // Pose da cabeça: giroscópio quando disponível, arrastar como fallback.
  if (gyroState === 'active') {
    applyGyro(camera.quaternion);
  } else {
    camera.quaternion.setFromEuler(new THREE.Euler(manual.pitch, manual.yaw, 0, 'YXZ'));
  }

  // Piscar objeto selecionado.
  for (const m of selectables) {
    const flash = (m.userData.flashUntil as number) > now;
    m.material.emissive.setHex(flash ? 0x3fb950 : 0x000000);
    m.material.emissiveIntensity = flash ? 1.2 : 0;
  }

  if (now - hudDirty > 250) {
    hudDirty = now;
    drawHud();
  }

  renderer.getSize(size);
  const w = Math.floor(size.x);
  const h = Math.floor(size.y);
  renderer.setScissorTest(true);

  const halfW = stereo ? Math.floor(w / 2) : w;
  const eyes = stereo ? 2 : 1;
  for (let eye = 0; eye < eyes; eye++) {
    const x = eye * halfW;
    if (stereo) {
      camera.setViewOffset(w, h, x, 0, halfW, h);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      camera.position.copy(headPos).addScaledVector(right, eye === 0 ? -IPD / 2 : IPD / 2);
    } else {
      camera.clearViewOffset();
      camera.position.copy(headPos);
      camera.aspect = w / h;
    }
    camera.updateProjectionMatrix();
    renderer.setScissor(x, 0, halfW, h);
    renderer.setViewport(x, 0, halfW, h);
    renderer.render(scene, camera);
  }
  renderer.setScissorTest(false);
}

drawHud();
frame();
