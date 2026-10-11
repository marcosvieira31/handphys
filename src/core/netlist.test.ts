import { describe, expect, it } from 'vitest';
import {
  buildNetlist,
  readCircuit,
  reattachWires,
  terminalPos,
  wireRoute,
  type CircuitDoc,
  type CompKind,
  type Placed,
  type Pt,
  type Rot,
} from './netlist';

let seq = 0;
function place(kind: CompKind, x: number, y: number, value: number, extra: Partial<Placed> = {}): Placed {
  return { id: `${kind}${++seq}`, kind, x, y, rot: 0 as Rot, value, ...extra };
}
function wire(from: Pt, to: Pt) {
  return { id: `w${++seq}`, from, to };
}
function doc(comps: Placed[], wires: ReturnType<typeof wire>[] = []): CircuitDoc {
  return { comps, wires };
}
const reading = (d: CircuitDoc, i: number) => readCircuit(d).comps.find((r) => r.id === d.comps[i].id)!;

describe('geometria de terminais', () => {
  it('gira os terminais junto com o símbolo (SVG: rotate horário)', () => {
    const base = place('resistor', 5, 5, 100);
    expect(terminalPos(base, 0)).toEqual({ x: 4, y: 5 });
    expect(terminalPos(base, 1)).toEqual({ x: 6, y: 5 });

    const v90: Placed = { ...base, rot: 90 };
    expect(terminalPos(v90, 0)).toEqual({ x: 5, y: 4 }); // a em cima
    expect(terminalPos(v90, 1)).toEqual({ x: 5, y: 6 });

    const v270: Placed = { ...base, rot: 270 };
    expect(terminalPos(v270, 0)).toEqual({ x: 5, y: 6 }); // a embaixo
    expect(terminalPos(v270, 1)).toEqual({ x: 5, y: 4 });
  });

  it('terra tem um terminal só, apontando para cima', () => {
    const g = place('ground', 3, 7, 0);
    expect(terminalPos(g, 0)).toEqual({ x: 3, y: 7 });
  });
});

describe('traçado de fio', () => {
  it('terminais virados um para o outro => linha reta (os stubs colapsam)', () => {
    const d = doc([place('resistor', 5, 5, 100), place('resistor', 9, 5, 100)]);
    const pts = wireRoute(d, { id: 'w', from: { x: 6, y: 5 }, to: { x: 8, y: 5 } });
    expect(pts).toEqual([
      { x: 6, y: 5 },
      { x: 8, y: 5 },
    ]);
  });

  it('sempre ortogonal, com no máximo uma dobra', () => {
    const d = doc([place('resistor', 5, 5, 100)]);
    const pts = wireRoute(d, { id: 'w', from: { x: 6, y: 5 }, to: { x: 12, y: 11 } });
    expect(pts[0]).toEqual({ x: 6, y: 5 });
    expect(pts[pts.length - 1]).toEqual({ x: 12, y: 11 });
    let bends = 0;
    for (let i = 1; i + 1 < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const axisA = a.x === b.x ? 'v' : a.y === b.y ? 'h' : 'x';
      const axisB = b.x === c.x ? 'v' : b.y === c.y ? 'h' : 'x';
      expect(['v', 'h']).toContain(axisA);
      expect(['v', 'h']).toContain(axisB);
      if (axisA !== axisB) bends++;
    }
    expect(bends).toBeLessThanOrEqual(1);
  });

  it('destino atrás do terminal => contorna para fora em vez de atravessar o corpo', () => {
    // fonte em (4,3): terminal + em (5,3) olhando para a direita
    const d = doc([place('vsource', 4, 3, 9), place('resistor', 2, 9, 100)]);
    const pts = wireRoute(d, { id: 'w', from: { x: 5, y: 3 }, to: { x: 1, y: 9 } });
    // sai para a direita (fora do corpo), desce e só então vai para o destino
    expect(pts).toEqual([
      { x: 5, y: 3 },
      { x: 6, y: 3 },
      { x: 6, y: 9 },
      { x: 1, y: 9 },
    ]);
  });
});

