import { describe, expect, it } from 'vitest';
import { GND, simulate, solveDC, type Component } from './circuit';

// Fatos de referência (o aluno vai ver estes números na tela do laboratório):
// - divisor de tensão:  Vmid = Vs · R2/(R1+R2)
// - série:              Req = R1+R2
// - paralelo:           1/Req = 1/R1+1/R2
// - carga de RC:        vC(t) = Vs·(1 − e^(−t/RC))

const V = (id: string, a: string, b: string, volts: number): Component => ({
  kind: 'vsource',
  id,
  a,
  b,
  volts,
});
const R = (id: string, a: string, b: string, ohms: number): Component => ({
  kind: 'resistor',
  id,
  a,
  b,
  ohms,
});
const C = (id: string, a: string, b: string, farads: number): Component => ({
  kind: 'capacitor',
  id,
  a,
  b,
  farads,
});

describe('DC: lei de Ohm e topologias básicas', () => {
  it('divisor de tensão igual: 10 V em 1k/1k → 5 V no meio', () => {
    const s = solveDC([V('vs', GND, 'v1', 10), R('r1', 'v1', 'mid', 1000), R('r2', 'mid', GND, 1000)]);
    expect(s.voltage('mid')).toBeCloseTo(5, 9);
    expect(s.current('r1')).toBeCloseTo(0.005, 9); // 5 mA, sentido v1→mid
    expect(s.current('r2')).toBeCloseTo(0.005, 9);
    expect(s.current('vs')).toBeCloseTo(0.005, 9); // fonte fornece o mesmo
  });

  it('divisor desigual segue a razão dos resistores: 9 V em 1k/2k → 6 V', () => {
    const s = solveDC([V('vs', GND, 'v1', 9), R('r1', 'v1', 'mid', 1000), R('r2', 'mid', GND, 2000)]);
    expect(s.voltage('mid')).toBeCloseTo(6, 9);
  });

  it('em série as resistências somam: 1k + 2k com 9 V → 3 mA', () => {
    const s = solveDC([V('vs', GND, 'v1', 9), R('r1', 'v1', 'mid', 1000), R('r2', 'mid', GND, 2000)]);
    expect(s.current('r1')).toBeCloseTo(0.003, 9);
    expect(s.current('r2')).toBeCloseTo(0.003, 9);
    // Queda proporcional à resistência (Lei de Ohm em cada ramo)
    expect(s.voltage('v1') - s.voltage('mid')).toBeCloseTo(3, 9);
    expect(s.voltage('mid')).toBeCloseTo(6, 9);
  });

  it('em paralelo dividem a corrente: 1k ∥ 1k com 10 V → 10 mA em cada ramo', () => {
    const s = solveDC([
      V('vs', GND, 'v1', 10),
      R('r1', 'v1', GND, 1000),
      R('r2', 'v1', GND, 1000),
    ]);
    expect(s.current('r1')).toBeCloseTo(0.01, 9);
    expect(s.current('r2')).toBeCloseTo(0.01, 9);
    expect(s.current('vs')).toBeCloseTo(0.02, 9); // Req = 500 Ω → 20 mA
  });

  it('paralelo assimétrico: 1k ∥ 3k com 12 V → correntes na razão 3:1 (Kirchhoff)', () => {
    const s = solveDC([
      V('vs', GND, 'v1', 12),
      R('r1', 'v1', GND, 1000),
      R('r2', 'v1', GND, 3000),
    ]);
    expect(s.current('r1')).toBeCloseTo(0.012, 9);
    expect(s.current('r2')).toBeCloseTo(0.004, 9);
    expect(s.current('r1') + s.current('r2')).toBeCloseTo(s.current('vs'), 12); // KCL na fonte
  });

  it('ponte simples: Kirchhoff confere num nó intermediário', () => {
    // 12 V → r1 → "n1"; n1 → r2 → GND e n1 → r3 → "n2" → r4 → GND
    const s = solveDC([
      V('vs', GND, 'v1', 12),
      R('r1', 'v1', 'n1', 100),
      R('r2', 'n1', GND, 200),
      R('r3', 'n1', 'n2', 300),
      R('r4', 'n2', GND, 400),
    ]);
    // KCL em n1: corrente que entra = soma das que saem
    expect(s.current('r1')).toBeCloseTo(s.current('r2') + s.current('r3'), 12);
    // KCL em n2
    expect(s.current('r3')).toBeCloseTo(s.current('r4'), 12);
  });

  it('fonte em oposição: duas fontes em série se subtraem', () => {
    // 10 V e 4 V com polaridades se opondo sobre 300 Ω → (10−4)/300 = 20 mA
    const s = solveDC([
      V('v1', GND, 'a', 10),
      V('v2', 'a', 'b', -4), // oposta: tenta empurrar contra v1
      R('r1', 'b', GND, 300),
    ]);
    expect(s.voltage('a')).toBeCloseTo(10, 9);
    expect(s.voltage('b')).toBeCloseTo(6, 9);
    expect(s.current('r1')).toBeCloseTo(0.02, 9);
  });

  it('capacitor em DC é circuito aberto: nenhuma corrente passa', () => {
    const s = solveDC([
      V('vs', GND, 'v1', 5),
      C('c1', 'v1', 'mid', 1e-6),
      R('r1', 'mid', GND, 1000),
    ]);
    expect(s.current('r1')).toBeCloseTo(0, 12);
    expect(s.voltage('mid')).toBeCloseTo(0, 12); // sem corrente não há queda em r1
    expect(s.voltage('v1') - s.voltage('mid')).toBeCloseTo(5, 9); // todo o V no capacitor
  });

  it('rejeita resistor com resistência inválida e id duplicado', () => {
    expect(() => solveDC([R('r1', 'a', GND, 0)])).toThrow(/ohms/);
    expect(() => solveDC([R('x', 'a', GND, 100), R('x', 'a', GND, 200)])).toThrow(/duplicado/);
  });

  it('circuito sem fonte é singular: erro claro, não NaN', () => {
    expect(() => solveDC([R('r1', 'a', 'b', 100)])).toThrow(/singular|flutuante/i);
  });
});

