import { describe, expect, it } from 'vitest';
import { PinchTracker } from './pinch';

describe('PinchTracker', () => {
  it('agarra abaixo do limiar e solta com histerese + debounce', () => {
    const p = new PinchTracker({ threshold: 0.45, hysteresis: 0.12, releaseFrames: 3 });
    expect(p.update('Left', 0.8, 0).pinched).toBe(false);
    const down = p.update('Left', 0.2, 33);
    expect(down.pinched).toBe(true);
    expect(down.edge).toBe('down');
    // 0,50 está acima do limiar mas dentro da histerese (0,57): continua agarrado
    expect(p.update('Left', 0.5, 66).pinched).toBe(true);
    // acima de 0,57 por 1–2 quadros: ainda agarrado (debounce)
    expect(p.update('Left', 0.8, 99).pinched).toBe(true);
    expect(p.update('Left', 0.8, 132).pinched).toBe(true);
    // 3º quadro seguido: solta com borda
    const up = p.update('Left', 0.8, 165);
    expect(up.pinched).toBe(false);
    expect(up.edge).toBe('up');
  });

  it('mãos são independentes (chave por lado)', () => {
    const p = new PinchTracker();
    p.update('Left', 0.2, 0);
    expect(p.update('Right', 0.8, 0).pinched).toBe(false);
    expect(p.update('Left', 0.2, 33).pinched).toBe(true);
  });

  it('mão sumida expira depois da graça — agarrada avisa para soltar', () => {
    const p = new PinchTracker({ graceMs: 400 });
    p.update('Left', 0.2, 0); // agarrou
    p.update('Right', 0.8, 0); // solta
    expect(p.prune(399)).toEqual([]);
    expect(p.prune(401)).toEqual(['Left']); // só a agarrada precisa de soltura
    expect(p.sides).toEqual([]);
  });
});