describe('conexão', () => {
  it('terminais na mesma célula são o mesmo nó (componentes encostados)', () => {
    const r1 = place('resistor', 5, 5, 100);
    const r2 = place('resistor', 7, 5, 220);
    const bat = place('vsource', 2, 5, 9);
    const d = doc([bat, r1, r2], [wire({ x: 3, y: 5 }, { x: 4, y: 5 })]);
    const nl = buildNetlist(d);
    // b da fonte (3,5) -> a do r1 (4,5) pelo fio
    expect(nl.netByComp[r1.id][0]).toBe(nl.netByComp[bat.id][1]);
    // b do r1 (6,5) encosta no a do r2 (6,5): ligação sem fio
    expect(nl.netByComp[r2.id][0]).toBe(nl.netByComp[r1.id][1]);
  });

  it('fio que atravessa outro fio NÃO conecta (cruzamento sem junção)', () => {
    const r1 = place('resistor', 10, 5, 100); // terminais em (9,5) e (11,5)
    const r2 = place('resistor', 5, 10, 100, { rot: 90 }); // terminais em (5,9) e (5,11)
    const d = doc([r1, r2], [wire({ x: 9, y: 5 }, { x: 2, y: 5 }), wire({ x: 5, y: 9 }, { x: 5, y: 1 })]);
    const nl = buildNetlist(d);
    expect(nl.netByComp[r1.id][0]).not.toBe(nl.netByComp[r2.id][0]);
  });

  it('fio que termina NO MEIO de outro conecta (junção em T)', () => {
    const r1 = place('resistor', 11, 5, 100); // a em (10,5), ponta do fio 1
    const r2 = place('resistor', 6, 10, 100, { rot: 90 }); // a em (6,9)
    const d = doc(
      [r1, r2],
      [wire({ x: 2, y: 5 }, { x: 10, y: 5 }), wire({ x: 6, y: 5 }, { x: 6, y: 9 })],
    );
    const nl = buildNetlist(d);
    expect(nl.netByComp[r1.id][0]).toBe(nl.netByComp[r2.id][0]);
    // e a junção vira ponto desenhável
    expect(nl.junctions).toContainEqual({ x: 6, y: 5 });
  });

  it('cruzamento não gera ponto de junção', () => {
    const d = doc(
      [place('resistor', 10, 5, 100), place('resistor', 5, 10, 100, { rot: 90 })],
      [wire({ x: 9, y: 5 }, { x: 2, y: 5 }), wire({ x: 5, y: 9 }, { x: 5, y: 1 })],
    );
    expect(buildNetlist(d).junctions).toHaveLength(0);
  });

  it('todos os terras são o mesmo nó de referência', () => {
    const g1 = place('ground', 2, 2, 0);
    const g2 = place('ground', 12, 2, 0);
    const d = doc([g1, g2]);
    const nl = buildNetlist(d);
    expect(nl.netByComp[g1.id][0]).toBe('GND');
    expect(nl.netByComp[g2.id][0]).toBe('GND');
  });

  it('sem terra explícito, o terminal negativo da fonte vira GND', () => {
    const bat = place('vsource', 5, 5, 9);
    const nl = buildNetlist(doc([bat]));
    expect(nl.netByComp[bat.id][0]).toBe('GND');
  });
});

