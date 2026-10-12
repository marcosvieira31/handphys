import { describe, expect, it } from 'vitest';
import { SideVote, sideOfLabel } from './side';

describe('qual é a mão de verdade (SideVote)', () => {
  it('uma amostra só já responde', () => {
    const v = new SideVote();
    expect(v.add('H1', 'Right')).toBe('right');
    expect(v.add('H2', 'Left')).toBe('left');
    expect(v.of('H3')).toBeNull();
  });

  it('rótulo oscilando não muda o lado (voto majoritário)', () => {
    const v = new SideVote();
    for (const l of ['Right', 'Right', 'Left', 'Right', 'Left', 'Right']) v.add('H1', l);
    expect(v.of('H1')).toBe('right');
    // e inverte quando a maioria inverte (mão virada de verdade)
    for (let i = 0; i < 10; i++) v.add('H1', 'Left');
    expect(v.of('H1')).toBe('left');
  });

  it('no empate vale o mais recente (mão que acabou de virar)', () => {
    const v = new SideVote();
    v.add('H1', 'Right');
    v.add('H1', 'Left');
    expect(v.of('H1')).toBe('left');
  });

  it('a janela é finita: o passado sai e o lado acompanha', () => {
    const v = new SideVote();
    for (let i = 0; i < 20; i++) v.add('H1', 'Right');
    for (let i = 0; i < 21; i++) v.add('H1', 'Left'); // passou da janela
    expect(v.of('H1')).toBe('left');
  });

  it('esquece mão que sumiu e limpa tudo', () => {
    const v = new SideVote();
    v.add('H1', 'Right');
    v.forget('H1');
    expect(v.of('H1')).toBeNull();
    v.add('H2', 'Left');
    v.clear();
    expect(v.of('H2')).toBeNull();
  });

  it('entende o que o classificador escreve', () => {
    expect(sideOfLabel('Left')).toBe('left');
    expect(sideOfLabel('Right')).toBe('right');
    expect(sideOfLabel('left')).toBe('left');
  });
});
