import { describe, expect, it } from 'vitest';
import type { CircuitDoc } from './netlist';
import { medirTau, rcStation, semFontes, TAU_FRACAO } from './rc';

/** O RC de sempre: fonte — chave — R — C, na mesma geometria do exemplo. */
function rcDoc(R = 1000, C = 1e-3, chaveFechada = true): CircuitDoc {
  return {
    comps: [
      { id: 'bat1', kind: 'vsource', x: 4, y: 4, rot: 0, value: 9 },
      { id: 'sw1', kind: 'switch', x: 7, y: 4, rot: 0, value: 0, closed: chaveFechada },
      { id: 'r1', kind: 'resistor', x: 11, y: 4, rot: 0, value: R },
      { id: 'c1', kind: 'capacitor', x: 15, y: 4, rot: 0, value: C },
    ],
    wires: [
      { id: 'w1', from: { x: 5, y: 4 }, to: { x: 6, y: 4 } },
      { id: 'w2', from: { x: 8, y: 4 }, to: { x: 10, y: 4 } },
      { id: 'w3', from: { x: 12, y: 4 }, to: { x: 14, y: 4 } },
      { id: 'w4', from: { x: 16, y: 4 }, to: { x: 16, y: 9 } },
      { id: 'w5', from: { x: 16, y: 9 }, to: { x: 3, y: 4 } },
    ],
  };
}

const cap = (doc: CircuitDoc) => {
  const st = rcStation(doc);
  expect(st).not.toBeNull();
  return st!;
};

describe('estação RC — carga', () => {
  it('carrega de 0 até a tensão da fonte, com τ = R·C medido nos 63,2%', () => {
    const st = cap(rcDoc(1000, 1e-3));
    const c = st.carga!;
    expect(c.v0).toBeCloseTo(0, 9);
    expect(c.vinf).toBeCloseTo(9, 6);
    expect(c.tau).not.toBeNull();
    expect(Math.abs(c.tau! - 1)).toBeLessThan(0.02); // 1 kΩ · 1000 µF = 1,0 s
    // a janela do gráfico é ~4,5 τ: dá para ler a curva inteira
    expect(c.window).toBeGreaterThan(4.2);
    expect(c.window / c.tau!).toBeGreaterThan(4.3);
    expect(c.window / c.tau!).toBeLessThan(4.7);
  });

  it('a curva é monótona e vale 63,2% do caminho em t = τ', () => {
    const c = cap(rcDoc()).carga!;
    for (let k = 1; k < c.v.length; k++) expect(c.v[k]).toBeGreaterThanOrEqual(c.v[k - 1] - 1e-9);
    const k = c.t.findIndex((t) => t >= c.tau!);
    expect(c.v[k] / c.vinf).toBeCloseTo(TAU_FRACAO, 2);
    // e no fim da janela (4,5 τ) falta pouco mais de 1% do salto: e⁻⁴·⁵
    expect(Math.abs(c.vinf - c.v[c.v.length - 1]) / c.vinf).toBeLessThan(0.02);
  });

  it('a corrente inicial é a da lei de Ohm: V/R, e cai a zero', () => {
    const c = cap(rcDoc(1000, 1e-3)).carga!;
    expect(c.i[0]).toBeCloseTo(0.009, 6); // 9 V / 1 kΩ = 9 mA
    expect(Math.abs(c.i[c.i.length - 1])).toBeLessThan(0.02 * Math.abs(c.i[0]));
    // em t = τ a corrente já caiu para 36,8% de I₀
    const k = c.t.findIndex((t) => t >= c.tau!);
    expect(c.i[k] / c.i[0]).toBeCloseTo(Math.exp(-1), 2);
  });

  it('τ acompanha R e C (dobrar C dobra o tempo)', () => {
    const um = cap(rcDoc(1000, 1e-3)).carga!;
    const dois = cap(rcDoc(1000, 2e-3)).carga!;
    const meio = cap(rcDoc(500, 1e-3)).carga!;
    expect(dois.tau! / um.tau!).toBeCloseTo(2, 2);
    expect(meio.tau! / um.tau!).toBeCloseTo(0.5, 2);
  });
});

