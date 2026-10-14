import { describe, expect, it } from 'vitest';
import {
  EMPTY_DOC,
  readCircuit,
  type CircuitDoc,
  type Placed,
  type Wire,
} from '../core/netlist';
import { EXAMPLES } from './examples';
import { CHALLENGES, challengeById, evaluateChallenge } from './challenges';

const avalia = (id: string, doc: CircuitDoc) => {
  const ch = challengeById(id);
  expect(ch, `desafio "${id}" tem de existir`).not.toBeNull();
  return evaluateChallenge(ch!, doc, readCircuit(doc));
};
const ok = (id: string, doc: CircuitDoc) => avalia(id, doc).ok;
const dica = (id: string, doc: CircuitDoc) => avalia(id, doc).dica;

/** Mesmo desenho dos exemplos: fonte → carga → volta por baixo, tudo em retas. */
const LOOP = (y: number): Wire[] => [
  { id: 'w1', from: { x: 5, y }, to: { x: 9, y } },
  { id: 'w2', from: { x: 11, y }, to: { x: 14, y } },
  { id: 'w3', from: { x: 14, y }, to: { x: 14, y: y + 5 } },
  { id: 'w4', from: { x: 14, y: y + 5 }, to: { x: 2, y: y + 5 } },
  { id: 'w5', from: { x: 2, y: y + 5 }, to: { x: 2, y } },
  { id: 'w6', from: { x: 2, y }, to: { x: 3, y } },
];

const fonte9v: Placed = { id: 'bat1', kind: 'vsource', x: 4, y: 3, rot: 0, value: 9 };

/** Fonte + lâmpada de 20 Ω no laço: 9 V ⇒ 4,5 W, muito acima do nominal de 1 W. */
const COM_LAMPADA: CircuitDoc = {
  comps: [fonte9v, { id: 'lamp1', kind: 'lamp', x: 10, y: 3, rot: 0, value: 20 }],
  wires: LOOP(3),
};

/** Três de 100 Ω em cadeia: 30 mA atravessando os três, pares de nós distintos. */
const COM_SERIE: CircuitDoc = {
  comps: [
    fonte9v,
    { id: 'r1', kind: 'resistor', x: 10, y: 3, rot: 0, value: 100 },
    { id: 'r2', kind: 'resistor', x: 14, y: 3, rot: 0, value: 100 },
    { id: 'r3', kind: 'resistor', x: 18, y: 3, rot: 0, value: 100 },
  ],
  wires: [
    { id: 'w1', from: { x: 5, y: 3 }, to: { x: 9, y: 3 } },
    { id: 'w2', from: { x: 11, y: 3 }, to: { x: 13, y: 3 } },
    { id: 'w3', from: { x: 15, y: 3 }, to: { x: 17, y: 3 } },
    { id: 'w4', from: { x: 19, y: 3 }, to: { x: 22, y: 3 } },
    { id: 'w5', from: { x: 22, y: 3 }, to: { x: 22, y: 8 } },
    { id: 'w6', from: { x: 22, y: 8 }, to: { x: 2, y: 8 } },
    { id: 'w7', from: { x: 2, y: 8 }, to: { x: 2, y: 3 } },
    { id: 'w8', from: { x: 2, y: 3 }, to: { x: 3, y: 3 } },
  ],
};

/**
 * Chave em série com um resistor (sem resistor, fechar a chave é um curto de
 * 9 V). A chave não é componente do solver: fechada vira união de nós.
 */
const comChave = (closed: boolean): CircuitDoc => ({
  comps: [
    fonte9v,
    { id: 'sw1', kind: 'switch', x: 10, y: 3, rot: 0, value: 0, closed },
    { id: 'r1', kind: 'resistor', x: 14, y: 3, rot: 0, value: 100 },
  ],
  wires: [
    { id: 'w1', from: { x: 5, y: 3 }, to: { x: 9, y: 3 } },
    { id: 'w2', from: { x: 11, y: 3 }, to: { x: 13, y: 3 } },
    { id: 'w3', from: { x: 15, y: 3 }, to: { x: 18, y: 3 } },
    { id: 'w4', from: { x: 18, y: 3 }, to: { x: 18, y: 8 } },
    { id: 'w5', from: { x: 18, y: 8 }, to: { x: 2, y: 8 } },
    { id: 'w6', from: { x: 2, y: 8 }, to: { x: 2, y: 3 } },
    { id: 'w7', from: { x: 2, y: 3 }, to: { x: 3, y: 3 } },
  ],
});

