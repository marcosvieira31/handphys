import { describe, expect, it } from 'vitest';
import { readCircuit, wireRoute } from '../core/netlist';
import { EXAMPLES } from './examples';

/** Exemplos quebrados já morderam (Série × paralelo em curto): todos resolvem. */
describe('exemplos do editor/Cardboard', () => {
  it('Lei de Ohm: 9 V em 100 Ω = 90 mA', () => {
    const out = readCircuit(EXAMPLES[0].doc);
    expect(out.error).toBeNull();
    expect(Math.abs(out.comps[1].amps)).toBeCloseTo(0.09, 6);
  });

  it('Divisor: 45 mA e 4,5 V no meio', () => {
    const out = readCircuit(EXAMPLES[1].doc);
    expect(out.error).toBeNull();
    expect(out.nodes.find((n) => n.net === 'N2')?.volts).toBeCloseTo(4.5, 6);
  });

  it('Paralelo: 270 mA no total, 90 mA por ramo, sem curto', () => {
    const out = readCircuit(EXAMPLES[2].doc);
    expect(out.error).toBeNull();
    expect(out.diagnostics.join(' ')).not.toMatch(/curto/i);
    expect(Math.abs(out.comps[0].amps)).toBeCloseTo(0.27, 6);
    for (const r of out.comps.slice(1)) expect(Math.abs(r.amps)).toBeCloseTo(0.09, 6);
  });

  it('Paralelo: retorno contorna por baixo, sem cortar o banco', () => {
    const doc = EXAMPLES[2].doc;
    // o retorno desce pelo fim do trilho direito, volta pela base e sobe até o −
    const volta = doc.wires.find((w) => w.id === 'w12')!;
    expect(wireRoute(doc, volta)).toEqual([
      { x: 15, y: 9 },
      { x: 2, y: 9 },
      { x: 2, y: 4 },
      { x: 3, y: 4 },
    ]);
    // nenhum fio passa pelas fileiras vazias (y=3 e y=5) DENTRO do banco, entre
    // os trilhos: era ali que o retorno se espremia entre r2 e r3 e o desenho
    // virava um nó. (O trilho direito em x=15 atravessa y=3/5 de propósito.)
    for (const w of doc.wires)
      for (const p of wireRoute(doc, w))
        if (p.x >= 9 && p.x <= 14) expect([3, 5]).not.toContain(p.y);
  });
});