describe('chave', () => {
  function comChave(fechada: boolean) {
    const bat = place('vsource', 4, 6, 9);
    const r = place('resistor', 10, 6, 100);
    const sw = place('switch', 16, 6, 0, { closed: fechada });
    const wires = [
      wire({ x: 5, y: 6 }, { x: 9, y: 6 }),
      wire({ x: 11, y: 6 }, { x: 15, y: 6 }),
      wire({ x: 17, y: 6 }, { x: 20, y: 6 }),
      wire({ x: 20, y: 6 }, { x: 20, y: 14 }),
      wire({ x: 20, y: 14 }, { x: 3, y: 14 }),
      wire({ x: 3, y: 14 }, { x: 3, y: 6 }),
    ];
    return doc([bat, r, sw], wires);
  }

  it('aberta => corrente zero e nenhum erro', () => {
    const d = comChave(false);
    const r = readCircuit(d);
    expect(r.error).toBeNull();
    expect(Math.abs(reading(d, 1).amps)).toBeCloseTo(0, 12);
  });

  it('fechada => a corrente circula e a chave some do netlist', () => {
    const d = comChave(true);
    const r = readCircuit(d);
    expect(r.error).toBeNull();
    expect(Math.abs(reading(d, 1).amps)).toBeCloseTo(0.09, 12);
    expect(buildNetlist(d).dropped).toContain(d.comps[2].id);
  });
});

