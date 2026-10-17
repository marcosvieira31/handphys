import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CompKind } from './netlist';
import { KIND_HINT, KIND_LABEL } from './kinds';

const KINDS: CompKind[] = ['vsource', 'resistor', 'capacitor', 'lamp', 'switch', 'ground'];

/** Os arquivos que exibem nome de componente. Nenhum deles pode ter a tabela:
 *  o rótulo mora só em `core/kinds.ts` (antes eram cinco cópias). */
const QUEM_MOSTRA: [string, URL][] = [
  ['Inspector', new URL('../editor/Inspector.tsx', import.meta.url)],
  ['Kirchhoff', new URL('../editor/Kirchhoff.tsx', import.meta.url)],
  ['relatório', new URL('../editor/report.ts', import.meta.url)],
  ['trilhos', new URL('../editor/Rails.tsx', import.meta.url)],
  ['espelho', new URL('../mirror/Espelho.tsx', import.meta.url)],
  ['cardboard', new URL('../cardboard/main.ts', import.meta.url)],
];

const fonte = (u: URL) => readFileSync(u, 'utf8');

describe('nomes e explicações das peças — uma fonte só', () => {
  it('toda peça tem nome e explicação, e não sobra chave', () => {
    expect(Object.keys(KIND_LABEL).sort()).toEqual([...KINDS].sort());
    expect(Object.keys(KIND_HINT).sort()).toEqual([...KINDS].sort());
  });

  it('os nomes são únicos (dois rótulos iguais confundiriam a tabela)', () => {
    const nomes = KINDS.map((k) => KIND_LABEL[k]);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const n of nomes) expect(n.trim()).toBe(n);
  });

  it('a explicação é UMA linha curta, minúscula, dizendo o que a peça FAZ', () => {
    for (const k of KINDS) {
      const h = KIND_HINT[k];
      expect(h.length, k).toBeGreaterThan(10);
      expect(h.length, k).toBeLessThanOrEqual(70);
      expect(h, k).not.toContain('\n');
      expect(h[0], k).toBe(h[0].toLowerCase());
      expect(h.trim(), k).toBe(h);
    }
  });

  it('ninguém redeclara a tabela: todos importam de core/kinds', () => {
    for (const [quem, url] of QUEM_MOSTRA) {
      const src = fonte(url);
      expect(src, `${quem} redeclarou KIND_LABEL`).not.toMatch(/const KIND_LABEL/);
      expect(src, `${quem} deveria importar de core/kinds`).toMatch(/from '.*kinds'/);
    }
  });
});
