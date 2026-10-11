import { describe, expect, it } from 'vitest';
import { handFrame, tipMid, type Pt } from './handDraw';

const W = 1200;
const H = 800;

/** 21 landmarks numa mão "aberta": polegar à esquerda, indicador à direita. */
function aberta(ox = 0.4, oy = 0.5): Pt[] {
  const pts = Array.from({ length: 21 }, (_, i) => ({ x: ox + i * 0.001, y: oy - i * 0.001 }));
  pts[4] = { x: ox - 0.06, y: oy - 0.05 }; // ponta do polegar
  pts[8] = { x: ox + 0.05, y: oy - 0.07 }; // ponta do indicador
  pts[0] = { x: ox, y: oy + 0.1 }; // punho (o mais distante => a escala)
  return pts;
}

/** A mesma mão com os dedos JÁ FECHADOS: só o indicador anda (em direção ao polegar). */
function fechada(ox = 0.4, oy = 0.5): Pt[] {
  const pts = aberta(ox, oy);
  pts[8] = { x: ox - 0.04, y: oy - 0.05 };
  return pts;
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('esqueleto ancorado num ponto material (handFrame)', () => {
  it('o ponto escolhido cai exatamente onde ele está na tela', () => {
    const pts = aberta();
    const ref = tipMid(pts); // mão secundária: ancora no próprio meio das pontas
    const f = handFrame(pts, ref, W, H, 70)!;
    const drawn = mid(f.project(pts[4]), f.project(pts[8]));
    expect(drawn.x).toBeCloseTo(ref.x * W, 6);
    expect(drawn.y).toBeCloseTo(ref.y * H, 6);
    expect(f.anchor).toEqual({ x: ref.x * W, y: ref.y * H });
  });

  it('COM A TRAVA: fechar os dedos não desloca o punho desenhado', () => {
    const a = aberta();
    const p = fechada();
    const travada = tipMid(a); // a mira travou quando a mão estava aberta
    const f1 = handFrame(a, travada, W, H, 70);
    const f2 = handFrame(p, travada, W, H, 70);
    expect(f1 && f2).toBeTruthy();
    // o punho é o mesmo ponto material nas duas — não pode andar
    expect(dist(f2!.project(p[0]), f1!.project(a[0]))).toBeLessThan(0.75);
    // e o esqueleto inteiro fica onde estava (o dedo que fechou muda de lugar
    // de verdade — menos ele)
    for (let i = 0; i < 21; i++) {
      if (i === 8) continue;
      expect(dist(f2!.project(p[i]), f1!.project(a[i]))).toBeLessThan(0.75);
    }
  });

  it('SEM a trava (ancorar no meio das pontas atuais) o desenho desliza — era o bug', () => {
    const a = aberta();
    const p = fechada();
    const f1 = handFrame(a, tipMid(a), W, H, 70);
    const f2 = handFrame(p, tipMid(p), W, H, 70); // ancora no ponto que escorrega
    expect(dist(f2!.project(p[0]), f1!.project(a[0]))).toBeGreaterThan(10);
  });

  it('a mão desenhada cabe no raio pedido', () => {
    const pts = aberta();
    const ref = tipMid(pts);
    const f = handFrame(pts, ref, W, H, 70)!;
    const anchor = f.anchor;
    const maxR = Math.max(...pts.map((p) => dist(f.project(p), anchor)));
    expect(maxR).toBeLessThanOrEqual(70 + 1);
    expect(maxR).toBeGreaterThan(20);
  });

  it('devolve null sem landmarks suficientes ou com âncora inválida', () => {
    expect(handFrame([], { x: 0.5, y: 0.5 }, W, H, 70)).toBeNull();
    expect(handFrame(aberta(), { x: NaN, y: 0.5 }, W, H, 70)).toBeNull();
    expect(handFrame(aberta(), { x: 0.5, y: Infinity }, W, H, 70)).toBeNull();
  });
});