describe('solver ligado ao documento', () => {
  it('divisor de tensão: 9 V em 100 Ω + 100 Ω => 4,5 V no meio', () => {
    const bat = place('vsource', 4, 6, 9);
    const r1 = place('resistor', 10, 6, 100);
    const r2 = place('resistor', 10, 14, 100);
    const d = doc(
      [bat, r1, r2],
      [
        wire({ x: 5, y: 6 }, { x: 9, y: 6 }),
        wire({ x: 11, y: 6 }, { x: 14, y: 6 }),
        wire({ x: 14, y: 6 }, { x: 14, y: 14 }),
        wire({ x: 14, y: 14 }, { x: 11, y: 14 }),
        wire({ x: 9, y: 14 }, { x: 3, y: 14 }),
        wire({ x: 3, y: 14 }, { x: 3, y: 6 }),
      ],
    );
    const r = readCircuit(d);
    expect(r.error).toBeNull();
    expect(reading(d, 0).volts).toBeCloseTo(9, 9); // fonte entregando 9 V
    expect(Math.abs(reading(d, 1).amps)).toBeCloseTo(0.045, 9);
    expect(Math.abs(reading(d, 1).volts)).toBeCloseTo(4.5, 9);
    expect(Math.abs(reading(d, 2).volts)).toBeCloseTo(4.5, 9);
    expect(r.nodes.find((n) => n.net === 'GND')!.volts).toBe(0);
  });

  it('paralelo: duas ramas de 100 Ω => 90 mA em cada (180 mA no total)', () => {
    const bat = place('vsource', 4, 11, 9, { rot: 270 });
    const r1 = place('resistor', 12, 11, 100, { rot: 90 });
    const r2 = place('resistor', 18, 11, 100, { rot: 90 });
    const d = doc(
      [bat, r1, r2],
      [
        wire({ x: 4, y: 10 }, { x: 4, y: 4 }),
        wire({ x: 4, y: 12 }, { x: 4, y: 18 }),
        wire({ x: 4, y: 4 }, { x: 18, y: 4 }),
        wire({ x: 4, y: 18 }, { x: 18, y: 18 }),
        wire({ x: 12, y: 4 }, { x: 12, y: 10 }),
        wire({ x: 12, y: 12 }, { x: 12, y: 18 }),
        wire({ x: 18, y: 4 }, { x: 18, y: 10 }),
        wire({ x: 18, y: 12 }, { x: 18, y: 18 }),
      ],
    );
    const r = readCircuit(d);
    expect(r.error).toBeNull();
    expect(Math.abs(reading(d, 1).amps)).toBeCloseTo(0.09, 9);
    expect(Math.abs(reading(d, 2).amps)).toBeCloseTo(0.09, 9);
    expect(Math.abs(reading(d, 0).amps)).toBeCloseTo(0.18, 9);
  });

  it('capacitor em regime permanente não conduz (circuito aberto)', () => {
    const bat = place('vsource', 4, 6, 9);
    const cap = place('capacitor', 10, 6, 1e-6);
    // Laço por baixo: um fio reto de 11 a 3 em y=6 atravessaria os dois
    // terminais do capacitor e o curto-circuitaria.
    const d = doc(
      [bat, cap],
      [
        wire({ x: 5, y: 6 }, { x: 9, y: 6 }),
        wire({ x: 11, y: 6 }, { x: 11, y: 12 }),
        wire({ x: 11, y: 12 }, { x: 3, y: 12 }),
        wire({ x: 3, y: 12 }, { x: 3, y: 6 }),
      ],
    );
    const r = readCircuit(d);
    expect(r.error).toBeNull();
    expect(reading(d, 1).amps).toBe(0);
    expect(reading(d, 1).volts).toBeCloseTo(9, 9); // fica carregado na tensão da fonte
  });

  it('lâmpada vira resistor e devolve potência/brilho', () => {
    const bat = place('vsource', 4, 6, 6);
    const lamp = place('lamp', 10, 6, 36, { aux: 6 }); // R = 36 Ω, nominal 6 W
    // Volta por baixo: um fio reto de 11 a 3 em y=6 atravessaria os dois
    // terminais da lâmpada e a curto-circuitaria (junção em T é proposital).
    const d = doc(
      [bat, lamp],
      [
        wire({ x: 5, y: 6 }, { x: 9, y: 6 }),
        wire({ x: 11, y: 6 }, { x: 11, y: 12 }),
        wire({ x: 11, y: 12 }, { x: 3, y: 12 }),
        wire({ x: 3, y: 12 }, { x: 3, y: 6 }),
      ],
    );
    const r = readCircuit(d);
    expect(r.error).toBeNull();
    const l = reading(d, 1);
    expect(l.amps).toBeCloseTo(6 / 36, 9);
    expect(l.watts).toBeCloseTo(1, 9);
    expect(l.glow).toBeCloseTo(1 / 6, 9);
  });

  it('componente solto não derruba o resto: ele só lê 0 e segue operante', () => {
    const bat = place('vsource', 4, 6, 9);
    const r1 = place('resistor', 10, 6, 100);
    const r2 = place('resistor', 20, 20, 100); // solto no espaço
    // Fechamos o laço por baixo; um fio reto de 11 a 3 em y=6 passaria por
    // cima do terminal em (9,6) e ligaria tudo num nó só.
    const d = doc(
      [bat, r1, r2],
      [
        wire({ x: 5, y: 6 }, { x: 9, y: 6 }),
        wire({ x: 11, y: 6 }, { x: 11, y: 12 }),
        wire({ x: 11, y: 12 }, { x: 3, y: 12 }),
        wire({ x: 3, y: 12 }, { x: 3, y: 6 }),
      ],
    );
    const out = readCircuit(d);
    expect(out.error).toBeNull();
    expect(Math.abs(reading(d, 1).amps)).toBeCloseTo(0.09, 9);
    expect(reading(d, 2).amps).toBe(0);
    expect(reading(d, 2).volts).toBe(0);
  });

  it('parte isolada é ancorada no GND (sem matriz singular numa montagem pela metade)', () => {
    // laço funcional + laço isolado; sem o ancoramento a matriz seria singular
    const bat = place('vsource', 4, 6, 9);
    const r1 = place('resistor', 10, 6, 100);
    const bat2 = place('vsource', 4, 16, 6);
    const r2 = place('resistor', 10, 16, 100);
    const loop = (y: number) => [
      wire({ x: 5, y }, { x: 9, y }),
      wire({ x: 11, y }, { x: 11, y: y + 6 }),
      wire({ x: 11, y: y + 6 }, { x: 3, y: y + 6 }),
      wire({ x: 3, y: y + 6 }, { x: 3, y }),
    ];
    const d = doc([bat, r1, bat2, r2], [...loop(6), ...loop(16)]);
    const out = readCircuit(d);
    expect(out.error).toBeNull();
    expect(Math.abs(reading(d, 0).amps)).toBeCloseTo(0.09, 6);
    // a fonte isolada continua lendo a própria tensão (âncora = o terminal − dela)
    expect(reading(d, 2).volts).toBeCloseTo(6, 6);
  });

  it('duas fontes ideais em conflito são erro legível, não exceção solta', () => {
    const bat1 = place('vsource', 4, 6, 9);
    const bat2 = place('vsource', 4, 12, 6);
    const d = doc(
      [bat1, bat2],
      [wire({ x: 5, y: 6 }, { x: 5, y: 12 }), wire({ x: 3, y: 6 }, { x: 3, y: 12 })],
    );
    const out = readCircuit(d);
    expect(out.error).toMatch(/singular/i);
  });

  it('fonte em curto vira diagnóstico, não trava o app', () => {
    const bat = place('vsource', 4, 6, 9);
    const r = place('resistor', 12, 6, 100);
    const d = doc(
      [bat, r],
      [
        wire({ x: 3, y: 6 }, { x: 5, y: 6 }), // liga o + ao −
        wire({ x: 5, y: 6 }, { x: 11, y: 6 }),
        wire({ x: 13, y: 6 }, { x: 3, y: 6 }),
      ],
    );
    const out = readCircuit(d);
    expect(out.diagnostics.join(' ')).toMatch(/curto/i);
    expect(buildNetlist(d).dropped).toContain(bat.id);
    expect(out.error).toBeNull();
  });

  it('documento vazio devolve leitura vazia (sem erro)', () => {
    expect(readCircuit({ comps: [], wires: [] }).empty).toBe(true);
  });
});

