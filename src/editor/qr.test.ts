import { describe, expect, it } from 'vitest';
import { makeQr, qrPath } from './qr';

/** Módulos escuros que o caminho SVG cobre, lidos de volta do atributo `d`. */
function darkFromPath(d: string): Set<string> {
  const out = new Set<string>();
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    const w = Number(m[3]);
    for (let i = 0; i < w; i++) out.add(`${x + i},${y}`);
  }
  return out;
}

const URL_DO_PROJETO =
  'https://marcosvieira31.github.io/handphys/editor.html?c=eyJ2IjoxLCJjIjpbWyJWIiw0LDMsMCw5XV19';

describe('QR do link (qr.ts)', () => {
  it('gera o QR e o caminho cobre EXATAMENTE os módulos escuros', () => {
    const q = makeQr(URL_DO_PROJETO);
    expect(q).not.toBeNull();
    const n = q!.getModuleCount();
    expect(n).toBeGreaterThan(20); // nem versão minúscula nem esquisita

    const esperado = new Set<string>();
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q!.isDark(r, c)) esperado.add(`${c},${r}`);
    expect(darkFromPath(qrPath(q!))).toEqual(esperado);
  });

  it('cai de nível de correção quando o link é grande, e recusa o impossível', () => {
    // 2000 bytes passam do que cabe em Q (1663) e cabem em M (2331)
    expect(makeQr('a'.repeat(2000))).not.toBeNull();
    // mais do que a capacidade máxima de qualquer nível (2953 em L)
    expect(makeQr('a'.repeat(4000))).toBeNull();
  });
});
