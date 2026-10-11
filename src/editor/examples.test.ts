import { describe, expect, it } from 'vitest';
import { readCircuit } from '../core/netlist';
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
});
