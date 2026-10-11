import { describe, expect, it } from 'vitest';
import { Clutch, type Pt } from './clutch';

const PALMA: Pt = { x: 0.5, y: 0.7 };
/** Mira crua com a mão ABERTA: bem à esquerda da palma (polegar/indicador). */
const ABERTA: Pt = { x: 0.18, y: 0.35 };

const frame = (ratio: number, tip: Pt, palm = PALMA) => ({ ratio, tip, palm });
const round = (p: Pt) => ({ x: Number(p.x.toFixed(4)), y: Number(p.y.toFixed(4)) });

describe('trava de mira (Clutch)', () => {
  it('mão ABERTA segue os dedos na hora (sem atraso, é a apontada crua)', () => {
    const c = new Clutch();
    expect(round(c.update(frame(0.86, ABERTA)))).toEqual(round(ABERTA));
    // mexeu o dedo: a mira mexe junto
    const depois = c.update(frame(0.86, { x: 0.24, y: 0.35 }));
    expect(round(depois)).toEqual({ x: 0.24, y: 0.35 });
    expect(c.isFrozen).toBe(false);
  });

  it('BUG RELATADO: dedos convergindo com a mão parada NÃO move a mira', () => {
    const c = new Clutch();
    c.update(frame(0.86, ABERTA)); // mão aberta: fixa o pico de abertura
    const alvo = c.update(frame(0.7, ABERTA)); // dedos começando a fechar: trava
    expect(c.isFrozen).toBe(true);
    // os dedos seguem fechando: as pontas andam em direção ao polegar (+x)
    for (const dx of [0.03, 0.06, 0.1]) {
      const p = c.update(frame(0.2, { x: ABERTA.x + dx, y: ABERTA.y }));
      expect(round(p)).toEqual(round(alvo));
    }
    expect(round(alvo)).toEqual(round(ABERTA));
  });

  it('mão INTEIRA andando durante a pinça move a mira (o arraste continua)', () => {
    const c = new Clutch();
    c.update(frame(0.86, ABERTA));
    c.update(frame(0.7, ABERTA));
    const passo = c.update(frame(0.2, { x: ABERTA.x + 0.1, y: ABERTA.y }, { x: 0.6, y: 0.7 }));
    expect(round(passo)).toEqual({ x: 0.28, y: 0.35 });
    const outro = c.update(frame(0.2, { x: ABERTA.x + 0.1, y: ABERTA.y + 0.05 }, { x: 0.6, y: 0.75 }));
    expect(round(outro)).toEqual({ x: 0.28, y: 0.4 });
  });

  it('abrir a mão devolve a mira para os dedos', () => {
    const c = new Clutch();
    c.update(frame(0.86, ABERTA));
    c.update(frame(0.7, ABERTA));
    c.update(frame(0.2, { x: 0.4, y: 0.35 })); // fechou de verdade
    expect(c.isFrozen).toBe(true);
    const aberta = c.update(frame(0.87, { x: 0.3, y: 0.35 }));
    expect(c.isFrozen).toBe(false);
    expect(round(aberta)).toEqual({ x: 0.3, y: 0.35 });
  });

  it('mão que JÁ nasce fechada ainda trava (piso do limiar)', () => {
    const c = new Clutch();
    const primeiro = c.update(frame(0.2, ABERTA));
    expect(c.isFrozen).toBe(true);
    const segundo = c.update(frame(0.1, { x: ABERTA.x + 0.07, y: ABERTA.y }));
    expect(round(segundo)).toEqual(round(primeiro));
  });

  it('limiares são relativos ao pico de abertura daquela mão', () => {
    const dura = new Clutch();
    dura.update(frame(0.6, ABERTA)); // só chega a 0,60
    expect(dura.freezeAt).toBeCloseTo(0.47, 5);
    expect(dura.releaseAt).toBeCloseTo(0.55, 5);
    expect(dura.openPeak).toBeCloseTo(0.6, 5);

    const flex = new Clutch();
    flex.update(frame(0.9, ABERTA));
    expect(flex.freezeAt).toBeCloseTo(0.77, 5);
    expect(flex.releaseAt).toBeCloseTo(0.85, 5);
  });

  it('reset limpa a trava e a memória de abertura', () => {
    const c = new Clutch();
    c.update(frame(0.86, ABERTA));
    c.update(frame(0.7, ABERTA));
    expect(c.isFrozen).toBe(true);
    c.reset();
    expect(c.isFrozen).toBe(false);
    expect(c.openPeak).toBe(0);
    expect(round(c.update(frame(0.7, { x: 0.4, y: 0.4 })))).toEqual({ x: 0.4, y: 0.4 });
  });
});
