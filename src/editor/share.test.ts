import { describe, expect, it } from 'vitest';
import type { CircuitDoc } from '../core/netlist';
import { EXAMPLES } from './examples';
import { appBase, decodeDoc, encodeDoc, shareLinks, sharePayload, shareUrl } from './share';

/** JSON -> base64url (o mesmo formato que o link carrega, para montar casos). */
function enc(obj: unknown): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const round = (doc: CircuitDoc) => decodeDoc(encodeDoc(doc));

describe('circuito no link (share por URL)', () => {
  it('sobe e desce sem mudar nada dos exemplos (ids inclusive)', () => {
    for (const ex of EXAMPLES) expect(round(ex.doc)).toEqual(ex.doc);
  });

  it('preserva valor, giro, aux da lâmpada e chave fechada', () => {
    const doc: CircuitDoc = {
      comps: [
        { id: 'zz1', kind: 'lamp', x: 12, y: 10, rot: 90, value: 36, aux: 6 },
        { id: 'zz2', kind: 'switch', x: 5, y: 5, rot: 270, value: 0, closed: true },
        { id: 'zz3', kind: 'capacitor', x: 0, y: 0, rot: 0, value: 1e-6 },
        { id: 'zz4', kind: 'ground', x: 29, y: 29, rot: 180, value: 0 },
      ],
      wires: [{ id: 'z9', from: { x: 0, y: 0 }, to: { x: 29, y: 29 } }],
    };
    expect(round(doc)).toEqual({
      comps: [
        { id: 'lamp1', kind: 'lamp', x: 12, y: 10, rot: 90, value: 36, aux: 6 },
        { id: 'sw1', kind: 'switch', x: 5, y: 5, rot: 270, value: 0, closed: true },
        { id: 'c1', kind: 'capacitor', x: 0, y: 0, rot: 0, value: 1e-6 },
        { id: 'gnd1', kind: 'ground', x: 29, y: 29, rot: 180, value: 0 },
      ],
      wires: [{ id: 'w1', from: { x: 0, y: 0 }, to: { x: 29, y: 29 } }],
    });
  });

  it('link curto o bastante para caber num QR e sem cara de URL suja', () => {
    const url = shareUrl(EXAMPLES[2].doc, 'https://marcosvieira31.github.io/handphys/');
    expect(url).toContain('?c=');
    expect(url.length).toBeLessThan(900);
    // base64url: nunca +, / ou = (quebrariam o link ao ser colado no chat)
    expect(sharePayload(url)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('lê o payload da query', () => {
    expect(sharePayload('?v=13&c=abc-DEF_123')).toBe('abc-DEF_123');
    expect(sharePayload('?v=13')).toBeNull();
    expect(sharePayload('')).toBeNull();
    expect(sharePayload('?c=')).toBeNull();
  });

  it('os três destinos do app levam o MESMO circuito', () => {
    const links = shareLinks(EXAMPLES[2].doc, 'https://x.io/handphys/');
    expect(links.bancada).toMatch(/^https:\/\/x\.io\/handphys\/\?c=/);
    expect(links.espelho).toBe(`${links.bancada}#/espelho`);
    // o cardboard é página própria (vanilla + alarme de rede lenta)
    expect(links.cardboard).toBe(
      `https://x.io/handphys/cardboard.html?c=${sharePayload(links.bancada)}`,
    );
    for (const u of Object.values(links)) {
      expect(sharePayload(u)).toBe(sharePayload(links.bancada));
    }
  });

  it('a base ganha barra final (o pathname pode vir sem ela)', () => {
    const links = shareLinks(EXAMPLES[0].doc, 'https://x.io/handphys');
    expect(links.bancada).toContain('/handphys/?c=');
    expect(links.espelho).toContain('/handphys/?c=');
    expect(links.cardboard).toContain('/handphys/cardboard.html?c=');
  });

  it('sem janela (node) a base do app é vazia — nada de URL inventada', () => {
    expect(appBase()).toBe('');
  });

  it('link podre devolve null, nunca lança para a tela', () => {
    expect(decodeDoc('')).toBeNull();
    expect(decodeDoc('!!!!')).toBeNull();
    expect(decodeDoc(btoa('não é o formato'))).toBeNull();
    expect(decodeDoc(enc({ v: 99, c: [], w: [] }))).toBeNull(); // versão alheia
    expect(decodeDoc(enc('uma string'))).toBeNull();
    expect(decodeDoc(enc({ v: 1 }))).toBeNull(); // sem c/w
  });

  it('recusa o que não pode entrar num circuito', () => {
    expect(decodeDoc(enc({ v: 1, c: 'nope', w: [] }))).toBeNull();
    expect(decodeDoc(enc({ v: 1, c: [['X', 1, 1, 0, 10]], w: [] }))).toBeNull(); // tipo?
    expect(decodeDoc(enc({ v: 1, c: [['R', 1, 1, 5, 10]], w: [] }))).toBeNull(); // giro 5
    expect(decodeDoc(enc({ v: 1, c: [['R', 1, 1, 0, -5]], w: [] }))).toBeNull(); // negativo
    expect(decodeDoc(enc({ v: 1, c: [['R', 1.5, 1, 0, 10]], w: [] }))).toBeNull(); // x fracionário
    expect(decodeDoc(enc({ v: 1, c: [], w: [[0, 0, 30, 0]] }))).toBeNull(); // célula 30
    expect(decodeDoc(enc({ v: 1, c: [], w: [[1, 1, 2]] }))).toBeNull(); // fio curto
    expect(
      decodeDoc(enc({ v: 1, c: Array.from({ length: 201 }, () => ['R', 1, 1, 0, 10]), w: [] })),
    ).toBeNull(); // exagero de tamanho
  });

  it('bordoas aceitáveis: formato certo, extremos do quadro', () => {
    expect(decodeDoc(enc({ v: 1, c: [], w: [[1, 1, 2, 2]] }))).toEqual({
      comps: [],
      wires: [{ id: 'w1', from: { x: 1, y: 1 }, to: { x: 2, y: 2 } }],
    });
    const one = decodeDoc(enc({ v: 1, c: [['R', 29, 0, 3, 1e12]], w: [] }));
    expect(one?.comps[0]).toMatchObject({ kind: 'resistor', x: 29, y: 0, rot: 270, value: 1e12 });
  });

  it('tipo que nem existe não corrompe o link inteiro', () => {
    const doc = {
      comps: [
        { id: 'a', kind: 'wtf', x: 1, y: 1, rot: 0, value: 1 },
        { id: 'b', kind: 'resistor', x: 2, y: 2, rot: 0, value: 10 },
      ],
      wires: [],
    } as unknown as CircuitDoc;
    expect(decodeDoc(encodeDoc(doc))).toEqual({
      comps: [{ id: 'r1', kind: 'resistor', x: 2, y: 2, rot: 0, value: 10 }],
      wires: [],
    });
  });
});
