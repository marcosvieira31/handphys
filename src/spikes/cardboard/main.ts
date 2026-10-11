import * as THREE from 'three';
import '../../styles/spike.css';

/**
 * Spike 0.2 — validar render estéreo (Cardboard) + giroscópio no celular.
 * Mede: fps em estéreo, presença do giroscópio, latência percebida da mira.
 * Sensores exigem HTTPS — se não houver giroscópio, cai para "arrastar para olhar".
 *
 * Arquitetura de estéreo: UMA CÂMERA POR OLHO (não setViewOffset), porque
 * elementos filhos da câmera (mira, HUD) precisam estar centrados em cada olho —
 * com setViewOffset eles cairiam na costura entre as metades da tela.
 */

const IPD = 0.064; // distância interpupilar típica (m)
const EYE_FOV = 75; // FOV vertical por olho (Cardboard típico: 60–75°)
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
const BG_BASE = new THREE.Color(0x0b0f14);
const BG_EYE = [new THREE.Color(0xff2020), new THREE.Color(0x2040ff)];
scene.background = BG_BASE;
scene.fog = new THREE.Fog(0x0b0f14, 8, 24);

// ---------------------------------------------------------------- câmeras

// "head" carrega a pose da cabeça e serve de base para o raycast ( centro da visão ).
const head = new THREE.PerspectiveCamera(EYE_FOV, 1, 0.05, 100);
head.rotation.order = 'YXZ';
head.position.set(0, HEAD_HEIGHT, 0);

type Eye = { cam: THREE.PerspectiveCamera; side: -1 | 1 };
const eyes: [Eye, Eye] = [
  { cam: new THREE.PerspectiveCamera(EYE_FOV, 1, 0.05, 100), side: -1 },
  { cam: new THREE.PerspectiveCamera(EYE_FOV, 1, 0.05, 100), side: 1 },
];
for (const eye of eyes) {
  eye.cam.rotation.order = 'YXZ';
  eye.cam.position.copy(head.position);
  scene.add(eye.cam); // precisa estar na cena para os filhos (mira/HUD) serem renderizados
}

// ------------------------------------------------------------------ cena

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

function addPart(
  name: string,
  geo: THREE.BufferGeometry,
  color: number,
  pos: [number, number, number],
  rot?: [number, number, number],
) {
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

// ------------------------------------------------- mira e HUD (por olho)

const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512;
hudCanvas.height = 256;
const hudCtx = hudCanvas.getContext('2d')!;
const hudTexture = new THREE.CanvasTexture(hudCanvas);

// Uma textura, duas malhas (uma por olho): HUD centrado em cada olho.
for (const eye of eyes) {
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.012, 0.017, 32),
    new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.85 }),
  );
  reticle.position.set(0, 0, -1);
  eye.cam.add(reticle);

  const hud = new THREE.Mesh(
    new THREE.PlaneGeometry(0.64, 0.32),
    new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true }),
  );
  hud.position.set(0, -0.46, -1);
  eye.cam.add(hud);
}

