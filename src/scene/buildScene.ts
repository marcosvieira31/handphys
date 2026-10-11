import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CircuitDoc, Reading } from '../core/netlist';
import { voltageColor } from '../editor/colors';
import { layoutScene, WORLD, WIRE_Y, type CompNode, type SceneLayout } from './layout';

/**
 * Bancada 3D do MESMO documento do esquemático (three.js puro, sem R3F:
 * controle direto do render para os modos tela única/estéreo/WebXR).
 * Criado sob demanda (import dinâmico) para não pesar a carga inicial.
 */
export interface LabView {
  update(doc: CircuitDoc, reading: Reading): void;
  dispose(): void;
}

const METAL = 0x9aa3ad;
const DARK = 0x1c2128;

function mat(color: number | string, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...extra });
}

/** Haste metálica ao longo de X, de `x0` até `x1` (terminais em ±1). */
function lead(x0: number, x1: number, y: number): THREE.Mesh {
  const len = Math.max(0.05, Math.abs(x1 - x0));
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, len, 8), mat(METAL));
  m.rotation.z = Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, 0);
  return m;
}

function buildComp(c: CompNode): THREE.Group {
  const g = new THREE.Group();
  g.position.set(c.wx, 0, c.wz);
  g.rotation.y = c.rotY;
  const body = new THREE.Group();
  g.add(body);

  switch (c.kind) {
    case 'resistor': {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 0.42), mat(0xd2a24c));
      box.position.y = WIRE_Y;
      body.add(box);
      for (const [dx, color] of [[-0.45, 0x6b3f12], [0, 0x111111], [0.45, 0xb02020]] as const) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.44), mat(color));
        band.position.set(dx, WIRE_Y, 0);
        body.add(band);
      }
      body.add(lead(0.75, 1, WIRE_Y), lead(-0.75, -1, WIRE_Y));
      break;
    }
    case 'vsource': {
      // pilha deitada: corpo + tampa negativa + mamilo positivo
      const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.5, 20), mat(0x2456a6));
      cell.rotation.z = Math.PI / 2;
      cell.position.y = WIRE_Y;
      body.add(cell);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.1, 20), mat(METAL));
      cap.rotation.z = Math.PI / 2;
      cap.position.set(-0.8, WIRE_Y, 0);
      body.add(cap);
      const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.16, 12), mat(METAL));
      nub.rotation.z = Math.PI / 2;
      nub.position.set(0.83, WIRE_Y, 0);
      body.add(nub);
      break;
    }
    case 'lamp': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.3, 16), mat(METAL));
      base.position.y = 0.15;
      body.add(base);
      const glass = new THREE.Mesh(
        new THREE.SphereGeometry(0.52, 24, 18),
        new THREE.MeshStandardMaterial({
          color: 0xfff3d6,
          transparent: true,
          opacity: 0.5,
          roughness: 0.15,
          metalness: 0,
          emissive: 0xf2cc60,
          emissiveIntensity: 0,
        }),
      );
      glass.position.y = 0.85;
      glass.userData.glass = true;
      body.add(glass);
      const filament = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.3, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0xffc861, emissiveIntensity: 0 }),
      );
      filament.position.y = 0.8;
      filament.userData.filament = true;
      body.add(filament);
      const stem0 = lead(-1, -0.3, WIRE_Y);
      const stem1 = lead(0.3, 1, WIRE_Y);
      body.add(stem0, stem1);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), mat(METAL));
      post.position.y = 0.45;
      body.add(post);
      break;
    }
    case 'capacitor': {
      for (const s of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.72, 0.72), mat(METAL));
        plate.position.set(s * 0.22, 0.45, 0);
        body.add(plate);
      }
      body.add(lead(0.27, 1, WIRE_Y), lead(-0.27, -1, WIRE_Y));
      for (const s of [-1, 1]) {
        const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45 - WIRE_Y, 8), mat(METAL));
        drop.position.set(s * 0.22, (0.45 + WIRE_Y) / 2, 0);
        body.add(drop);
      }
      break;
    }
    case 'switch': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.5), mat(DARK));
      base.position.y = 0.07;
      body.add(base);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), mat(METAL));
        post.position.set(s * 0.5, 0.25, 0);
        body.add(post);
      }
      const hinge = new THREE.Group();
      hinge.position.set(-0.5, 0.4, 0);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.07, 0.13), mat(c.closed ? 0xe3b341 : METAL));
      blade.position.x = 0.5;
      hinge.add(blade);
      hinge.rotation.z = c.closed ? 0 : -0.55;
      hinge.userData.blade = true;
      body.add(hinge);
      body.add(lead(0.65, 1, WIRE_Y), lead(-0.65, -1, WIRE_Y));
      break;
    }
    case 'ground': {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), mat(METAL));
      post.position.y = 0.25;
      body.add(post);
      const widths = [1.3, 0.85, 0.4];
      widths.forEach((w, i) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.3), mat(METAL));
        bar.position.y = 0.52 - i * 0.2;
        body.add(bar);
      });
      break;
    }
  }
  g.userData.compId = c.id;
  return g;
}

