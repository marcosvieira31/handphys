import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CircuitDoc, CompKind, Pt, Reading } from '../core/netlist';
import { flowDuration } from '../core/flow';
import { voltageColor } from '../editor/colors';
import { CELL } from '../editor/coords';
import { clampZoom } from '../editor/zoomMath';
import {
  cumLength,
  ghostNode,
  layoutScene,
  pointAlong,
  WORLD,
  WIRE_Y,
  type CompNode,
  type SceneLayout,
} from './layout';

/**
 * Bancada 3D do MESMO documento do esquemático (three.js puro, sem R3F:
 * controle direto do render para os modos tela única/estéreo/WebXR).
 * Criado sob demanda (import dinâmico) para não pesar a carga inicial.
 */
export interface LabView {
  /**
   * Sincroniza a cena com o documento/leitura. `flow` liga e desliga as
   * gotas de corrente nos fios (padrão ligado).
   */
  update(doc: CircuitDoc, reading: Reading, flow?: boolean): void;
  /** Cursor normalizado (0..1, já espelhado) => célula da grade sob ele. */
  cellAt(nx: number, ny: number): { x: number; y: number } | null;
  /** Afasta/aproxima a câmera (o MESMO gesto de zoom do quadro 2D). */
  dolly(factor: number): void;
  /** Arraste no vazio da bancada => desloca câmera e ALVO juntos (px de tela). */
  panBy(dxPx: number, dyPx: number, viewportPx: number): void;
  /** Giro da bancada pela rotação das mãos (eixo vertical = o Z "para fora" do quadro 2D). */
  rollBy(rad: number): void;
  /**
   * Enquadra num CENTRO do quadro 2D (unidades do quadro) e ZOOM dados: a
   * câmera herda o enquadramento ao trocar de vista (o enquadramento é único
   * para as duas vistas). Os ângulos da órbita são os últimos guardados.
   */
  frameTo(center: Pt, zoom: number): void;
  /** Volta a câmera ao enquadro de chegada (ângulos inclusive). */
  resetView(): void;
  /**
   * AR DE BOLSO: a bancada escura sai de cena, o canvas fica TRANSPARENTE (o
   * vídeo da câmera entra atrás, posto pela DOM) e o circuito ganha uma sombra
   * de contato — ele passa a "estar" na mesa de verdade em vez de flutuar num
   * vazio escuro. A grade do quadro FICA: é ela que mostra onde é a bancada.
   */
  setAr(on: boolean): void;
  /**
   * FANTASMA do item armado: a peça translúcida sob a mira, para ver ONDE ela
   * cai antes de soltar. `null` limpa. Não é do documento (não entra no
   * raycast nem na leitura): some no instante em que a peça de verdade nasce.
   */
  setGhost(kind: CompKind | null, cell: Pt | null): void;
  dispose(): void;
}

/** Enquadro de chegada da bancada: de cima, enxergando a mesa inteira. */
const HOME_POS = new THREE.Vector3(13, 17, 23);
const HOME_TARGET = new THREE.Vector3(0, 0, 1);
/** Metade do mundo (grade de 30 células centrada na origem): célula 0 => −14,5. */
const HALF = (WORLD - 1) / 2;
/** Distância câmera→alvo na chegada: o "zoom 1" (bancada inteira) da vista 3D. */
export const HOME_DIST = HOME_POS.distanceTo(HOME_TARGET);
/** Órbita de chegada (azimute/polar da THREE.Spherical): o "de que lado" inicial. */
const HOME_SPH = new THREE.Spherical().setFromVector3(HOME_POS.clone().sub(HOME_TARGET));

/**
 * Ângulos da órbita (azimute e polar) que a vista 2D não guarda: são o "de
 * que lado o professor está olhando" a bancada. Sobrevivem ao desmontar a
 * cena (trocar 2D↔3D) — sem isso a câmera voltava ao enquadro fixo de chegada
 * toda vez que a vista 3D entrava de novo. Centro e distância NÃO ficam aqui:
 * esses vêm do quadro 2D, que é o enquadramento ÚNICO das duas vistas.
 */
let orbit: { theta: number; phi: number } | null = null;

