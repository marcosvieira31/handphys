import { wireRoute, type Pt } from '../core/netlist';
import type { CircuitDoc } from '../core/netlist';

export const CELL = 16;
export const GRID = 30; // células 0..29, como no store
/** Mira do MODO FIO: generosa, pois nele nada se arrasta (sem conflito). */
export const WIRE_GRAB = 1.5;
/** Mira normal: o centro do componente (a 1,0 do terminal) continua arrastando. */
export const GRAB_DIST = 0.75;
/** Raio do imã ao SOLTAR (o preview do arraste é o resultado). */
export const SNAP_DIST = 1.5;

/**
 * Cliente => ponto do quadro (unidades do viewBox) pela matriz do SVG: exato
 * mesmo com zoom, sobra de layout ou preserveAspectRatio.
 */
export function clientToBoard(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
): Pt {
  if (!svg) return { x: 0, y: 0 };
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

/**
 * Cliente => célula da grade (pela matriz do SVG: exato mesmo com sobra de layout).
 * Usado pelo mouse E pela pinça: os dois apertam a mesma grade.
 */
export function clientToCell(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
): Pt {
  const p = clientToBoard(svg, clientX, clientY);
  // floor, não round: o clique cai DENTRO da célula (round erra no centro exato,
  // onde 7,5 arredonda para 8 por poeira de ponto flutuante).
  return {
    x: Math.max(0, Math.min(GRID - 1, Math.floor(p.x / CELL))),
    y: Math.max(0, Math.min(GRID - 1, Math.floor(p.y / CELL))),
  };
}

/**
 * A mira está sobre um botão da bancada ([data-hand])? Nesse caso a pinça
 * CLIQUE no botão (HandsLayer) e o quadro não pode apertar por baixo — senão
 * o item armado já caía na célula sob o botão, "preso na borda". Fora do
 * navegador (testes em node) nunca está.
 */
export function overHandButton(clientX: number, clientY: number): boolean {
  if (typeof document === 'undefined' || !document.elementFromPoint) return false;
  const el = document.elementFromPoint(clientX, clientY);
  return !!el && !!el.closest('[data-hand]');
}

/** Menor distância do ponto a um segmento, em células. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  const dx = p.x - (a.x + t * vx);
  const dy = p.y - (a.y + t * vy);
  return Math.hypot(dx, dy);
}

/** Fio sob a célula (o traçado tem dobras: testa cada trecho). */
export function wireAt(doc: CircuitDoc, cell: Pt) {
  return doc.wires.find((w) => {
    const pts = wireRoute(doc, w);
    for (let i = 1; i < pts.length; i++) if (distToSegment(cell, pts[i - 1], pts[i]) < 0.35) return true;
    return false;
  });
}
