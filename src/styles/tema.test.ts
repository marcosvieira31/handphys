import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * O TEMA TEM DE SER UM CONJUNTO FECHADO.
 *
 * O app inteiro pinta por tokens (`var(--painel)` etc.), e a paleta clara é a
 * MESMA lista de nomes trocada pelo botão. Se um token nascer só no escuro, o
 * tema claro mostra buraco ou herda lixo; se um `var()` tiver o nome torto, a
 * cor some em silêncio. Este teste lê o CSS como TEXTO (o vitest intercepta
 * import de `.css` e devolve vazio, então é fs) e cobra três coisas:
 *
 *   1. todo `var(--x)` usado no projeto está declarado;
 *   2. toda cor do escuro também existe no claro, e nenhuma paleta se
 *      referencia a si mesma (`--x: var(--x)` pinta nada);
 *   3. o texto tem contraste de leitura (WCAG AA, 4.5:1) nas duas paletas —
 *      é o que impede um tema novo de nascer bonito e ilegível.
 */

const ARQUIVOS = ['editor.css', 'sala.css', '../mirror/espelho.css'].map((n) =>
  readFileSync(new URL(n, import.meta.url), 'utf8'),
);
const editor = ARQUIVOS[0];

/** O corpo de um bloco `seletor { … }` (o CSS do projeto é plano). */
function bloco(seletor: string, texto = editor): string {
  const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`${esc}\\s*\\{([^}]*)\\}`).exec(texto);
  return m ? m[1] : '';
}

/** `--nome: valor` de um bloco, na ordem em que aparecem (comentários fora). */
function tokens(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const limpo = texto.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const parte of limpo.split(';')) {
    const kv = /^\s*(--[a-z0-9-]+)\s*:\s*(.+?)\s*$/.exec(parte);
    if (kv) mapa.set(kv[1], kv[2]);
  }
  return mapa;
}

const ESCURO = tokens(bloco(':root'));
const CLARO = tokens(bloco("[data-theme='claro']"));

/** Cores declaradas em hex (#rrggbb) — as que dá para medir contraste. */
const ehCorSólida = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Luminância relativa (WCAG 2.x). */
function luz(hex: string): number {
  const canais = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

/** Razão de contraste entre duas cores opacas. */
function contraste(a: string, b: string): number {
  const [l1, l2] = [luz(a), luz(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Os pares que o app realmente usa: (texto, superfície, onde aparece). */
const PARES: [string, string, string][] = [
  ['ink', 'bg', 'texto sobre o fundo da página'],
  ['ink', 'panel', 'texto sobre o painel'],
  ['ink', 'card', 'texto dentro do cartão'],
  ['ink', 'sunken', 'texto dentro do poço (quadro)'],
  ['dim', 'panel', 'texto de apoio no painel'],
  ['dim', 'card', 'texto de apoio no cartão'],
  ['dim', 'sunken', 'texto de apoio no poço'],
  ['accent', 'panel', 'link e ação'],
  ['accent', 'card', 'selo e ícone de título'],
  ['ok', 'card', 'veredito aprovado'],
  ['err', 'card', 'aviso de erro'],
  ['hot', 'card', 'questão da aula / aviso'],
  ['on-accent', 'accent', 'texto em cima do botão de acento'],
];

describe('tokens do tema — o conjunto fechado', () => {
  it('o escuro declara a paleta inteira (nada de cor sem nome)', () => {
    expect(ESCURO.size).toBeGreaterThanOrEqual(25);
    for (const nome of ['bg', 'panel', 'card', 'sunken', 'raise', 'line', 'ink', 'dim', 'accent']) {
      expect(ESCURO.has(`--${nome}`), `--${nome}`).toBe(true);
    }
  });

  it('todo `var(--x)` usado no projeto está declarado (nome torto não pinta)', () => {
    const usados = new Set<string>();
    for (const css of ARQUIVOS) {
      for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) usados.add(m[1]);
    }
    expect(usados.size).toBeGreaterThan(20);
    for (const nome of usados) {
      expect(ESCURO.has(nome), `${nome} é usado mas não existe`).toBe(true);
    }
  });

  it('nenhuma paleta se referencia a si mesma (var apontando para si = nada pintado)', () => {
    for (const [nome, valor] of [...ESCURO, ...CLARO]) {
      expect(valor, `${nome} aponta para si mesmo`).not.toContain('var(');
    }
  });

  it('o claro traz TODAS as cores do escuro (token novo nasce nos dois temas)', () => {
    const coresEscuro = [...ESCURO].filter(([, v]) => ehCorSólida(v) || v.startsWith('rgb'));
    expect(coresEscuro.length).toBeGreaterThan(15);
    for (const [nome, valor] of coresEscuro) {
      const claro = CLARO.get(nome);
      expect(claro, `--${nome} (${valor}) só existe no escuro`).toBeTruthy();
      expect(claro, `--${nome} no claro não é cor: ${claro}`).toMatch(/^#|^rgb/);
    }
  });

  it('o claro NÃO repete valor do escuro: cada cor foi escolhida para o fundo novo', () => {
    // `--on-accent` é a exceção legítima: nos dois temas é o texto que fica em
    // cima do acento… e lá o acento é claro, então o texto é escuro. Se algum
    // dia alguém trocar o acento do claro por um escuro, este teste avisa.
    const iguais = [...ESCURO]
      .filter(([, v]) => ehCorSólida(v) || v.startsWith('rgb'))
      .filter(([k, v]) => CLARO.get(k) === v)
      .map(([k]) => k);
    expect(iguais).toEqual([]);
  });

  it('o preto e o branco puros só aparecem onde têm de aparecer', () => {
    // QR (branco puro, é o alvo da câmera) e as superfícies claras do tema
    // claro: o painel branco, o papel do quadro (`--sunken`) e o texto em cima
    // do acento. Fora disso, nada de #fff/#000 — cor pura é escolha, não sobra.
    expect(bloco('.share-qr')).toMatch(/background:\s*#fff/);
    const coresAltas = [...CLARO].filter(([, v]) => /^#(fff|ffffff|000|000000)$/i.test(v));
    expect(coresAltas.map(([k]) => k).sort()).toEqual(['--on-accent', '--panel', '--sunken']);
  });
});

describe('tokens do tema — contraste de leitura (WCAG AA)', () => {
  for (const [tema, paleta] of [
    ['escuro', ESCURO],
    ['claro', CLARO],
  ] as const) {
    it(`no tema ${tema}, todo par de texto passa de 4.5:1`, () => {
      const linhas: string[] = [];
      for (const [texto, fundo, onde] of PARES) {
        const a = paleta.get(`--${texto}`);
        const b = paleta.get(`--${fundo}`);
        expect(a && b, `--${texto} ou --${fundo} faltando`).toBeTruthy();
        const r = contraste(a!, b!);
        linhas.push(`${onde}: ${a} sobre ${b} = ${r.toFixed(2)}:1`);
        expect(r, linhas[linhas.length - 1]).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
