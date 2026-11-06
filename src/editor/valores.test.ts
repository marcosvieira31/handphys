import { describe, expect, it } from 'vitest';
import { PRESETS, UNIDADE, lerValor, textoValor } from './valores';

describe('lerValor — o que o aluno digita vira SI', () => {
  it.each([
    ['220', 220],
    ['4,7k', 4700],
    ['4.7k', 4700],
    ['4,7 kΩ', 4700],
    ['4k7', 4700],
    ['2M2', 2.2e6],
    ['1k', 1000],
    ['100µ', 100e-6],
    ['100μ', 100e-6],
    ['100u', 100e-6],
    ['100 uF', 100e-6],
    ['1mF', 1e-3],
    ['1,5', 1.5],
    ['1,5 V', 1.5],
    ['470n', 470e-9],
    [',5', 0.5],
    ['12V', 12],
  ])('%s → %d', (t, v) => {
    expect(lerValor(t)).toBe(v);
  });

  it.each(['', 'abc', '0', '-9', '1,2,3', 'k', '9 volts', '1e3'])('recusa %j', (t) => {
    expect(lerValor(t)).toBeNull();
  });
});

describe('textoValor — o valor no formato de editar', () => {
  it.each([
    [4700, '4,7k'],
    [1000, '1k'],
    [9, '9'],
    [1.5, '1,5'],
    [1e-6, '1µ'],
    [470e-6, '470µ'],
    [1e-3, '1m'],
    [2.2e6, '2,2M'],
    [100, '100'],
  ])('%d → %s', (v, t) => {
    expect(textoValor(v)).toBe(t);
  });

  it('ida e volta: todo preset sobrevive a textoValor → lerValor', () => {
    for (const lista of Object.values(PRESETS))
      for (const v of lista) expect(lerValor(textoValor(v))).toBeCloseTo(v, 12);
  });
});

describe('presets', () => {
  it('peça com unidade tem presets; peça sem valor não tem', () => {
    for (const k of Object.keys(UNIDADE) as (keyof typeof UNIDADE)[]) {
      expect(PRESETS[k].length > 0, k).toBe(UNIDADE[k] !== '');
    }
  });

  it('os valores com que as peças nascem estão na prateleira', () => {
    expect(PRESETS.vsource).toContain(9);
    expect(PRESETS.resistor).toContain(100);
    expect(PRESETS.lamp).toContain(20);
    expect(PRESETS.capacitor).toContain(1e-6);
  });
});