/**
 * Centro do quadro 2D (unidades do viewBox: célula k = [16k, 16k+16)) => plano
 * da bancada (x do mundo, z do mundo). Ancora no CENTRO da célula — o mesmo
 * que `cellToWorld` leva a k−14,5 — então o centro do quadro (240) é o centro
 * da bancada (0) e as bordas batem nos extremos da mesa.
 */
export function boardToWorld(b: Pt): [number, number] {
  return [(b.x - CELL / 2) / CELL - HALF, (b.y - CELL / 2) / CELL - HALF];
}

/** Plano da bancada => centro do quadro 2D (inverso exato de boardToWorld). */
export function worldToBoard(wx: number, wz: number): Pt {
  return { x: (wx + HALF) * CELL + CELL / 2, y: (wz + HALF) * CELL + CELL / 2 };
}

/** Zoom 2D equivalente à distância da câmera (1 = bancada inteira = chegada). */
export function zoomForDist(dist: number): number {
  return clampZoom(HOME_DIST / Math.max(0.05, dist));
}

/** Distância da câmera para enquadrar um zoom 2D (inverso, ancorado no alvo). */
export function distForZoom(zoom: number): number {
  return HOME_DIST / clampZoom(zoom);
}

/**
 * Pan da bancada em px de tela: câmera e alvo andam JUNTOS no plano da tela
 * (a órbita fica intacta) e na escala certa — mundo por px depende da
 * distância até o alvo. O conteúdo acompanha o dedo: dedo p/ a direita
 * (dx>0) a câmera anda p/ a esquerda, dedo p/ baixo ela sobe.
 */
export function panCameraBy(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  dxPx: number,
  dyPx: number,
  heightPx: number,
): void {
  const dist = camera.position.distanceTo(target);
  const k = (2 * Math.tan((camera.fov * Math.PI) / 360) * dist) / Math.max(1, heightPx);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const delta = right.multiplyScalar(-dxPx * k).add(up.multiplyScalar(dyPx * k));
  camera.position.add(delta);
  target.add(delta);
}

const AXIS_UP = new THREE.Vector3(0, 1, 0);

/**
 * Giro da bancada pela ROTAÇÃO das mãos (gesto das duas mãos): a câmera
 * orbita o eixo VERTICAL passando pelo alvo — distância, altura (y) e alvo
 * intactos, só o azimute muda, como um prato giratório. O "eixo Z" que o
 * professor gira com as mãos é o eixo FORA DO PLANO do quadro 2D, que na
 * bancada deitada (mundo Y-em-cima) é o Y. Sinal "conteúdo acompanha as
 * mãos": mão girando no sentido horário de tela (y para baixo) => `rad` > 0
 * => a câmera orbita anti-horário por cima (o visto de cima gira horário,
 * junto com a mão).
 */
export function rollCameraBy(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  rad: number,
): void {
  const offset = camera.position.clone().sub(target);
  offset.applyAxisAngle(AXIS_UP, rad);
  camera.position.copy(target).add(offset);
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

/** Uma peça da bancada: corpo + terminais, no mundo e na rotação do nó. */
export function buildComp(c: CompNode): THREE.Group {
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

/**
 * Pinta um grupo como FANTASMA do item armado: véu azul translúcido que não
 * escreve no z-buffer (não esconde o que está atrás nem a própria peça). Os
 * materiais vêm de `mat()`, que cria um novo a cada peça — então tingir aqui
 * não encosta em nenhum componente de verdade.
 */
export function marcaFantasma(g: THREE.Object3D): void {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE.MeshStandardMaterial;
    m.transparent = true;
    m.opacity = 0.45;
    m.depthWrite = false;
    if (m.emissive) {
      m.emissive.set(0x58a6ff); // o azul da bancada: lê como "prévia" nos dois temas
      m.emissiveIntensity = 0.5;
    }
  });
}

/** Bancada: tampo + grade (mesma grade do esquemático, vista de cima). */
export function buildBoard(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(WORLD + 1, 0.5, WORLD + 1), mat(0x11161d));
  top.name = TAMPO;
  top.position.y = -0.26;
  g.add(top);
  const grid = new THREE.GridHelper(WORLD, WORLD, 0x2d333b, 0x1c2128);
  grid.name = 'grade';
  grid.position.y = 0.005;
  g.add(grid);
  return g;
}

/** Nome do tampo: no AR ele sai (o chão é a mesa de verdade) e a grade fica. */
const TAMPO = 'tampo';

