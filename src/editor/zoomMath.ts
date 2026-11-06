import type { Pt } from '../core/netlist';
import { CELL, GRID } from './coords';

/** Lado do quadro em unidades do quadro (30 células × 16 px = 480). */
export const BOARD = GRID * CELL;
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

/**
 * Vista do quadro 2D: `zoom` (1 = o quadro inteiro cabe) e `pan`, que é o
 * deslocamento do CENTRO do quadro em unidades do quadro. Tudo deriva disso —
 * o viewBox, o âncora do zoom e o enclausuramento do quadro na tela.
 */
export interface View {
  zoom: number;
  pan: Pt;
}

export const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

export const centerOf = (v: View): Pt => ({ x: BOARD / 2 + v.pan.x, y: BOARD / 2 + v.pan.y });

/** Retângulo do viewBox para a vista (o que o SVG mostra). */
export function viewBoxOf(v: View): { x: number; y: number; w: number; h: number } {
  const w = BOARD / v.zoom;
  const c = centerOf(v);
  return { x: c.x - w / 2, y: c.y - w / 2, w, h: w };
}

/** Centro preso para o quadro não escapar da tela (ou sobrar vazio, se zoom < 1). */
function clampCenter(c: Pt, w: number): Pt {
  const f = (a: number) => (w >= BOARD ? BOARD / 2 : Math.max(w / 2, Math.min(BOARD - w / 2, a)));
  return { x: f(c.x), y: f(c.y) };
}

/**
 * Zoom mantendo `anchor` (unidades do quadro) preso no MESMO ponto da tela —
 * é o que faz a roda do mouse ampliar "embaixo do cursor" e o gesto de pinça
 * no toque acompanhar os dedos. `anchor` nulo amplia no centro.
 */
export function zoomAbout(v: View, factor: number, anchor: Pt | null): View {
  const z1 = clampZoom(v.zoom * factor);
  if (z1 === v.zoom) return v;
  const r = v.zoom / z1; // razão entre as larguras do viewBox
  const c0 = centerOf(v);
  const a = anchor ?? c0;
  const c1 = clampCenter({ x: c0.x * r + a.x * (1 - r), y: c0.y * r + a.y * (1 - r) }, BOARD / z1);
  return { zoom: z1, pan: { x: c1.x - BOARD / 2, y: c1.y - BOARD / 2 } };
}

/**
 * Arraste em px de tela => desloca a vista. Os dedos se movem p/ a direita e o
 * CONTEÚDO acompanha (a vista olha mais para a esquerda).
 */
export function panPx(v: View, dxPx: number, dyPx: number, viewportPx: number): View {
  const vb = viewBoxOf(v);
  const k = vb.w / Math.max(1, viewportPx); // unidades do quadro por px de tela
  const c = centerOf(v);
  const c1 = clampCenter({ x: c.x - dxPx * k, y: c.y - dyPx * k }, vb.w);
  return { zoom: v.zoom, pan: { x: c1.x - BOARD / 2, y: c1.y - BOARD / 2 } };
}

/** Folga em volta do circuito enquadrado, em células (cabe a etiqueta do valor). */
const MARGEM = 2.5;
/** Teto do enquadramento automático: um laço de duas peças não vira lupa. */
export const ZOOM_AUTO_MAX = 2.5;

/**
 * Enquadra o CONTEÚDO: a vista que mostra o circuito inteiro, centrado e com
 * folga — é o que acontece ao abrir um exemplo ou um link. Antes a vista ficava
 * no quadro inteiro (zoom 1) e o circuito do exemplo ocupava um canto, miúdo,
 * com dois terços da tela de grade vazia. Quadro vazio ⇒ a vista de sempre.
 */
export function enquadrarConteudo(doc: {
  comps: readonly Pt[];
  wires: readonly { from: Pt; to: Pt }[];
}): View {
  const pts: Pt[] = [...doc.comps, ...doc.wires.flatMap((w) => [w.from, w.to])];
  if (!pts.length) return { zoom: 1, pan: { x: 0, y: 0 } };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs) - MARGEM;
  const x1 = Math.max(...xs) + MARGEM;
  const y0 = Math.min(...ys) - MARGEM;
  const y1 = Math.max(...ys) + MARGEM;
  const lado = Math.max(x1 - x0, y1 - y0, 1) * CELL;
  const zoom = Math.min(ZOOM_AUTO_MAX, BOARD / lado);
  return frameAt({ x: ((x0 + x1) / 2) * CELL, y: ((y0 + y1) / 2) * CELL }, zoom);
}

/**
 * Leva o circuito para o MEIO do quadro (translação em células inteiras, sem
 * mudar nada da topologia). Os exemplos e os links antigos moram no canto de
 * cima à esquerda; com a vista presa dentro do quadro, ampliar sobre o canto
 * deixava o circuito colado na borda da tela. No meio, o enquadramento centra
 * de verdade — e sobra quadro para todos os lados quando o aluno for crescer
 * o circuito.
 */
export function centrarNoQuadro<
  D extends { comps: readonly (Pt & object)[]; wires: readonly { from: Pt; to: Pt }[] },
>(doc: D): D {
  const pts: Pt[] = [...doc.comps, ...doc.wires.flatMap((w) => [w.from, w.to])];
  if (!pts.length) return doc;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const max = GRID - 1;
  // desloca para o centro, sem deixar nenhum ponto sair da grade
  const desl = (a0: number, a1: number) =>
    Math.max(-a0, Math.min(max - a1, Math.round(max / 2 - (a0 + a1) / 2)));
  const dx = desl(x0, x1);
  const dy = desl(y0, y1);
  if (!dx && !dy) return doc;
  const mv = (p: Pt) => ({ x: p.x + dx, y: p.y + dy });
  return {
    ...doc,
    comps: doc.comps.map((c) => ({ ...c, ...mv(c) })),
    wires: doc.wires.map((w) => ({ ...w, from: mv(w.from), to: mv(w.to) })),
  };
}

/**
 * Enquadra o quadro num CENTRO (unidades do quadro) e ZOOM dados — o caminho
 * INVERSO de derivar a vista: é como a bancada 3D escreve de volta no quadro
 * o que a câmera está olhando. Passa pelos MESMOS clamps da vista, então o
 * resultado é sempre um estado 2D legítimo (nunca escapa da tela).
 */
export function frameAt(center: Pt, zoom: number): View {
  const z = clampZoom(zoom);
  const c = clampCenter(center, BOARD / z);
  return { zoom: z, pan: { x: c.x - BOARD / 2, y: c.y - BOARD / 2 } };
}
