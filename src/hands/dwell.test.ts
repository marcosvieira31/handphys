import { describe, expect, it } from 'vitest';
import { DwellController } from './dwell';

describe('DwellController (mira por fixação)', () => {
  it('dispara só depois de manter o MESMO alvo pelo tempo todo', () => {
    const d = new DwellController(3000);
    expect(d.update('a', 0).fired).toBe(false);
    expect(d.update('a', 1500).progress).toBeCloseTo(0.5, 6);
    expect(d.update('a', 2999).fired).toBe(false);
    const done = d.update('a', 3000);
    expect(done.fired).toBe(true);
    expect(done.progress).toBe(1);
  });

  it('trocar de alvo zera o progresso', () => {
    const d = new DwellController(3000);
    d.update('a', 0);
    d.update('a', 2500);
    expect(d.update('b', 2600).progress).toBe(0);
    expect(d.update('b', 2600 + 3000).fired).toBe(true);
  });

  it('sair para o vazio limpa a mira', () => {
    const d = new DwellController(1000);
    d.update('a', 0);
    expect(d.update(null, 500)).toEqual({ id: null, progress: 0, fired: false });
    expect(d.target).toBeNull();
    // voltar ao mesmo alvo recomeça do zero
    expect(d.update('a', 600).progress).toBe(0);
  });

  it('não repete enquanto a mira continua no alvo (precisa sair e voltar)', () => {
    const d = new DwellController(1000);
    d.update('a', 0);
    expect(d.update('a', 1000).fired).toBe(true);
    expect(d.update('a', 1500).fired).toBe(false);
    expect(d.update('a', 5000).fired).toBe(false);
    // saiu e voltou: pode disparar de novo
    d.update(null, 5100);
    d.update('a', 5200);
    expect(d.update('a', 6300).fired).toBe(true);
  });

  it('progresso não passa de 1', () => {
    const d = new DwellController(1000);
    d.update('a', 0);
    d.update('a', 1000);
    expect(d.progress).toBe(1);
  });
});