describe('desafios com verificação automática', () => {
  it('lista fechada: seis tarefas, id único, id desconhecido vira null', () => {
    expect(CHALLENGES.map((c) => c.id)).toEqual([
      'lampada',
      'lei-de-ohm',
      'divisor',
      'paralelo',
      'serie',
      'juncao',
      'malha',
      'chave',
    ]);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    expect(challengeById('nada-assim')).toBeNull();
    expect(challengeById(null)).toBeNull();
    for (const c of CHALLENGES) expect(c.enunciado.length, c.id).toBeGreaterThan(10);
  });

  it('nunca aprova o quadro vazio: sempre devolve uma dica acionável', () => {
    for (const c of CHALLENGES) {
      const r = evaluateChallenge(c, EMPTY_DOC, readCircuit(EMPTY_DOC));
      expect(r.ok, c.id).toBe(false);
      expect((r.dica ?? '').length, c.id).toBeGreaterThan(8);
    }
  });

  it('Lei de Ohm: o exemplo de 9 V/100 Ω aprova; 45 mA explica a conta', () => {
    expect(dica('lei-de-ohm', EXAMPLES[0].doc)).toBeNull();
    // Divisor: mesmo resistor de 100 Ω, mas só 45 mA — a dica traz o número
    expect(dica('lei-de-ohm', EXAMPLES[1].doc)).toContain('45 mA');
    expect(ok('lei-de-ohm', EXAMPLES[1].doc)).toBe(false);
    // o Paralelo também passa — e é a verdade: cada 100 Ω ali vê os 9 V inteiros
    expect(ok('lei-de-ohm', EXAMPLES[2].doc)).toBe(true);
  });

  it('Divisor: o nó do meio do exemplo é 4,50 V e aprova', () => {
    expect(ok('divisor', EXAMPLES[1].doc)).toBe(true);
    // no Paralelo só existem 9 V e 0 V — a dica diz quanto tem de verdade
    expect(dica('divisor', EXAMPLES[2].doc)).toContain('9,00 V');
    expect(ok('divisor', EXAMPLES[2].doc)).toBe(false);
  });

  it('Paralelo: três no mesmo par de nós aprova; o exemplo de série não tem 3', () => {
    expect(ok('paralelo', EXAMPLES[2].doc)).toBe(true);
    expect(dica('paralelo', EXAMPLES[1].doc)).toContain('2 resistores');
    expect(ok('paralelo', COM_SERIE)).toBe(false); // três, mas em três pares
  });

  it('Série: mesma corrente nos três; o Paralelo é reprovado por ser paralelo', () => {
    expect(ok('serie', COM_SERIE)).toBe(true);
    expect(dica('serie', EXAMPLES[2].doc)).toContain('paralelo');
    expect(ok('serie', EXAMPLES[2].doc)).toBe(false);
    expect(dica('serie', EXAMPLES[1].doc)).toContain('2 resistores');
  });

  it('Série com um resistor girado 180° aprova (o sinal não quebra o desafio)', () => {
    const girado: CircuitDoc = {
      ...COM_SERIE,
      comps: COM_SERIE.comps.map((c) => (c.id === 'r2' ? { ...c, rot: 180 as const } : c)),
    };
    const r2 = readCircuit(girado).comps.find((c) => c.id === 'r2');
    expect(r2!.amps).toBeLessThan(0); // leitura negativa: terminal a→b inverteu
    expect(ok('serie', girado)).toBe(true);
  });

  it('Nó de Kirchhoff: o Paralelo é junção de 4 ramos; a série só tem nós de 2', () => {
    expect(ok('juncao', EXAMPLES[2].doc)).toBe(true);
    expect(ok('juncao', COM_SERIE)).toBe(false);
    expect(dica('juncao', COM_SERIE)).toBe(
      'O nó mais cheio tem 2 ramos — a 1ª lei de Kirchhoff quer um nó com 3 ramos.',
    );
    expect(ok('juncao', EXAMPLES[0].doc)).toBe(false);
  });

  it('Malha de três: o Divisor aprova (3 elementos); laço de 2 reprova', () => {
    expect(ok('malha', EXAMPLES[1].doc)).toBe(true); // fonte + r1 + r2
    expect(ok('malha', EXAMPLES[0].doc)).toBe(false); // lei de ohm: fonte + r1
    expect(dica('malha', EXAMPLES[0].doc)).toBe(
      'Sua volta maior tem 2 elementos — a 2ª lei quer 3: fonte + dois no mesmo laço.',
    );
    expect(ok('malha', EXAMPLES[2].doc)).toBe(false); // paralelo: toda volta tem 2
    expect(dica('malha', { comps: [], wires: [] })).toContain('laço fechado');
    expect(dica('malha', { comps: [{ id: 'r1', kind: 'resistor', x: 4, y: 3, rot: 0, value: 100 }], wires: [] })).toContain(
      'Sem laço fechado',
    );
  });

  it('Lâmpada: acesa aprova; a lei de Ohm diz que falta a lâmpada', () => {
    expect(ok('lampada', COM_LAMPADA)).toBe(true);
    expect(dica('lampada', EXAMPLES[0].doc)).toContain('lâmpada');
    expect(ok('lampada', EXAMPLES[0].doc)).toBe(false);
  });

  it('Chave: aberta dá a instrução de clicar; fechada com corrente aprova', () => {
    const aberta = dica('chave', comChave(false));
    expect(aberta).toContain('ABERTA');
    expect(ok('chave', comChave(false))).toBe(false);
    expect(ok('chave', comChave(true))).toBe(true);
    expect(dica('chave', EXAMPLES[0].doc)).toContain('chave');
  });

  it('avaliação é pura: mesma bancada, mesmo veredito, sem efeito colateral', () => {
    const doc = EXAMPLES[1].doc;
    const antes = JSON.stringify(doc);
    const a = avalia('divisor', doc);
    const b = avalia('divisor', doc);
    expect(a).toEqual(b);
    expect(JSON.stringify(doc)).toBe(antes);
  });
});
