import { describe, expect, it } from 'vitest';
import { MundoNaMao, type MundoFrame } from './navigate';

/** Um quadro do gesto: pinça no vazio, tamanho da palma e ângulo da palma. */
const frame = (size: number, ang = 0, grabbing = true): MundoFrame => ({ grabbing, size, ang });

describe('MundoNaMao (navegação de uma mão)', () => {
  it('mão aberta não navega e não deixa referência para a próxima pinça', () => {
    const m = new MundoNaMao();
    expect(m.update(frame(0.2, 0, false))).toEqual({ zoom: 1, roll: 0 });
    expect(m.active).toBe(false);
    // "soltou" em cima de um tamanho; a próxima pinça em OUTRO tamanho não salta
    m.update(frame(0.2));
    m.update(frame(0.5, 0, false));
    expect(m.update(frame(0.5)).zoom).toBe(1); // primeiro quadro da nova pinça
  });

  it('o primeiro quadro só fixa a régua (sem salto na largada)', () => {
    const m = new MundoNaMao();
    expect(m.update(frame(0.2))).toEqual({ zoom: 1, roll: 0 });
    expect(m.active).toBe(true);
  });

  it('mão para perto da lente aproxima a bancada; para longe, afasta', () => {
    const m = new MundoNaMao();
    m.update(frame(0.2));
    const perto = m.update(frame(0.22)); // +10%
    expect(perto.zoom).toBeGreaterThan(1);
    const longe = m.update(frame(0.2)); // volta 10%: o ratchet já está em 0,22
    expect(longe.zoom).toBeLessThan(1);
  });

  it('zona morta: 3% não é gesto, mas o acumulado (ratchet) cruza os 4%', () => {
    const m = new MundoNaMao();
    m.update(frame(0.2));
    expect(m.update(frame(0.206)).zoom).toBe(1); // +3%: tremor
    expect(m.update(frame(0.209)).zoom).toBeGreaterThan(1); // +4,5%: conta
  });

  it('trava por quadro: um pulo de detecção não arremessa a câmera', () => {
    const m = new MundoNaMao();
    m.update(frame(0.2));
    const salto = m.update(frame(0.6)); // 3x de uma vez
    expect(salto.zoom).toBeLessThanOrEqual(1.04);
    expect(salto.zoom).toBeGreaterThan(1);
    // e o excedente NÃO fica pendente: a régua andou junto
    expect(m.update(frame(0.6)).zoom).toBe(1);
  });

  it('girar a mão no plano gira a bancada (os dois sentidos)', () => {
    const m = new MundoNaMao();
    m.update(frame(0.2, 0));
    const horario = m.update(frame(0.2, 0.1));
    expect(horario.roll).toBeCloseTo(0.1, 5);
    const anti = m.update(frame(0.2, 0));
    expect(anti.roll).toBeCloseTo(-0.1, 5);
  });

  it('giro: zona morta e trava por quadro', () => {
    const m = new MundoNaMao();
    m.update(frame(0.2, 0));
    expect(m.update(frame(0.2, 0.01)).roll).toBe(0); // 0,6°: tremor
    const pulo = m.update(frame(0.2, -0.4));
    expect(pulo.roll).toBe(-0.25); // travado
    expect(m.update(frame(0.2, -0.4)).roll).toBe(0); // régua andou junto
  });

  it('atravessa ±π sem dar uma volta inteira', () => {
    const m = new MundoNaMao();
    m.update(frame(0.2, Math.PI - 0.02));
    const d = m.update(frame(0.2, -Math.PI + 0.02)); // +0,04 cruzando o π
    expect(Math.abs(d.roll)).toBeCloseTo(0.04, 5);
  });

  it('os canais são ortogonais: girar no plano não é zoom, profundidade não é giro', () => {
    const m = new MundoNaMao();
    m.update(frame(0.2, 0));
    // só giro, tamanho FIXO (a palma gira em torno de si)
    for (let a = 0.02; a <= 0.2; a += 0.02) expect(m.update(frame(0.2, a)).zoom).toBe(1);
    // só profundidade, ângulo FIXO
    for (let s = 0.21; s <= 0.26; s += 0.01) expect(m.update(frame(s, 0.2)).roll).toBe(0);
  });

  it('vai e volta: o giro não acumula deriva', () => {
    const m = new MundoNaMao();
    m.update(frame(0.2, 0));
    const total = [0.02, 0.04, 0.02, 0].reduce((s, a) => s + m.update(frame(0.2, a)).roll, 0);
    expect(total).toBeCloseTo(0, 1);
  });

  it('amostra inválida de tamanho/ângulo não vira número maluco', () => {
    const m = new MundoNaMao();
    m.update(frame(0.2, 0));
    expect(m.update({ grabbing: true, size: NaN, ang: NaN })).toEqual({ zoom: 1, roll: 0 });
    // a régua foi refeita: o próximo quadro válido não salta
    expect(m.update(frame(0.2, 0))).toEqual({ zoom: 1, roll: 0 });
  });

  it('reset (troca de mão/vista/câmera) recomeça sem salto', () => {
    const m = new MundoNaMao();
    m.update(frame(0.2, 0));
    m.update(frame(0.22, 0.1));
    m.reset();
    expect(m.update(frame(0.3, 2)).zoom).toBe(1);
    expect(m.update(frame(0.3, 2)).roll).toBe(0);
  });
});