function buildWire(points: [number, number, number][], color: string): THREE.Object3D {
  if (points.length < 2) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mat(color));
    const p = points[0] ?? [0, WIRE_Y, 0];
    dot.position.set(p[0], p[1], p[2]);
    return dot;
  }
  const v3 = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 1; i < v3.length; i++) path.add(new THREE.LineCurve3(v3[i - 1], v3[i]));
  const geo = new THREE.TubeGeometry(path, Math.max(8, v3.length * 6), 0.055, 6, false);
  return new THREE.Mesh(geo, mat(color, { roughness: 0.4, metalness: 0.1 }));
}

export function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
  });
  g.clear();
}

/** Bancada: tampo + grade (mesma grade do esquemático, vista de cima). */
export function buildBoard(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(WORLD + 1, 0.5, WORLD + 1), mat(0x11161d));
  top.position.y = -0.26;
  g.add(top);
  const grid = new THREE.GridHelper(WORLD, WORLD, 0x2d333b, 0x1c2128);
  grid.position.y = 0.005;
  g.add(grid);
  return g;
}

/**
 * Circuito como grupo three (componentes + fios), com userData.compId/wireId
 * para seleção e leitura. Usado pela vista desktop E pelo Cardboard.
 */
export function buildCircuitGroup(layout: SceneLayout): THREE.Group {
  const g = new THREE.Group();
  for (const c of layout.comps) g.add(buildComp(c));
  for (const w of layout.wires) {
    const mesh = buildWire(w.points, w.color);
    mesh.userData.wireId = w.id;
    g.add(mesh);
  }
  return g;
}

/** Aplica a leitura (cor dos fios, brilho) num grupo existente, sem reconstruir. */
export function applyLayoutReading(group: THREE.Object3D, layout: SceneLayout): void {
  const colorById = new Map(layout.wires.map((w) => [w.id, w.color]));
  const glowById = new Map(layout.comps.map((c) => [c.id, c.glow]));
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE.MeshStandardMaterial;
    if (mesh.userData.wireId && m.color) {
      m.color.set(colorById.get(mesh.userData.wireId) ?? '#7d8590');
    }
    if (mesh.userData.glass) m.emissiveIntensity = (glowById.get(compIdOf(mesh)) ?? 0) * 2.2;
    if (mesh.userData.filament) m.emissiveIntensity = (glowById.get(compIdOf(mesh)) ?? 0) * 3;
  });
}

/** Sobe na árvore até o grupo do componente (para o raycast da seleção). */
export function compIdOf(obj: THREE.Object3D): string {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (o.userData.compId) return o.userData.compId as string;
    o = o.parent;
  }
  return '';
}

export function createLabView(canvas: HTMLCanvasElement): LabView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0d12);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  camera.position.set(13, 17, 23);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 1);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 8;
  controls.maxDistance = 80;
  controls.maxPolarAngle = 1.45;

  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1d22, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(12, 20, 8);
  scene.add(sun);
  const lampLight = new THREE.PointLight(0xffd27a, 0, 16, 1.8);
  scene.add(lampLight);

  scene.add(buildBoard());

  const dyn = new THREE.Group();
  scene.add(dyn);
  let lastDoc: CircuitDoc | null = null;

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let raf = 0;
  let dead = false;
  const loop = () => {
    if (dead) return;
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();

  return {
    update(doc, reading) {
      const layout = layoutScene(doc, reading, voltageColor);
      if (doc !== lastDoc) {
        lastDoc = doc;
        disposeGroup(dyn);
        dyn.add(buildCircuitGroup(layout));
      }
      // leitura: cor dos fios, brilho das lâmpadas, luz compartilhada
      applyLayoutReading(dyn, layout);
      if (layout.lit.length) {
        const [x, y, z] = layout.lit[0];
        const topGlow = Math.max(0, ...layout.comps.filter((c) => c.kind === 'lamp').map((c) => c.glow));
        lampLight.position.set(x, y + 0.6, z);
        lampLight.intensity = 6 + topGlow * 30;
      } else {
        lampLight.intensity = 0;
      }
    },
    dispose() {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposeGroup(dyn);
      disposeGroup(scene);
      renderer.dispose();
    },
  };
}
