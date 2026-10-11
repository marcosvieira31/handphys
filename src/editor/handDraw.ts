/** Ponto em coordenadas normalizadas (0..1) de janela — já espelhado. */
export interface Pt {
  x: number;
  y: number;
}

export interface HandFrame {
  /** Projeta um landmark normalizado para pixels de janela. */
  project: (p: Pt) => { x: number; y: number };
  /** Onde o esqueleto é ancorado, em px de janela. */
  anchor: { x: number; y: number };
  /** O ponto da pinça (ponta do polegar 4 + ponta do indicador 8), normalizado. */
  ref: Pt;
}

/**
 * Ancora e escala o esqueleto da mão para que o PONTO DA PINÇA — média entre a
 * ponta do polegar (landmark 4) e a do indicador (8), que é exatamente a mira —
 * caia sobre ela.
 *
 * Ancorar no centroide (como se fazia) deslocava a mão inteira até o cursor e o
 * ponto nascia sempre no MEIO da mão desenhada, longe dos dedos: a mira parecia
 * "presa" no centro da mão.
 *
 * `cursor` é a mira corrente (null = mão que não gerou a mira, desenhada na
 * posição verdadeira — senão duas mãos se sobrepõem).
 */
export function handFrame(
  pts: Pt[],
  cursor: Pt | null,
  W: number,
  H: number,
  radiusPx: number,
): HandFrame | null {
  if (pts.length < 9) return null;
  const ref: Pt = { x: (pts[4].x + pts[8].x) / 2, y: (pts[4].y + pts[8].y) / 2 };
  let maxR = 1;
  for (const p of pts) maxR = Math.max(maxR, Math.hypot((p.x - ref.x) * W, (p.y - ref.y) * H));
  const k = radiusPx / maxR;
  const mine = !!cursor && Math.abs(ref.x - cursor.x) < 0.02 && Math.abs(ref.y - cursor.y) < 0.02;
  const anchor = cursor && mine ? { x: cursor.x * W, y: cursor.y * H } : { x: ref.x * W, y: ref.y * H };
  const project = (p: Pt) => ({
    x: anchor.x + (p.x - ref.x) * W * k,
    y: anchor.y + (p.y - ref.y) * H * k,
  });
  return { project, anchor, ref };
}