describe('transitório RC (Euler implícito)', () => {
  it('carga de um RC segue V·(1 − e^(−t/RC))', () => {
    const vs = 5;
    const ohms = 1000;
    const farads = 1e-6;
    const rc = ohms * farads; // 1 ms
    const sim = simulate([V('vs', GND, 'v1', vs), R('r1', 'v1', 'c', ohms), C('c1', 'c', GND, farads)], {
      seconds: 5 * rc,
      dt: rc / 200,
    });
    const at = (time: number) => {
      const i = Math.round(time / (rc / 200));
      return sim.voltage('c')[i];
    };
    // Em t = RC: 63,2 % de Vs
    expect(at(rc)).toBeCloseTo(vs * (1 - Math.exp(-1)), 1);
    // Em t = 5·RC: ~99,3 % de Vs
    expect(at(5 * rc)).toBeCloseTo(vs * (1 - Math.exp(-5)), 2);
    // Começa em zero e é sempre crescente (monotonia física)
    expect(sim.voltage('c')[0]).toBeCloseTo(0, 6);
    const series = sim.voltage('c');
    for (let i = 1; i < series.length; i++) {
      expect(series[i]).toBeGreaterThanOrEqual(series[i - 1] - 1e-12);
    }
  });

  it('corrente inicial do RC é Vs/R e decai junto com a tensão', () => {
    const sim = simulate([V('vs', GND, 'v1', 5), R('r1', 'v1', 'c', 1000), C('c1', 'c', GND, 1e-6)], {
      seconds: 5e-3,
      dt: 5e-6,
    });
    expect(sim.current('r1')[0]).toBeCloseTo(0.005, 9); // 5 mA em t = 0
    // A corrente decai: a última é bem menor que a primeira
    const i = sim.current('r1');
    expect(i[i.length - 1]).toBeLessThan(i[0] * 0.01);
  });

  it('descarga de um capacitor com carga inicial segue e^(−t/RC)', () => {
    const rc = 1e-3;
    const sim = simulate([R('r1', 'c', GND, 1000), C('c1', 'c', GND, 1e-6)], {
      seconds: rc,
      dt: rc / 200,
      initialV: { c1: 4 },
    });
    // Em t = RC resta 36,8 % da carga
    expect(sim.voltage('c')[200]).toBeCloseTo(4 * Math.exp(-1), 2);
  });

  it('energia: a tensão da fonte é a queda nos dois elementos (Kirchhoff no transitório)', () => {
    const sim = simulate([V('vs', GND, 'v1', 5), R('r1', 'v1', 'c', 1000), C('c1', 'c', GND, 1e-6)], {
      seconds: 3e-3,
      dt: 3e-6,
    });
    for (let i = 0; i < sim.t.length; i++) {
      const vR = sim.voltage('v1')[i] - sim.voltage('c')[i];
      const iR = sim.current('r1')[i];
      expect(vR).toBeCloseTo(iR * 1000, 6); // Lei de Ohm vale em todo instante
    }
  });

  it('dt inválido é rejeitado', () => {
    expect(() => simulate([C('c1', 'a', GND, 1e-6)], { seconds: 1, dt: 0 })).toThrow(/dt/);
  });
});
