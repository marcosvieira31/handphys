import { describe, expect, it } from 'vitest';
import { deslocDaRoda } from './Rails';

/**
 * A faixa horizontal do trilho (bancada estreita) rola com o dedo e com a
 * barra; com MOUSE o que falta é a roda. `deslocDaRoda` é a tradução:
 * deltaY => rolagem lateral, e nada quando quem está mexendo é um trackpad
 * (ele já manda delta X, que o navegador cuida sozinho).
 */
describe('roda do mouse na faixa do trilho (deslocDaRoda)', () => {
  it('roda vertical vira rolagem lateral, nos dois sentidos', () => {
    expect(deslocDaRoda(40, 0)).toBe(40);
    expect(deslocDaRoda(-40, 0)).toBe(-40);
  });

  it('delta X dominante (trackpad) fica com o navegador: eu não empurro', () => {
    expect(deslocDaRoda(3, 24)).toBe(0);
    expect(deslocDaRoda(0, 24)).toBe(0);
    expect(deslocDaRoda(-2, -24)).toBe(0);
  });

  it('roda antiga em linhas/páginas volta para pixels', () => {
    expect(deslocDaRoda(3, 0, 1)).toBe(48); // 3 linhas × 16 px
    expect(deslocDaRoda(1, 0, 2)).toBe(100); // 1 página × 100 px
  });

  it('sem movimento, nada muda (trilho-coluna não rola lateral)', () => {
    expect(deslocDaRoda(0, 0)).toBe(0);
  });
});
