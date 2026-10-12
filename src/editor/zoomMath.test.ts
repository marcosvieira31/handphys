import { describe, expect, it } from 'vitest';
import { BOARD, centerOf, panPx, viewBoxOf, zoomAbout, ZOOM_MAX, ZOOM_MIN, type View } from './zoomMath';

const vp = 900; // largura do quadro na tela, em px
const origem = (): View => ({ zoom: 1, pan: { x: 0, y: 0 } });

/** Onde um ponto do quadro cai na tela (px), dada a vista. */
const naTela = (v: View, p: { x: number; y: number }) => {
  const vb = viewBoxOf(v);
  return { x: (p.x - vb.x) * (vp / vb.w), y: (p.y - vb.y) * (vp / vb.h) };
};

describe('zoom do quadro (zoomMath)', () => {
  it('no zoom 1 o quadro inteiro cabe e está centrado', () => {
    const vb = viewBoxOf(origem());
    expect(vb).toEqual({ x: 0, y: 0, w: BOARD, h: BOARD });
    expect(centerOf(origem())).toEqual({ x: BOARD / 2, y: BOARD / 2 });
  });

  it('ampliar com âncora deixa o ponto do âncora PARADO na tela', () => {
    for (const anchor of [
      { x: 0, y: 0 },
      { x: BOARD, y: BOARD },
      { x: 120, y: 300 },
      { x: BOARD / 2, y: BOARD / 2 },
    ]) {
      for (const f of [1.25, 2, 4, 1 / 1.25]) {
        const antes = naTela(origem(), anchor);
        const depois = naTela(zoomAbout(origem(), f, anchor), anchor);
        expect(depois.x).toBeCloseTo(antes.x, 6);
        expect(depois.y).toBeCloseTo(antes.y, 6);
      }
    }
  });

  it('sem âncora amplia no centro e não desloca o quadro', () => {
    const z = zoomAbout(origem(), 2, null);
    expect(z.zoom).toBe(2);
    expect(z.pan).toEqual({ x: 0, y: 0 });
    expect(viewBoxOf(z)).toEqual({ x: BOARD / 4, y: BOARD / 4, w: BOARD / 2, h: BOARD / 2 });
  });

  it('respeita os limites de zoom e o quadro nunca sai da tela', () => {
    expect(zoomAbout(origem(), 0.1, null).zoom).toBe(ZOOM_MIN);
    expect(zoomAbout(origem(), 99, null).zoom).toBe(ZOOM_MAX);
    // arrastar o zoom até a borda: o viewBox continua dentro do quadro
    let v = origem();
    for (let i = 0; i < 40; i++) v = zoomAbout(v, 1.5, { x: BOARD, y: 0 });
    const vb = viewBoxOf(v);
    expect(vb.x).toBeGreaterThanOrEqual(-0.0001);
    expect(vb.y).toBeGreaterThanOrEqual(-0.0001);
    expect(vb.x + vb.w).toBeLessThanOrEqual(BOARD + 0.0001);
    expect(vb.y + vb.h).toBeLessThanOrEqual(BOARD + 0.0001);
  });

  it('o conteúdo acompanha o dedo que arrasta (pan em px)', () => {
    // no zoom 1 o quadro já cabe todo: o pan fica travado de propósito
    const v: View = { zoom: 2, pan: { x: 0, y: 0 } };
    const alvo = { x: 240, y: 240 };
    const antes = naTela(v, alvo);
    const dep = panPx(v, 100, -40, vp); // dedo anda 100 px p/ a direita
    const depois = naTela(dep, alvo);
    expect(depois.x).toBeCloseTo(antes.x + 100, 6);
    expect(depois.y).toBeCloseTo(antes.y - 40, 6);
  });

  it('sem ampliar não há o que arrastar (o quadro inteiro já está na tela)', () => {
    const v = panPx(origem(), 100, 0, vp);
    expect(v).toEqual(origem());
  });

  it('pan também fica preso ao quadro', () => {
    let v: View = { zoom: 2, pan: { x: 0, y: 0 } };
    for (let i = 0; i < 50; i++) v = panPx(v, 200, 0, vp);
    const vb = viewBoxOf(v);
    expect(vb.x).toBeGreaterThanOrEqual(-0.0001);
    expect(vb.x + vb.w).toBeLessThanOrEqual(BOARD + 0.0001);
  });
});
