import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Regressão do portão: o botão do circuito CARREGADO (.active-example) era
 * texto azul sobre o MESMO azul do fundo — o primeiro item do portão saía
 * "vazio" (medido em produção: color === backgroundColor === #58a6ff).
 *
 * Lê o CSS por fs (não `?raw`: o vitest intercepta import de `.css` e o raw
 * volta vazio).
 */
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const bloco = (seletor: string): string => {
  const m = new RegExp(`${seletor}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[1] : '';
};

const prop = (regra: string, nome: string): string | null =>
  new RegExp(`(?:^|;)\\s*${nome}:\\s*([^;]+)`).exec(regra)?.[1]?.trim() ?? null;

describe('portão do cardboard — botão do circuito carregado', () => {
  it('tem a regra .active-example (sem ela, o "carregado" não se destaca)', () => {
    expect(bloco('button\\.active-example')).not.toBe('');
  });

  it('o texto visível: cor difere do fundo (próprio ou do button base)', () => {
    const ativo = bloco('button\\.active-example');
    const cor = prop(ativo, 'color');
    const fundo = prop(ativo, 'background') ?? prop(bloco('button'), 'background');
    expect(cor).toBeTruthy();
    expect(fundo).toBeTruthy();
    // o bug era exatamente isto: cor e fundo iguais (azul sobre azul)
    expect(cor).not.toBe(fundo);
  });
});
