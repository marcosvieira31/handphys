import { describe, expect, it } from 'vitest';
import { KCL_TOL, fechaConta, porNo } from './kirchhoff';
import { readCircuit, type CircuitDoc } from './netlist';

/** Laço fonte → carga → volta por baixo, como os exemplos (só retas). */
const LOOP = (y: number) => [
  { id: 'w1', from: { x: 5, y }, to: { x: 9, y } },
  { id: 'w2', from: { x: 11, y }, to: { x: 14, y } },
  { id: 'w3', from: { x: 14, y }, to: { x: 14, y: y + 5 } },
  { id: 'w4', from: { x: 14, y: y + 5 }, to: { x: 2, y: y + 5 } },
  { id: 'w5', from: { x: 2, y: y + 5 }, to: { x: 2, y } },
  { id: 'w6', from: { x: 2, y }, to: { x: 3, y } },
];

const COM_LACO: CircuitDoc = {
  comps: [
    { id: 'bat1', kind: 'vsource', x: 4, y: 3, rot: 0, value: 9 },
    { id: 'r1', kind: 'resistor', x: 10, y: 3, rot: 0, value: 100 },
  ],
  wires: LOOP(3),
};

/** Mesmo laço, mas com a chave ABERTA no meio: dois ramos em cada nó e 0 A. */
const LACO_ABERTO: CircuitDoc = {
  comps: [
    { id: 'bat1', kind: 'vsource', x: 4, y: 3, rot: 0, value: 9 },
    { id: 'sw1', kind: 'switch', x: 10, y: 3, rot: 0, value: 0, closed: false },
    { id: 'r1', kind: 'resistor', x: 14, y: 3, rot: 0, value: 100 },
  ],
  wires: [
    { id: 'w1', from: { x: 5, y: 3 }, to: { x: 9, y: 3 } },
    { id: 'w2', from: { x: 11, y: 3 }, to: { x: 13, y: 3 } },
    { id: 'w3', from: { x: 15, y: 3 }, to: { x: 18, y: 3 } },
    { id: 'w4', from: { x: 18, y: 3 }, to: { x: 18, y: 8 } },
    { id: 'w5', from: { x: 18, y: 8 }, to: { x: 2, y: 8 } },
    { id: 'w6', from: { x: 2, y: 8 }, to: { x: 2, y: 3 } },
    { id: 'w7', from: { x: 2, y: 3 }, to: { x: 3, y: 3 } },
  ],
};

/** r2 com um fio em cima dele: curto, solver derruba — e o nó não pode inflar. */
const R_CURTO: CircuitDoc = {
  comps: [
    { id: 'bat1', kind: 'vsource', x: 4, y: 3, rot: 0, value: 9 },
    { id: 'r1', kind: 'resistor', x: 10, y: 3, rot: 0, value: 100 },
    { id: 'r2', kind: 'resistor', x: 14, y: 3, rot: 0, value: 100 },
  ],
  wires: [
    { id: 'w1', from: { x: 5, y: 3 }, to: { x: 9, y: 3 } },
    { id: 'w2', from: { x: 9, y: 3 }, to: { x: 11, y: 3 } }, // fio por cima do r1
    { id: 'w3', from: { x: 11, y: 3 }, to: { x: 13, y: 3 } },
    { id: 'w4', from: { x: 15, y: 3 }, to: { x: 18, y: 3 } },
    { id: 'w5', from: { x: 18, y: 3 }, to: { x: 18, y: 8 } },
    { id: 'w6', from: { x: 18, y: 8 }, to: { x: 2, y: 8 } },
    { id: 'w7', from: { x: 2, y: 8 }, to: { x: 2, y: 3 } },
    { id: 'w8', from: { x: 2, y: 3 }, to: { x: 3, y: 3 } },
  ],
};

/** Duas fontes ideais em conflito: o solver não acha solução (erro legível). */
const CONFLITO: CircuitDoc = {
  comps: [
    { id: 'bat1', kind: 'vsource', x: 4, y: 6, rot: 0, value: 9 },
    { id: 'bat2', kind: 'vsource', x: 4, y: 12, rot: 0, value: 6 },
  ],
  wires: [
    { id: 'w1', from: { x: 5, y: 6 }, to: { x: 5, y: 12 } },
    { id: 'w2', from: { x: 3, y: 6 }, to: { x: 3, y: 12 } },
  ],
};

describe('leitura de Kirchhoff por nó', () => {
  it('sentido é relativo ao nó: sai da origem, entra no destino, e a conta fecha', () => {
    const nos = porNo(readCircuit(COM_LACO));
    expect(nos.map((n) => n.net)).toEqual(['GND', 'N1']); // GND primeiro, como a tabela de nós

    const gnd = nos[0];
    expect(gnd.ramos.map((r) => `${r.id} ${r.sentido}`)).toEqual(['bat1 sai', 'r1 entra']);
    expect(gnd.entram).toBeCloseTo(0.09, 9);
    expect(gnd.saem).toBeCloseTo(0.09, 9);
    expect(fechaConta(gnd.soma)).toBe(true);

    // o MESMO ramo aparece nos dois nós com o lado trocado
    const n1 = nos[1];
    expect(n1.ramos.map((r) => `${r.id} ${r.sentido}`)).toEqual(['bat1 entra', 'r1 sai']);
    expect(fechaConta(n1.soma)).toBe(true);
  });

  it('um ramo só não é nó de Kirchhoff (a lei ali vale sozinha)', () => {
    const solto: CircuitDoc = {
      comps: [{ id: 'r1', kind: 'resistor', x: 10, y: 3, rot: 0, value: 100 }],
      wires: [],
    };
    expect(porNo(readCircuit(solto))).toEqual([]);
  });

  it('ramo parado (0 mA) não ganha lado nenhum — e a soma segue zero', () => {
    const nos = porNo(readCircuit(LACO_ABERTO));
    expect(nos).toHaveLength(3);
    for (const n of nos) {
      expect(n.ramos, n.net).toHaveLength(2);
      expect(n.ramos.every((r) => r.sentido === null), n.net).toBe(true);
      expect(n.entram).toBe(0);
      expect(n.saem).toBe(0);
      expect(fechaConta(n.soma)).toBe(true);
    }
  });

  it('resistor curto não infla a junção (derrubado, não vira dois ramos)', () => {
    const nos = porNo(readCircuit(R_CURTO));
    expect(nos).toHaveLength(2);
    for (const n of nos) expect(n.ramos, n.net).toHaveLength(2);
    expect(nos.flatMap((n) => n.ramos.map((r) => r.id))).not.toContain('r1');
    expect(nos.every((n) => fechaConta(n.soma))).toBe(true);
  });

  it('sem solução não há conta: erro do solver vira lista vazia', () => {
    const out = readCircuit(CONFLITO);
    expect(out.error).toMatch(/singular/i);
    expect(porNo(out)).toEqual([]);
  });

  it('a folga cobre só float de verdade', () => {
    expect(fechaConta(0)).toBe(true);
    expect(fechaConta(1e-16)).toBe(true);
    expect(fechaConta(KCL_TOL)).toBe(true);
    expect(fechaConta(0.001)).toBe(false);
  });
});
