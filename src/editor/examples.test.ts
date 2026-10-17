import { describe, expect, it } from 'vitest';
import { fechaConta, malhas, porNo } from '../core/kirchhoff';
import { readCircuit, terminalPos, wireRoute } from '../core/netlist';
import { rcStation } from '../core/rc';
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

  it('Divisor: r2 girado 180° — desenho intacto, leituras todas positivas', () => {
    const doc = EXAMPLES[1].doc;
    expect(doc.comps.find((c) => c.id === 'r2')?.rot).toBe(180);
    // girar o r2 NÃO mexe no desenho: as 7 retas continuam encostando nos
    // mesmos terminais (o resistor é simétrico, só os terminais trocam de lado)
    expect(doc.wires.map((w) => wireRoute(doc, w))).toEqual([
      [{ x: 5, y: 2 }, { x: 11, y: 2 }],
      [{ x: 13, y: 2 }, { x: 15, y: 2 }],
      [{ x: 15, y: 2 }, { x: 15, y: 7 }],
      [{ x: 15, y: 7 }, { x: 13, y: 7 }],
      [{ x: 11, y: 7 }, { x: 2, y: 7 }],
      [{ x: 2, y: 7 }, { x: 2, y: 2 }],
      [{ x: 2, y: 2 }, { x: 3, y: 2 }],
    ]);
    // e a corrente entra pelo lado direito do r2, então as três leituras saem
    // positivas (antes o r2 lia "−4,50 V | −45 mA", que confunde a turma)
    const out = readCircuit(doc);
    expect(out.error).toBeNull();
    for (const c of out.comps) {
      expect(c.volts).toBeGreaterThan(0);
      expect(c.amps).toBeGreaterThan(0);
    }
  });

  it('todo exemplo é feito de retas: sem degrau de 1 célula longe de um terminal', () => {
    for (const ex of EXAMPLES) {
      const terminais = new Set<string>();
      for (const c of ex.doc.comps)
        for (const i of [0, 1] as const) {
          const p = terminalPos(c, i);
          terminais.add(`${p.x},${p.y}`);
        }
      for (const w of ex.doc.wires) {
        const pts = wireRoute(ex.doc, w);
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) continue;
          // O único degrau admitido é a entrada de 1 célula no terminal (o fio
          // entra no lado para onde o terminal aponta). Um degrau no meio de
          // uma reta é o roteador corrigindo um fio declarado torto.
          expect(
            terminais.has(`${a.x},${a.y}`) || terminais.has(`${b.x},${b.y}`),
            `${ex.name}: degrau de 1 célula em ${a.x},${a.y} - ${b.x},${b.y}`,
          ).toBe(true);
        }
      }
    }
  });

  it('todo exemplo fecha a conta de Kirchhoff em todo nó', () => {
    for (const ex of EXAMPLES) {
      const nos = porNo(readCircuit(ex.doc));
      expect(nos.length, ex.name).toBeGreaterThan(0);
      for (const n of nos) {
        expect(n.ramos.length, `${ex.name} · nó ${n.net}`).toBeGreaterThanOrEqual(2);
        expect(fechaConta(n.soma), `${ex.name} · nó ${n.net}`).toBe(true);
      }
    }
  });

  it('o Paralelo é a junção de 4 ramos: 270 mA entram, 270 mA saem', () => {
    const nos = porNo(readCircuit(EXAMPLES[2].doc));
    expect(nos).toHaveLength(2); // só o nó do + e o do −
    expect(nos.every((n) => n.ramos.length === 4)).toBe(true);
    const gnd = nos.find((n) => n.net === 'GND')!;
    expect(gnd.entram).toBeCloseTo(0.27, 9); // os três ramos de 90 mA
    expect(gnd.saem).toBeCloseTo(0.27, 9); // a fonte entregando os 270 mA
    expect(gnd.ramos.filter((r) => r.sentido === 'entra')).toHaveLength(3);
  });

  it('Circuito RC: em regime o capacitor é circuito aberto — 9 V e 0 A', () => {
    const doc = EXAMPLES[3].doc;
    const out = readCircuit(doc);
    expect(out.error).toBeNull();
    expect(out.diagnostics.join(' ')).not.toMatch(/curto/i);
    const cap = out.comps.find((c) => c.id === 'c1')!;
    expect(cap.volts).toBeCloseTo(9, 6); // carregado: a tensão toda da fonte
    expect(cap.amps).toBeCloseTo(0, 9); // e sem corrente nenhuma passando
    expect(out.comps.find((c) => c.id === 'r1')!.amps).toBeCloseTo(0, 9);
    // a estação RC é quem mostra o que acontece no instante em que a chave fecha
    const st = rcStation(doc)!;
    expect(st.carga!.vinf).toBeCloseTo(9, 6);
    expect(st.carga!.tau).toBeCloseTo(1, 1); // 1 kΩ · 1000 µF
  });

  it('2ª lei: toda volta de exemplo fecha a tensão — e as independentes são 1, 1, 3 e 1', () => {
    const contagens: number[] = [];
    for (const ex of EXAMPLES) {
      const out = readCircuit(ex.doc);
      const ms = malhas(out);
      expect(ms.length, ex.name).toBeGreaterThan(0);
      for (const m of ms) {
        expect(fechaConta(m.soma), `${ex.name} · volta`).toBe(true);
        expect(m.passos[0].de, `${ex.name} · partida`).toBe(out.gnd);
      }
      contagens.push(ms.length);
    }
    expect(contagens).toEqual([1, 1, 3, 1]);
  });
});