/**
 * Sombra de contato do AR: um borrão radial desenhado na hora (sem asset e sem
 * textura baixada) que "assenta" o circuito na mesa. Sem ela o circuito flutua
 * sobre o vídeo e a mistura não convence.
 */
function sombraDeContato(): THREE.Mesh {
  const lado = 128;
  const tela = document.createElement('canvas');
  tela.width = tela.height = lado;
  const ctx = tela.getContext('2d');
  if (ctx) {
    const meio = lado / 2;
    const grad = ctx.createRadialGradient(meio, meio, 4, meio, meio, meio - 2);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.2)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, lado, lado);
  }
  const malha = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD + 2, WORLD + 2),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(tela),
      transparent: true,
      depthWrite: false, // é só um véu no chão: não esconde o que está em cima
    }),
  );
  malha.rotation.x = -Math.PI / 2;
  malha.position.y = -0.004; // sob a grade e sob as peças
  malha.visible = false;
  return malha;
}

/** Uma gota:3 esferas por trecho, andando no comprimento de arco. */
interface BeadPart {
  nodes: THREE.Object3D[];
  pts: [number, number, number][];
  cum: number[];
  total: number;
  /** Segundos para percorrer o trecho inteiro (∝ 1/intensidade). */
  dur: number;
  amps: number;
  phase: number;
}

/** Estado da animação de corrente do grupo (chamado por `advanceFlow`). */
interface FlowAnim {
  on: boolean;
  /** Marca do último quadro (performance.now()/1000). */
  t: number;
  group: THREE.Object3D;
  parts: BeadPart[];
}

/**
 * Circuito como grupo three (componentes + fios), com userData.compId/wireId
 * para seleção e leitura. Usado pela vista desktop E pelo Cardboard.
 * Também monta as gotas de corrente (userData.flow) — quem anima é
 * `advanceFlow`, chamado a cada quadro pelos dois laços de render.
 */
export function buildCircuitGroup(layout: SceneLayout): THREE.Group {
  const g = new THREE.Group();
  for (const c of layout.comps) g.add(buildComp(c));
  for (const w of layout.wires) {
    const mesh = buildWire(w.points, w.color);
    mesh.userData.wireId = w.id;
    g.add(mesh);
  }

  // gotas de corrente:3 por trecho que tenha corrente
  const beads = new THREE.Group();
  const parts: BeadPart[] = [];
  const geo = new THREE.SphereGeometry(0.085, 8, 8);
  const beadMat = mat(0xf2cc60, {
    emissive: 0xffb347,
    emissiveIntensity: 1.6,
    roughness: 0.35,
    metalness: 0,
  });
  for (const w of layout.wires) {
    for (const part of w.parts) {
      if (Math.abs(part.amps) < 1e-9 || part.points.length < 2) continue;
      const cum = cumLength(part.points);
      const total = cum[cum.length - 1];
      if (total <= 0) continue;
      // percurso completo mais curto que o ciclo do 2D: a distância já varia
      const dur = Math.min(10, Math.max(0.6, flowDuration(part.amps) * Math.max(1, total / 3)));
      const nodes = [0, 1, 2].map(() => {
        const m = new THREE.Mesh(geo, beadMat);
        beads.add(m);
        return m as THREE.Object3D;
      });
      parts.push({ nodes, pts: part.points, cum, total, dur, amps: part.amps, phase: 0 });
    }
  }
  g.add(beads);
  g.userData.flow = { on: true, t: 0, group: beads, parts } satisfies FlowAnim;
  return g;
}

/**
 * Anda com as gotas de corrente do grupo (chamar a cada quadro; o dt é
 * interno para os dois laços — desktop e Cardboard — não precisarem medir).
 * Com a animação desligada só mantém a invisibilidade.
 */
export function advanceFlow(root: THREE.Object3D | null): void {
  if (!root) return;
  const f = root.userData.flow as FlowAnim | undefined;
  if (!f) return;
  f.group.visible = f.on;
  if (!f.on) return;
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - (f.t || now)); // aba escondida não dá salto
  f.t = now;
  for (const p of f.parts) {
    p.phase = (p.phase + dt / p.dur) % 1;
    for (let i = 0; i < p.nodes.length; i++) {
      const u = (p.phase + i / p.nodes.length) % 1;
      const [x, y, z] = pointAlong(p.pts, p.cum, (p.amps < 0 ? 1 - u : u) * p.total);
      p.nodes[i].position.set(x, y, z);
    }
  }
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

