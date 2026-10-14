import { describe, expect, it } from 'vitest';
// `index.html` é página de ENTRADA do Vite: sem o link do CSS ela sai crua no
// build (não há script para injetar estilo) — este teste é o trava disso.
import html from '../../index.html?raw';

describe('landing (index.html)', () => {
  it('vem com o CSS de verdade ligado', () => {
    expect(html).toMatch(/<link[^>]+href="\/src\/styles\/spike\.css"[^>]*>/);
  });

  it('traz viewport de aparelho (sem ele, o celular renderiza em 980 px)', () => {
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1\.0"/);
  });

  it('aponta as páginas da sala (editor, espelho e cardboard)', () => {
    for (const href of ['editor.html', 'mirror.html', 'cardboard.html']) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});
