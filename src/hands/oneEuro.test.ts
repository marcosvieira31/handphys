import { describe, expect, it } from 'vitest';
import { LowPassFilter, OneEuroFilter } from './oneEuro';

describe('OneEuroFilter', () => {
  it('sinal parado converge (corta o tremor)', () => {
    const f = new OneEuroFilter({ freq: 30 });
    let y = 0;
    // oscila ±0,05 em torno de 1 (tremor de landmark parado)
    for (let i = 0; i < 120; i++) y = f.filter(1 + (i % 2 === 0 ? 0.05 : -0.05), i / 30);
    expect(Math.abs(y - 1)).toBeLessThan(0.01);
  });

  it('acompanha movimento rápido sem grudar (atraso limitado)', () => {
    const f = new OneEuroFilter({ freq: 30 });
    for (let i = 0; i < 30; i++) f.filter(0, i / 30); // parado em 0
    // salto para 1: em 10 quadros (~0,33 s) já passou da metade
    let y = 0;
    for (let i = 30; i < 40; i++) y = f.filter(1, i / 30);
    expect(y).toBeGreaterThan(0.5);
  });

  it('ignora amostra inválida sem quebrar o estado', () => {
    const f = new OneEuroFilter({ freq: 30 });
    for (let i = 0; i < 10; i++) f.filter(0.5, i / 30);
    expect(f.filter(Number.NaN, 10 / 30)).toBeCloseTo(0.5, 6);
    const y = f.filter(0.5, 11 / 30);
    expect(y).toBeCloseTo(0.5, 2);
  });

  it('LowPassFilter com alfa 1 segue a entrada na hora', () => {
    const f = new LowPassFilter();
    expect(f.filter(3, 1)).toBe(3);
    expect(f.filter(7, 1)).toBe(7);
  });
});
