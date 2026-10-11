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
  /** O ponto material colado na âncora, normalizado. */
  ref: Pt;
}

/**
 * Desenha o esqueleto a uma escala fixa, ancorado num PONTO MATERIAL `ref`
 * escolhido pelo chamador.
 *
 * Para a mão da mira, `ref` = a mira travada (= palma + apontada congelada),
 * que é um ponto fixo em relação à mão: os dedos fecham em volta dele e o
 * desenho NÃO desliza. Ancorar no ponto médio atual das pontas (como se fazia)
 * fazia o meio delas escorregarem com a pinça e o esqueleto inteiro andava
 * junto — sempre na direção do polegar.
 *
 * Para as outras mãos, `ref` = o ponto médio das próprias pontas (posição
 * verdadeira na tela).
 */
export function handFrame(
  pts: Pt[],
  ref: Pt,
  W: number,
  H: number,
  radiusPx: number,
): HandFrame | null {
  if (pts.length < 10 || !Number.isFinite(ref.x) || !Number.isFinite(ref.y)) return null;
  let maxR = 1;
  for (const p of pts) maxR = Math.max(maxR, Math.hypot((p.x - ref.x) * W, (p.y - ref.y) * H));
  const k = radiusPx / maxR;
  const anchor = { x: ref.x * W, y: ref.y * H };
  const project = (p: Pt) => ({
    x: anchor.x + (p.x - ref.x) * W * k,
    y: anchor.y + (p.y - ref.y) * H * k,
  });
  return { project, anchor, ref };
}

/** Ponto médio de dois landmarks (já espelhados). */
export const tipMid = (pts: Pt[], i = 4, j = 8): Pt => ({
  x: ((pts[i]?.x ?? 0.5) + (pts[j]?.x ?? 0.5)) / 2,
  y: ((pts[i]?.y ?? 0.5) + (pts[j]?.y ?? 0.5)) / 2,
});