describe('movimento e rotação mantêm os fios', () => {
  it('mover componente arrasta junto os fios encostados', () => {
    const bat = place('vsource', 4, 6, 9);
    const r = place('resistor', 10, 6, 100);
    const before = [terminalPos(r, 0), terminalPos(r, 1)];
    // Laço por baixo, para o fio de retorno não atravessar os terminais em y=6.
    const d = doc(
      [bat, r],
      [
        wire({ x: 5, y: 6 }, { x: 9, y: 6 }),
        wire({ x: 11, y: 6 }, { x: 11, y: 12 }),
        wire({ x: 11, y: 12 }, { x: 3, y: 12 }),
        wire({ x: 3, y: 12 }, { x: 3, y: 6 }),
      ],
    );
    const moved: Placed = { ...r, x: 10, y: 12 };
    const after = reattachWires(d, moved, before);
    expect(after.wires[0].to).toEqual({ x: 9, y: 12 });
    expect(after.wires[1].from).toEqual({ x: 11, y: 12 });
    // Os dois fios que encostavam nos terminais acompanharam o movimento;
    // nenhum deles ficou pendurado no ponto antigo.
    expect(after.wires.some((w) => w.from.x === 11 && w.from.y === 6)).toBe(false);
    expect(after.wires.some((w) => w.to.x === 9 && w.to.y === 6)).toBe(false);
    // E os trechos de retorno não foram arrastados (não encostavam no comp).
    expect(after.wires[2]).toEqual({ id: after.wires[2].id, from: { x: 11, y: 12 }, to: { x: 3, y: 12 } });
  });

  it('fio encostado em terminal COMPARTILHADO fica com o outro componente', () => {
    const r1 = place('resistor', 5, 5, 100); // b em (6,5)
    const r2 = place('resistor', 7, 5, 100); // a em (6,5) — encostados
    const d = doc([r1, r2], [wire({ x: 6, y: 5 }, { x: 6, y: 9 })]);
    const before = [terminalPos(r1, 0), terminalPos(r1, 1)];
    const moved: Placed = { ...r1, x: 5, y: 9 };
    const after = reattachWires(d, moved, before);
    expect(after.wires[0].from).toEqual({ x: 6, y: 5 });
  });
});