describe('estação RC — descarga', () => {
  it('é a fonte trocada por um fio: parte do valor carregado e cai a zero, com o MESMO τ', () => {
    const st = cap(rcDoc(1000, 1e-3));
    const d = st.descarga!;
    expect(d.v0).toBeCloseTo(9, 6); // o regime que a carga alcança
    expect(d.vinf).toBeCloseTo(0, 6);
    expect(d.tau).not.toBeNull();
    expect(d.tau!).toBeCloseTo(st.carga!.tau!, 5); // o MESMO caminho de resistor
    expect(d.i[0]).toBeCloseTo(-0.009, 6); // a corrente inverteu
    for (let k = 1; k < d.v.length; k++) expect(d.v[k]).toBeLessThanOrEqual(d.v[k - 1] + 1e-9);
  });

  it('semFontes troca cada fonte por um fio (chave fechada) e abre o laço da descarga', () => {
    const sem = semFontes(rcDoc());
    const bat = sem.comps.find((c) => c.id === 'bat1')!;
    expect(bat.kind).toBe('switch');
    expect(bat.closed).toBe(true);
    // as fontes são as únicas que viraram fio; o resto fica como estava
    expect(sem.comps.filter((c) => c.kind === 'vsource')).toHaveLength(0);
    expect(sem.comps.find((c) => c.id === 'r1')!.kind).toBe('resistor');
  });
});

describe('estação RC — recusas e cantos', () => {
  it('sem capacitor não há estação (nada na tela)', () => {
    const doc = rcDoc();
    expect(rcStation({ ...doc, comps: doc.comps.filter((c) => c.kind !== 'capacitor') })).toBeNull();
  });

  it('capacitor com valor zerado não tem curva — mas a tela sabe dizer isso', () => {
    const st = cap(rcDoc(1000, 0));
    expect(st.carga).toBeNull();
    expect(st.descarga).toBeNull();
  });

  it('circuito sem fonte não carrega nada (a estação avisa em vez de mentir)', () => {    const doc = rcDoc();
    const semFonte = semFontes(doc);
    const st = cap(semFonte);
    expect(st.temFonte).toBe(false);
    expect(st.carga!.tau).toBeNull(); // não há salto: 0 V para 0 V
  });

  it('montagem pela metade (chave fora do lugar) não explode: devolve sem curva', () => {
    const doc = rcDoc();
    const semChave = { ...doc, comps: doc.comps.filter((c) => c.kind !== 'switch') };
    let st: ReturnType<typeof rcStation> = null;
    expect(() => {
      st = rcStation(semChave);
    }).not.toThrow();
    // o circuito ficou com uma ilha que só se liga ao resto pelo capacitor
    // (aberto): o solver avisa "matriz singular" e a estação mostra a dica em
    // vez de desenhar uma curva inventada.
    expect(st!.carga).toBeNull();
    expect(st!.descarga).toBeNull();
  });

  it('o capacitor escolhido manda: o selecionado vence, id inválido cai no primeiro', () => {
    const doc = rcDoc();
    expect(cap(doc).capId).toBe('c1');
    expect(rcStation(doc, 'nao-existe')!.capId).toBe('c1');
  });

  it('é função pura do documento: dois cálculos, os mesmos números', () => {
    const a = cap(rcDoc()).carga!;
    const b = cap(rcDoc()).carga!;
    expect(a.tau).toBe(b.tau);
    expect(a.window).toBe(b.window);
  });
});

describe('medirTau — a régua do osciloscópio', () => {
  const n = 400;
  const t = Array.from({ length: n + 1 }, (_, i) => (i / n) * 5);

  it('acha o τ subindo (carga) e descendo (descarga)', () => {
    const sobe = t.map((x) => 9 * (1 - Math.exp(-x)));
    const desce = t.map((x) => 9 * Math.exp(-x));
    expect(medirTau(t, sobe, 0, 9)).toBeCloseTo(1, 3);
    expect(medirTau(t, desce, 9, 0)).toBeCloseTo(1, 3);
  });

  it('sem cruzamento devolve null (linha reta não tem τ)', () => {
    expect(medirTau(t, t.map(() => 5), 5, 5)).toBeNull();
  });

  it('TAU_FRACAO é 63,2%', () => {
    expect(TAU_FRACAO).toBeCloseTo(0.632, 3);
  });
});