// Marcador de depuração: objeto de cena (não filho da câmera) à direita da cabeça.
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xff00ff }),
);
marker.visible = false;
scene.add(marker);

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
  head.updateMatrixWorld();
  raycaster.setFromCamera(center, head);
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
let eyeDebug = false;
let markerOn = false;
let pendingSample: { resolve: (v: Record<string, number[]>) => void; points: Array<[number, number]> } | null = null;
let pendingMap: { resolve: (v: string) => void; cols: number; rows: number } | null = null;

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
const tmpRight = new THREE.Vector3();

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
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
    applyGyro(head.quaternion);
  } else {
    head.quaternion.setFromEuler(new THREE.Euler(manual.pitch, manual.yaw, 0, 'YXZ'));
  }
  head.updateMatrixWorld();

  // Marcador de depuração (objeto de cena, não filho da câmera).
  marker.visible = markerOn;
  if (markerOn) {
    marker.position.set(0.28, -0.35, -1).applyQuaternion(head.quaternion).add(head.position);
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
  const halfW = stereo ? Math.floor(w / 2) : w;
  const eyeW = stereo ? halfW : w;
  const eyeOffset = stereo ? IPD / 2 : 0;

  // Pose e projeção de cada olho.
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

  // Render: uma passagem por olho, cada uma com viewport/scissor próprios.
  // Só a câmera do olho atual fica visível na cena, senão os filhos (mira/HUD)
  // do outro olho seriam desenhados na passagem deste.
  renderer.setScissorTest(true);
  for (let i = 0; i < (stereo ? 2 : 1); i++) {
    const eye = eyes[i];
    const x = stereo ? i * halfW : 0;
    for (let j = 0; j < eyes.length; j++) eyes[j].cam.visible = j === i;
    scene.background = eyeDebug ? BG_EYE[i] : BG_BASE;
    renderer.setScissor(x, 0, eyeW, h);
    renderer.setViewport(x, 0, eyeW, h);
    renderer.render(scene, eye.cam);
  }
  renderer.setScissorTest(false);

  // Depuração: amostra o framebuffer no fim do quadro.
  if (pendingSample) {
    const gl = renderer.getContext();
    const bw = gl.drawingBufferWidth;
    const bh = gl.drawingBufferHeight;
    const px = new Uint8Array(4);
    const out: Record<string, number[]> = {};
    for (const [fx, fy] of pendingSample.points) {
      gl.readPixels(Math.floor(bw * fx), Math.floor(bh * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      out[`${fx.toFixed(3)},${fy.toFixed(3)}`] = [px[0], px[1], px[2]];
    }
    pendingSample.resolve(out);
    pendingSample = null;
  }

  // Depuração: mapa de cores do framebuffer (grade), lido no fim do quadro.
  if (pendingMap) {
    const gl = renderer.getContext();
    const bw = gl.drawingBufferWidth;
    const bh = gl.drawingBufferHeight;
    const px = new Uint8Array(4);
    const { cols, rows } = pendingMap;
    const lines: string[] = [];
    for (let r = rows - 1; r >= 0; r--) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        gl.readPixels(
          Math.floor(((c + 0.5) / cols) * bw),
          Math.floor(((r + 0.5) / rows) * bh),
          1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px,
        );
        const [R, G, B] = [px[0], px[1], px[2]];
        line +=
          R > 150 && G < 90 && B < 90 ? 'R' :
          B > 150 && R < 90 && G < 120 ? 'B' :
          R > 150 && B > 150 && G < 90 ? 'M' :
          R > 190 && G > 190 && B > 190 ? 'W' :
          R > 120 && G > 120 && B < 90 ? 'Y' :
          R + G + B < 60 ? '.' : ',';
      }
      lines.push(line);
    }
    pendingMap.resolve(lines.join('\n'));
    pendingMap = null;
  }
}

// Gancho de depuração: permite medir o spike por automação (não faz parte do produto).
(window as unknown as { __spike?: unknown }).__spike = {
  stats: () => ({
    fps: Number(fps.toFixed(1)),
    gyroState,
    stereo,
    selections,
    lastSelected,
    webgl: renderer.getContext().getParameter(renderer.getContext().VERSION),
  }),
  gl: () => {
    const vp = new THREE.Vector4();
    const sc = new THREE.Vector4();
    renderer.getViewport(vp);
    renderer.getScissor(sc);
    return {
      viewport: vp.toArray(),
      scissor: sc.toArray(),
      size: renderer.getSize(new THREE.Vector2()).toArray(),
      pixelRatio: renderer.getPixelRatio(),
      canvasBuffer: [canvas.width, canvas.height],
      eyeAspect: eyes.map((e) => Number(e.cam.aspect.toFixed(3))),
    };
  },
  // Permite apontar a câmera programaticamente nos testes.
  look: (yaw: number, pitch: number) => {
    manual.yaw = yaw;
    manual.pitch = pitch;
  },
  setMarker: (on: boolean) => {
    markerOn = on;
  },
  setEyeDebug: (on: boolean) => {
    eyeDebug = on;
  },
  // Força o modo manual (ignora giroscópio) nos testes.
  forceManual: () => {
    gyroState = 'absent';
  },
  // Amostra pixels do framebuffer no final de um quadro (depuração).
  // `points` é uma lista de pares normalizados [fx, fy] (y em coordenadas WebGL, 0 = base).
  sample: (points: Array<[number, number]>) =>
    new Promise<Record<string, number[]>>((resolve) => {
      pendingSample = { resolve, points };
    }),
  // Mapa de cores do framebuffer (grade), lido dentro do loop de render.
  map: (cols = 24, rows = 14) =>
    new Promise<string>((resolve) => {
      pendingMap = { resolve, cols, rows };
    }),
};

drawHud();
frame();
