import { describe, expect, it } from 'vitest';
import { handFrame } from './handDraw';

/** 21 landmarks normalizados numa mão "aberta" (dedos espalhados). */
function hand(ox = 0.4, oy = 0.5): { x: number; y: number }[] {
  const pts = Array.from({ length: 21 }, (_, i) => ({ x: ox + i * 0.001, y: oy - i * 0.001 }));
  // polegar 4 e indicador 8 bem afastados (mão ABERTA: o caso que expunha o bug)
  pts[4] = { x: ox - 0.06, y: oy - 0.05 };
  pts[8] = { x: ox + 0.05, y: oy - 0.07 };
  // punho para baixo, para o centroide não coincidir com a pinça
  pts[0] = { x: ox, y: oy + 0.1 };
  return pts;
}

const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

describe('esqueleto ancorado na ponta dos dedos (handFrame)', () => {
  it('o ponto da pinça projetado cai EXATAMENTE na mira', () => {
    const pts = hand();
    const cursor = mid(pts[4], pts[8]); // a mira é a média 4/8
    const f = handFrame(pts, cursor, 1200, 800, 70)!;
    const drawn = mid(f.project(pts[4]), f.project(pts[8]));
    expect(drawn.x).toBeCloseTo(cursor.x * 1200, 6);
    expect(drawn.y).toBeCloseTo(cursor.y * 800, 6);
  });

  it('fica longe do centroide (que era o bug: ponto no meio da mão)', () => {
    const pts = hand();
    const cursor = mid(pts[4], pts[8]);
    const f = handFrame(pts, cursor, 1200, 800, 70)!;
    const centroid = pts.reduce(
      (s, p) => ({ x: s.x + p.x / pts.length, y: s.y + p.y / pts.length }),
      { x: 0, y: 0 },
    );
    const drawnCentroid = pts.reduce(
      (s, p) => ({ x: s.x + f.project(p).x / pts.length, y: s.y + f.project(p).y / pts.length }),
      { x: 0, y: 0 },
    );
    // o centroide desenhado NÃO fica na mira (fica onde ele realmente está)
    const pincha = f.project(cursor);
    expect(Math.hypot(drawnCentroid.x - pincha.x, drawnCentroid.y - pincha.y)).toBeGreaterThan(10);
    // e o centroide projetado bate com o centroide real, só na escala nova
    expect(drawnCentroid.x).toBeGreaterThan(centroid.x * 1200 - 100);
  });

  it('mão que não gerou a mira é ancorada na própria ponta, não na mira', () => {
    const outra = hand(0.8, 0.3);
    const mira = { x: 0.2, y: 0.7 };
    const f = handFrame(outra, mira, 1200, 800, 70)!;
    const drawn = mid(f.project(outra[4]), f.project(outra[8]));
    expect(drawn.x).toBeCloseTo(((outra[4].x + outra[8].x) / 2) * 1200, 6);
    expect(drawn.x).not.toBeCloseTo(mira.x * 1200, 1);
  });

  it('mão sem cursor (sem mira) também fica na ponta dos dedos', () => {
    const pts = hand();
    const f = handFrame(pts, null, 1200, 800, 70)!;
    const drawn = mid(f.project(pts[4]), f.project(pts[8]));
    expect(drawn.x).toBeCloseTo(((pts[4].x + pts[8].x) / 2) * 1200, 6);
    expect(drawn.y).toBeCloseTo(((pts[4].y + pts[8].y) / 2) * 800, 6);
  });

  it('a mão desenhada cabe no raio pedido', () => {
    const pts = hand();
    const f = handFrame(pts, mid(pts[4], pts[8]), 1200, 800, 70)!;
    const pincha = f.project(mid(pts[4], pts[8]));
    const maxR = Math.max(
      ...pts.map((p) => Math.hypot(f.project(p).x - pincha.x, f.project(p).y - pincha.y)),
    );
    expect(maxR).toBeLessThanOrEqual(70 + 1);
    expect(maxR).toBeGreaterThan(20);
  });

  it('landmarks insuficientes devolvem null', () => {
    expect(handFrame([], null, 1200, 800, 70)).toBeNull();
    expect(handFrame([{ x: 0, y: 0 }], null, 1200, 800, 70)).toBeNull();
  });
});
