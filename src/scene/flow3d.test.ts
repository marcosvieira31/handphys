import { describe, expect, it } from 'vitest';
import { advanceFlow, buildCircuitGroup } from './buildScene';
import { cumLength, layoutScene, pointAlong } from './layout';
import { readCircuit, type CircuitDoc } from '../core/netlist';

const wire = (id: string, fx: number, fy: number, tx: number, ty: number) => ({
  id,
  from: { x: fx, y: fy },
  to: { x: tx, y: ty },
});

/** Mesma série do teste do fluxo: fonte 9 V → chave → lâmpada 20 Ω. */
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

const gray = () => '#7d8590';

type FlowAnim = { on: boolean; t: number; group: { visible: boolean }; parts: unknown[] };

const animOf = (g: { userData: Record<string, unknown> }): FlowAnim =>
  g.userData.flow as FlowAnim;

describe('gotas de corrente no 3D (buildCircuitGroup + advanceFlow)', () => {
  it('monta 3 gotas por trecho com corrente e some com a animação desligada', () => {
    const layout = layoutScene(serie, readCircuit(serie), gray);
    const g = buildCircuitGroup(layout);
    const f = animOf(g);
    expect(f.parts).toHaveLength(6); // os 6 fios da série levam corrente
    for (const p of f.parts as { nodes: unknown[]; dur: number; total: number }[]) {
      expect(p.nodes).toHaveLength(3);
      expect(p.total).toBeGreaterThan(0);
      expect(p.dur).toBeGreaterThanOrEqual(0.6);
      expect(p.dur).toBeLessThanOrEqual(10);
    }
    // desliga: o grupo das gotas fica invisível; religa, volta
    f.on = false;
    advanceFlow(g);
    expect(f.group.visible).toBe(false);
    f.on = true;
    advanceFlow(g);
    expect(f.group.visible).toBe(true);
  });

  it('primeiro quadro distribui as gotas a 0, 1/3 e 2/3 do trecho', () => {
    const layout = layoutScene(serie, readCircuit(serie), gray);
    const g = buildCircuitGroup(layout);
    advanceFlow(g); // dt = 0 (primeira chamada ancora o relógio): fase 0
    const parts = animOf(g).parts as {
      nodes: { position: { x: number; y: number; z: number } }[];
      pts: [number, number, number][];
      cum: number[];
      total: number;
      amps: number;
    }[];
    const w1 = parts[0];
    expect(w1.amps).toBeGreaterThan(0);
    w1.nodes.forEach((n, i) => {
      const [x, y, z] = pointAlong(w1.pts, w1.cum, (i / 3) * w1.total);
      expect(n.position.x).toBeCloseTo(x, 6);
      expect(n.position.y).toBeCloseTo(y, 6);
      expect(n.position.z).toBeCloseTo(z, 6);
    });
  });

  it('andando 0,1 s (relógio rebobinado) a gota sai do lugar', () => {
    const layout = layoutScene(serie, readCircuit(serie), gray);
    const g = buildCircuitGroup(layout);
    advanceFlow(g);
    const f = animOf(g);
    const parts = f.parts as {
      nodes: { position: { x: number; y: number; z: number } }[];
      pts: [number, number, number][];
      cum: number[];
      total: number;
      dur: number;
    }[];
    const w1 = parts[0];
    const antes = { ...w1.nodes[0].position };
    // rebobina o relógio interno: o próximo quadro mede dt = 0,1 s
    f.t = performance.now() / 1000 - 0.1;
    advanceFlow(g);
    const esperado = pointAlong(w1.pts, w1.cum, (0.1 / w1.dur) * w1.total);
    expect(w1.nodes[0].position.x).toBeCloseTo(esperado[0], 6);
    expect(w1.nodes[0].position.z).toBeCloseTo(esperado[2], 6);
    const dist = Math.hypot(w1.nodes[0].position.x - antes.x, w1.nodes[0].position.z - antes.z);
    expect(dist).toBeGreaterThan(0); // saiu de onde estava
  });

  it('cumLength/pointAlong: canto na conta (comprimento de arco, sem acelerar)', () => {
    const pts: [number, number, number][] = [
      [0, 0, 0],
      [4, 0, 0],
      [4, 0, 3],
    ];
    const cum = cumLength(pts);
    expect(cum).toEqual([0, 4, 7]);
    expect(pointAlong(pts, cum, 4)).toEqual([4, 0, 0]); // exatamente no canto
    expect(pointAlong(pts, cum, 5.5)).toEqual([4, 0, 1.5]); // metade do segundo lance
    expect(pointAlong(pts, cum, 99)).toEqual([4, 0, 3]); // excede: para no fim
    expect(pointAlong(pts, cum, -5)).toEqual([0, 0, 0]); // negativo: começa no início
  });
});
