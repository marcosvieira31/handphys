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

/**
 * Raio de desenho a partir do TAMANHO APARENTE da mão (pulso→metacarpal, em
 * fração da imagem; `ref` = 0,20 ≈ 40 cm da câmera). É a profundidade que a
 * webcam entrega de verdade — ela não mede distância, mede aparente. Desenhar
 * o esqueleto sempre no mesmo tamanho apagava essa pista: mão perto e mão
 * longe viravam a mesma coisa.
 */
export function radiusForSize(
  size: number,
  base = 70,
  ref = 0.2,
  min = 42,
  max = 118,
): number {
  if (!Number.isFinite(size) || size <= 0) return base;
  return Math.max(min, Math.min(max, base * (size / ref)));
}
