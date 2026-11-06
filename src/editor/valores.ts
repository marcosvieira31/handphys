import type { CompKind } from '../core/netlist';

/**
 * VALORES DAS PEÇAS em letra de gente.
 *
 * O campo de valor era um `<input type="number">` na unidade SI crua: o
 * capacitor de 1 µF aparecia como `0.000001` e, para pôr 4,7 kΩ, o aluno tinha
 * de digitar `4700`. Aqui mora o caminho de ida e volta com os prefixos que o
 * livro e a etiqueta da peça usam (`4,7k`, `100µ`, `1,5`), e os valores comuns
 * de bancada para escolher com um toque — ou uma pinça. Módulo puro: testável
 * sem React.
 */

/** A unidade de cada peça (vazia = a peça não tem valor para editar). */
export const UNIDADE: Record<CompKind, string> = {
  vsource: 'V',
  resistor: 'Ω',
  lamp: 'Ω',
  capacitor: 'F',
  switch: '',
  ground: '',
};

/**
 * Valores de prateleira — o que existe na caixa de componentes da escola.
 * Resistor na série E6 (a mais comum no kit), fonte nas pilhas/baterias de
 * verdade, capacitor do cerâmico ao eletrolítico grande (τ de ms a segundos).
 */
export const PRESETS: Record<CompKind, number[]> = {
  vsource: [1.5, 3, 4.5, 6, 9, 12],
  resistor: [10, 22, 47, 100, 220, 470, 1000, 4700, 10000],
  lamp: [10, 20, 50, 100],
  capacitor: [1e-6, 10e-6, 100e-6, 470e-6, 1e-3],
  switch: [],
  ground: [],
};

const PREFIXO: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  'µ': 1e-6, // micro (U+00B5)
  'μ': 1e-6, // mu grego (U+03BC) — o teclado do celular manda este
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
};

/**
 * Lê o que o aluno digitou: `4,7k`, `4.7 kΩ`, `4k7` (o código da etiqueta),
 * `100µ`, `100 uF`, `1,5 V`, `220`. Devolve o valor em SI, ou `null` quando
 * não é um número positivo — valor zero ou negativo não é peça de bancada (o
 * resistor de 0 Ω é um fio; a fonte de −9 V é a mesma fonte girada).
 */
export function lerValor(texto: string): number | null {
  let s = texto.trim().replace(/\s+/g, '');
  // a unidade é opcional e sai antes do prefixo ("kΩ" → "k", "uF" → "u")
  s = s.replace(/ohms?$/i, '').replace(/[ΩVF]$/, '');
  if (!s) return null;
  // código de etiqueta: o prefixo no lugar da vírgula (4k7 = 4,7k; 2M2 = 2,2M)
  const cod = /^(\d+)([pnuµμmkKM])(\d+)$/.exec(s);
  if (cod) s = `${cod[1]}.${cod[3]}${cod[2]}`;
  const m = /^(\d+(?:[.,]\d*)?|[.,]\d+)([pnuµμmkKM]?)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.')) * (m[2] ? PREFIXO[m[2]] : 1);
  if (!Number.isFinite(n) || n <= 0) return null;
  // tira a poeira do float (4.7 * 1000 = 4700.000000000001)
  return Number(n.toPrecision(12));
}

/** Vírgula decimal, sem zeros sobrando: 4.7 → "4,7", 1 → "1". */
const br = (v: number) => String(Number(v.toPrecision(4))).replace('.', ',');

/**
 * O valor no formato que o campo mostra para editar — o MESMO formato que
 * `lerValor` entende, com o prefixo que deixa o número entre 1 e 999:
 * 4700 → "4,7k", 1e-6 → "1µ", 9 → "9".
 */
export function textoValor(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '0';
  const passos: [number, string][] = [
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
  ];
  for (const [f, p] of passos) if (v >= f * 0.9995) return br(v / f) + p;
  return br(v / 1e-12) + 'p';
}