export function createLabView(
  canvas: HTMLCanvasElement,
  onFraming?: (center: Pt, zoom: number) => void,
): LabView {
  // `alpha: true`: no AR de bolso o canvas precisa ser TRANSPARENTE para o
  // vídeo da câmera aparecer atrás dele; fora do AR o fundo é opaco, como era.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const COR_FUNDO = new THREE.Color(0x0a0d12);
  scene.background = COR_FUNDO;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  camera.position.copy(HOME_POS);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME_TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 8;
  controls.maxDistance = 80;
  controls.maxPolarAngle = 1.45;

  // O enquadramento é ÚNICO das duas vistas: a câmera escreve de volta no
  // quadro 2D o que está olhando (centro do alvo + zoom pela distância), e os
  // ângulos da órbita ficam em `orbit` (guardados ao desmontar). OrbitControls
  // só dispara 'change' quando a câmera anda de fato — e o PRIMEIRO update
  // sempre "anda" (lastPosition começa zerado), então até o primeiro frameTo a
  // câmera está só na chegada: isso é detalhe de montagem, não o que o
  // professor pediu olhar, e não pode estourar o enquadramento do quadro 2D.
  let primed = false;
  const syncFraming = () => {
    if (!primed) return;
    const b = worldToBoard(controls.target.x, controls.target.z);
    onFraming?.(b, zoomForDist(camera.position.distanceTo(controls.target)));
  };
  controls.addEventListener('change', syncFraming);

  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1d22, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(12, 20, 8);
  scene.add(sun);
  const lampLight = new THREE.PointLight(0xffd27a, 0, 16, 1.8);
  scene.add(lampLight);

  const bancada = buildBoard();
  scene.add(bancada);
  const tampo = bancada.getObjectByName(TAMPO);
  const sombra = sombraDeContato();
  scene.add(sombra);

  // AR de bolso: o fundo do canvas abre (o vídeo entra pela DOM), o tampo escuro
  // sai (o chão é a mesa de verdade) e a sombra de contato entra no lugar.
  let arLigado = false;
  const pintaFundo = () => {
    scene.background = arLigado ? null : COR_FUNDO;
    renderer.setClearAlpha(arLigado ? 0 : 1);
    if (tampo) tampo.visible = !arLigado;
    sombra.visible = arLigado;
  };
  pintaFundo();

  const dyn = new THREE.Group();
  scene.add(dyn);
  let lastDoc: CircuitDoc | null = null;
  let layout: SceneLayout | null = null;
  let circuit: THREE.Group | null = null; // componentes+fios+gotas (disposeGroup o destrói)

  // FANTASMA do item armado (a peça que ainda não existe, sob a mira): fica no
  // `scene`, FORA do `dyn`, de propósito — a mira (`cellAt`) faz raycast no
  // `dyn` e não pode enxergar a prévia, senão o fantasma "grudava" na própria
  // mira. Translúcido e sem escrever no z-buffer: é um véu, não uma peça.
  let fantasma: THREE.Group | null = null;
  let fantasmaMarca = ''; // kind + célula já pintados (não remonta à toa)
  const limpaFantasma = () => {
    if (!fantasma) return;
    scene.remove(fantasma);
    disposeGroup(fantasma);
    fantasma = null;
    fantasmaMarca = '';
  };
  const setGhost = (kind: CompKind | null, cell: Pt | null) => {
    if (!kind || !cell) {
      limpaFantasma();
      return;
    }
    const marca = `${kind}:${cell.x},${cell.y}`;
    if (marca === fantasmaMarca) return;
    limpaFantasma();
    fantasmaMarca = marca;
    fantasma = new THREE.Group();
    fantasma.add(buildComp(ghostNode(kind, cell)));
    marcaFantasma(fantasma);
    scene.add(fantasma);
  };

  // Mira da pinça no 3D: raio do dedo contra a bancada (plano y=0) => célula.
  // Se o raio acerta um componente, mira o CENTRO dele (o imã de terminal/corpo
  // faz o resto); senão, usa a célula da bancada sob o dedo. Cursor já espelhado.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();
  const cellAt = (nx: number, ny: number): { x: number; y: number } | null => {
    ndc.set(nx * 2 - 1, 1 - ny * 2);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hitPoint)) return null;
    const hit = ray.intersectObjects(dyn.children, true)[0];
    if (hit) {
      const id = compIdOf(hit.object);
      const node = id && layout ? layout.comps.find((c) => c.id === id) : undefined;
      if (node) return { x: node.wx + HALF, y: node.wz + HALF };
    }
    const x = hitPoint.x + HALF;
    const y = hitPoint.z + HALF;
    if (x < -1 || y < -1 || x > WORLD || y > WORLD) return null;
    return { x: Math.round(x), y: Math.round(y) };
  };

  // Duplo-clique no VAZIO da bancada => circuito no centro do enquadramento
  // (em cima de componente/fio quem decide é o clique normal, que seleciona).
  const onDblClick = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(dyn.children, true)[0];
    if (hit && (compIdOf(hit.object) || hit.object.userData.wireId)) return;
    camera.position.copy(HOME_POS);
    controls.target.copy(HOME_TARGET);
    controls.update();
  };
  canvas.addEventListener('dblclick', onDblClick);

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
    advanceFlow(circuit); // gotas de corrente andam no ritmo da corrente
    controls.update();
    renderer.render(scene, camera);
  };
  loop();

  return {
    update(doc, reading, flow = true) {
      layout = layoutScene(doc, reading, voltageColor);
      if (doc !== lastDoc) {
        lastDoc = doc;
        disposeGroup(dyn);
        circuit = buildCircuitGroup(layout);
        dyn.add(circuit);
      }
      const anim = circuit ? (circuit.userData.flow as FlowAnim | undefined) : undefined;
      if (anim) anim.on = flow;
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
    cellAt,
    dolly(factor: number) {
      // anda a câmera sobre a reta alvo->câmera: mesmo efeito do scroll do
      // OrbitControls, mas acionável pelos botões e pelo gesto de duas mãos
      const dir = camera.position.clone().sub(controls.target);
      const len = THREE.MathUtils.clamp(
        dir.length() / Math.max(0.05, factor),
        controls.minDistance,
        controls.maxDistance,
      );
      camera.position.copy(controls.target).add(dir.setLength(len));
      controls.update();
    },
    panBy(dxPx, dyPx, viewportPx) {
      // arraste no vazio (mouse ou pinça das mãos): a bancada acompanha o dedo
      panCameraBy(camera, controls.target, dxPx, dyPx, canvas.clientHeight || viewportPx || 1);
      controls.update();
    },
    rollBy(rad) {
      // rotação das mãos: orbita o eixo VERTICAL pelo alvo (o Z do quadro 2D)
      rollCameraBy(camera, controls.target, rad);
      controls.update();
    },
    frameTo(center, zoom) {
      // trocou para a bancada 3D: a câmera herda o enquadramento do quadro 2D
      // (centro sob o alvo, distância do zoom) e mantém os ângulos da órbita
      primed = true; // a partir daqui a câmera reporta o enquadramento ao quadro
      const [wx, wz] = boardToWorld(center);
      controls.target.set(wx, 0, wz);
      const sph = new THREE.Spherical(
        THREE.MathUtils.clamp(distForZoom(zoom), controls.minDistance, controls.maxDistance),
        orbit?.phi ?? HOME_SPH.phi,
        orbit?.theta ?? HOME_SPH.theta,
      );
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      controls.update();
    },
    resetView() {
      orbit = null; // o enquadro de chegada devolve o "de que lado" também
      primed = true;
      camera.position.copy(HOME_POS);
      controls.target.copy(HOME_TARGET);
      controls.update();
    },
    setAr(on) {
      if (on === arLigado) return;
      arLigado = on;
      pintaFundo();
    },
    setGhost,
    dispose() {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('dblclick', onDblClick);
      controls.removeEventListener('change', syncFraming);
      // guarda os ângulos da órbita: a próxima vista 3D volta a olhar de onde
      // o professor ficou, não do enquadro fixo de chegada
      const sph = new THREE.Spherical().setFromVector3(
        camera.position.clone().sub(controls.target),
      );
      orbit = { theta: sph.theta, phi: sph.phi };
      controls.dispose();
      (sombra.material as THREE.MeshBasicMaterial).map?.dispose(); // textura é nossa
      disposeGroup(dyn);
      disposeGroup(scene);
      renderer.dispose();
    },
  };
}
