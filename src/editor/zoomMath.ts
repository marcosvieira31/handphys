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
