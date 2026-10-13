import { describe, expect, it } from 'vitest';
import { computeFlow, flowDuration } from './flow';
import { readCircuit, type CircuitDoc } from './netlist';

const wire = (id: string, fx: number, fy: number, tx: number, ty: number) => ({
  id,
  from: { x: fx, y: fy },
  to: { x: tx, y: ty },
});

/** Fonte 9 V → chave → lâmpada 20 Ω, malha fechada (mesmo caso do netlist). */
const serie: CircuitDoc = {
  comps: [
    { id: 'bat1', kind: 'vsource', x: 4, y: 6, rot: 0, value: 9 },
    { id: 'sw1', kind: 'switch', x: 10, y: 6, rot: 0, value: 0, closed: true },
    { id: 'lamp1', kind: 'lamp', x: 16, y: 6, rot: 0, value: 20 },
  ],
  wires: [
    wire('w1', 5, 6, 9, 6),
    wire('w2', 11, 6, 15, 6),
    wire('w3', 17, 6, 20, 6),
    wire('w4', 20, 6, 20, 14),
    wire('w5', 20, 14, 3, 14),
    wire('w6', 3, 14, 3, 6),
  ],
};

describe('corrente por trecho de fio (computeFlow)', () => {
  it('série: todos os fios levam a MESMA corrente no sentido da circulação', () => {
    const flow = computeFlow(serie, readCircuit(serie));
    expect(flow.size).toBe(serie.wires.length); // os 6 têm corrente
    for (const w of serie.wires) {
      const parts = flow.get(w.id)!;
      expect(parts).toHaveLength(1); // sem junção no meio: um trecho só
      expect(parts[0].amps).toBeCloseTo(0.45, 6); // 9 V / 20 Ω
      // todas as rotas apontam no sentido da circulação => positivo
      expect(parts[0].amps).toBeGreaterThan(0);
      expect(parts[0].pts[0]).toEqual(w.from);
      expect(parts[0].pts[parts[0].pts.length - 1]).toEqual(w.to);
    }
  });

  it('chave aberta: circuito sem corrente => mapa vazio (nada anima)', () => {
    const aberto: CircuitDoc = { ...serie, comps: serie.comps.map((c) => (c.id === 'sw1' ? { ...c, closed: false } : c)) };
    const flow = computeFlow(aberto, readCircuit(aberto));
    expect(flow.size).toBe(0);
  });

  it('paralelo: emenda NO MEIO do fio separa os trechos (0,9 antes, 0,45 depois)', () => {
    // fonte -> lâmpada1 em série com o TRECHO (5,6)-(15,6); lâmpada2 deriva
    // da EMENDA (10,6) — ponta de fio encostada no meio de outro fio.
    const par: CircuitDoc = {
      comps: [
        { id: 'bat1', kind: 'vsource', x: 4, y: 6, rot: 0, value: 9 },
        { id: 'lamp1', kind: 'lamp', x: 16, y: 6, rot: 0, value: 20 },
        { id: 'lamp2', kind: 'lamp', x: 10, y: 10, rot: 0, value: 20 },
      ],
      wires: [
        wire('w1', 5, 6, 15, 6), // reta com a emenda (10,6) no meio
        wire('w2', 10, 6, 9, 10), // derivação para a lâmpada 2
        wire('w3', 17, 6, 20, 6),
        wire('w4', 20, 6, 20, 14),
        wire('w5', 20, 14, 3, 14), // retorno; emenda (11,14) no meio
        wire('w6', 3, 14, 3, 6),
        wire('w7', 11, 10, 11, 14), // volta da lâmpada 2 na emenda
      ],
    };
    const flow = computeFlow(par, readCircuit(par));

    // w1 parte na emenda: 0,9 A da fonte até (10,6), 0,45 A da emenda à lâmpada1
    const w1 = flow.get('w1')!;
    expect(w1).toHaveLength(2);
    expect(w1[0].amps).toBeCloseTo(0.9, 6);
    expect(w1[0].pts[w1[0].pts.length - 1]).toEqual({ x: 10, y: 6 });
    expect(w1[1].amps).toBeCloseTo(0.45, 6);
    expect(w1[1].pts[0]).toEqual({ x: 10, y: 6 });

    // a derivação leva só o ramo dela, no sentido fonte => lâmpada2
    const w2 = flow.get('w2')!;
    expect(w2).toHaveLength(1);
    expect(w2[0].amps).toBeCloseTo(0.45, 6);
    expect(w2[0].pts[0]).toEqual({ x: 10, y: 6 });

    // retorno: a emenda (11,14) junta 0,45 (lâmpada2) + 0,45 (lâmpada1) = 0,9
    const w5 = flow.get('w5')!;
    expect(w5).toHaveLength(2);
    expect(w5[0].amps).toBeCloseTo(0.45, 6);
    expect(w5[1].amps).toBeCloseTo(0.9, 6);
    expect(w5[1].pts[0]).toEqual({ x: 11, y: 14 });
    expect(flow.get('w7')![0].amps).toBeCloseTo(0.45, 6);
    expect(flow.get('w6')![0].amps).toBeCloseTo(0.9, 6); // volta inteira p/ a fonte
    expect(flow.size).toBe(7);
  });

  it('KCL em toda junção: nas emendas do paralelo entra = sai', () => {
    const par: CircuitDoc = {
      comps: [
        { id: 'bat1', kind: 'vsource', x: 4, y: 6, rot: 0, value: 9 },
        { id: 'lamp1', kind: 'lamp', x: 16, y: 6, rot: 0, value: 20 },
        { id: 'lamp2', kind: 'lamp', x: 10, y: 10, rot: 0, value: 20 },
      ],
      wires: [
        wire('w1', 5, 6, 15, 6),
        wire('w2', 10, 6, 9, 10),
        wire('w3', 17, 6, 20, 6),
        wire('w4', 20, 6, 20, 14),
        wire('w5', 20, 14, 3, 14),
        wire('w6', 3, 14, 3, 6),
        wire('w7', 11, 10, 11, 14),
      ],
    };
    const flow = computeFlow(par, readCircuit(par));
    // (10,6): entra 0,9 por w1[0]; sai 0,45 em w1[1] + 0,45 em w2
    const w1 = flow.get('w1')!;
    const w2 = flow.get('w2')!;
    expect(w1[0].amps).toBeCloseTo(w1[1].amps + w2[0].amps, 6);
    // (11,14): entra 0,45 de w5[0] (vindo da lâmpada1) + 0,45 de w7; sai 0,9 em w5[1]
    const w5 = flow.get('w5')!;
    const w7 = flow.get('w7')!;
    expect(w5[1].amps).toBeCloseTo(w5[0].amps + w7[0].amps, 6);
  });
});

describe('flowDuration (velocidade ∝ intensidade)', () => {
  it('caminho inverso da corrente e dentro do intervalo 0,4–12 s', () => {
    expect(flowDuration(0.45)).toBe(0.4); // forte: estoura no piso (rápido)
    expect(flowDuration(1e-6)).toBe(12); // µA: estoura no teto (cunha)
    const med = flowDuration(0.015); // 15 mA: ritmo de aula
    expect(med).toBeGreaterThan(2);
    expect(med).toBeLessThan(4);
    expect(flowDuration(1)).toBeLessThan(flowDuration(0.1));
    expect(flowDuration(0.1)).toBeLessThan(flowDuration(0.01));
  });
});
