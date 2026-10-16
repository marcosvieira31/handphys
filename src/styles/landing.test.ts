import { describe, expect, it } from 'vitest';
// handphys é UM app: a raiz (index.html) é o SHELL que monta as telas pelo
// hash; as páginas antigas viraram redirect (o QR da sala continua entrando);
// o cardboard mantém página própria de propósito; e os spikes saíram do
// produto para a estante de desenvolvimento.
import shell from '../../index.html?raw';
import editor from '../../editor.html?raw';
import espelho from '../../mirror.html?raw';
import cardboard from '../../cardboard.html?raw';
import estante from '../../spikes/index.html?raw';

describe('entrada do app (index.html)', () => {
  it('é o shell: #root + o módulo do shell (nada de menu de links)', () => {
    expect(shell).toContain('<div id="root"></div>');
    expect(shell).toMatch(/<script type="module" src="\/src\/main\.tsx">/);
    // o menu antigo de 5 opções morreu: nenhuma página aponta para as outras
    expect(shell).not.toContain('mirror.html');
    expect(shell).not.toContain('editor.html');
  });

  it('traz viewport de aparelho (sem ele, o celular renderiza em 980 px)', () => {
    expect(shell).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1\.0"/);
  });

  it('avisa quem chegar sem JavaScript (o shell não monta nada sozinho)', () => {
    expect(shell).toContain('<noscript>');
  });
});

describe('páginas da sala (redirecionamentos do app)', () => {
  it('editor.html leva para a raiz preservando o ?c= dos QRs antigos', () => {
    expect(editor).toContain("location.replace('./' + location.search)");
    expect(editor).not.toContain('script type="module"'); // é só o redirect
  });

  it('mirror.html leva para a rota do espelho, ?c= e ?sala= intactos', () => {
    expect(espelho).toContain("location.replace('./' + location.search + '#/espelho')");
    expect(espelho).not.toContain('script type="module"');
  });

  it('cardboard.html continua sendo o app vanilla com o alarme de rede', () => {
    expect(cardboard).toContain('<script type="module" src="/src/cardboard/main.ts">');
    expect(cardboard).toContain('__cbReady'); // o alarme clássico do gate
  });
});

describe('estante de spikes (spikes/index.html)', () => {
  it('é página estática com CSS ligado (sem <link>, ela sai crua no build)', () => {
    expect(estante).toMatch(/<link[^>]+href="\/src\/styles\/spike\.css"[^>]*>/);
  });

  it('lista os dois spikes e volta para a bancada', () => {
    expect(estante).toContain('href="hands.html"');
    expect(estante).toContain('href="cardboard.html"');
    expect(estante).toContain('href="../"');
  });
});
