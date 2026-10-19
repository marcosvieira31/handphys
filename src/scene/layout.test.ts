import { describe, expect, it } from 'vitest';
import { cellToWorld, ghostNode, layoutScene, rotToRotY, WIRE_Y, WORLD } from './layout';
import { readCircuit, type CircuitDoc } from '../core/netlist';

const gray = () => '#7d8590';

describe('grade => mundo', () => {
  it('quadro 30x30 centrado na origem', () => {
    expect(cellToWorld(0, 0)).toEqual([-(WORLD - 1) / 2, -(WORLD - 1) / 2]);
    expect(cellToWorld(29, 29)).toEqual([(WORLD - 1) / 2, (WORLD - 1) / 2]);
    expect(cellToWorld(14.5, 14.5)).toEqual([0, 0]);
  });

  it('giro horário na tela vira giro negativo em Y', () => {
    expect(rotToRotY(0)).toBe(0);
    expect(rotToRotY(90)).toBeCloseTo(-Math.PI / 2, 12);
    expect(rotToRotY(180)).toBeCloseTo(-Math.PI, 12);
    expect(rotToRotY(270)).toBeCloseTo((-3 * Math.PI) / 2, 12);
  });
});

describe('ghostNode (o fantasma do item armado na bancada 3D)', () => {
  it('cai na MESMA célula dos componentes de verdade', () => {
    const g = ghostNode('capacitor', { x: 7, y: 21 });
    expect([g.wx, g.wz]).toEqual(cellToWorld(7, 21));
    expect(g.kind).toBe('capacitor');
    expect(g.id).toBe('ghost'); // id reservado: não é do documento
  });

  it('células diferentes => lugares diferentes na bancada', () => {
    expect(ghostNode('resistor', { x: 2, y: 3 }).wx).not.toBe(ghostNode('resistor', { x: 3, y: 3 }).wx);
    expect(ghostNode('resistor', { x: 2, y: 4 }).wz).toBe(ghostNode('resistor', { x: 2, y: 3 }).wz + 1);
  });

  it('nasce apagado e sem leitura: é prévia, não peça ligada', () => {
    const g = ghostNode('lamp', { x: 1, y: 1 });
    expect(g.glow).toBe(0);
    expect(g.closed).toBe(false);
    expect(g.rotY).toBe(0);
    expect(g.value).toBe(0);
  });
});

describe('layoutScene', () => {
  // lâmpada rot 90: terminais em (12,2) e (12,4) — o fio liga no terminal de cima
  const doc: CircuitDoc = {
    comps: [
      { id: 'bat1', kind: 'vsource', x: 4, y: 3, rot: 0, value: 9 },
      { id: 'lamp1', kind: 'lamp', x: 12, y: 3, rot: 90, value: 20 },
    ],
    wires: [{ id: 'w1', from: { x: 5, y: 3 }, to: { x: 12, y: 2 } }],
  };

  it('posiciona componentes e eleva os fios', () => {
    const out = layoutScene(doc, readCircuit(doc), gray);
    expect(out.comps).toHaveLength(2);
    expect([out.comps[0].wx, out.comps[0].wz]).toEqual(cellToWorld(4, 3));
    expect(out.comps[1].rotY).toBeCloseTo(-Math.PI / 2, 12);
    expect(out.wires).toHaveLength(1);
    expect(out.wires[0].points[0][1]).toBe(WIRE_Y);
    const [x0, , z0] = out.wires[0].points[0];
    const [x1, , z1] = out.wires[0].points[out.wires[0].points.length - 1];
    expect([x0, z0]).toEqual(cellToWorld(5, 3));
    expect([x1, z1]).toEqual(cellToWorld(12, 2));
  });

  it('leva brilho da lâmpada e cor do fio pela tensão', () => {
    // fecha o laço por baixo para a lâmpada acender de verdade
    const loop: CircuitDoc = {
      ...doc,
      wires: [
        ...doc.wires,
        { id: 'w2', from: { x: 12, y: 4 }, to: { x: 12, y: 8 } },
        { id: 'w3', from: { x: 12, y: 8 }, to: { x: 3, y: 8 } },
        { id: 'w4', from: { x: 3, y: 8 }, to: { x: 3, y: 3 } },
      ],
    };
    const reading = readCircuit(loop);
    expect(reading.error).toBeNull();
    const seen: string[] = [];
    const out = layoutScene(loop, reading, (v, m) => {
      seen.push(`${v}|${m}`);
      return gray();
    });
    const lamp = out.comps.find((c) => c.id === 'lamp1')!;
    expect(lamp.glow).toBeGreaterThan(0);
    expect(out.lit).toHaveLength(1);
    // o colorista recebeu a tensão real do nó (9 V no fio de cima)
    expect(seen.some((s) => s.startsWith('9|'))).toBe(true);
  });
});
