import { describe, expect, it } from 'vitest';
import { readCircuit, type CircuitDoc } from '../core/netlist';
import { CSV_HEAD, csvReport, jsonReport, type DesafioRel } from './report';

/** Fonte 9 V → chave → lâmpada 20 Ω, malha fechada (mesmo caso do netlist). */
const doc: CircuitDoc = {
  comps: [
    { id: 'bat1', kind: 'vsource', x: 4, y: 6, rot: 0, value: 9 },
    { id: 'sw1', kind: 'switch', x: 10, y: 6, rot: 0, value: 0, closed: true },
    { id: 'lamp1', kind: 'lamp', x: 16, y: 6, rot: 0, value: 20 },
  ],
  wires: [
    { id: 'w1', from: { x: 5, y: 6 }, to: { x: 9, y: 6 } },
    { id: 'w2', from: { x: 11, y: 6 }, to: { x: 15, y: 6 } },
    { id: 'w3', from: { x: 17, y: 6 }, to: { x: 20, y: 6 } },
    { id: 'w4', from: { x: 20, y: 6 }, to: { x: 20, y: 14 } },
    { id: 'w5', from: { x: 20, y: 14 }, to: { x: 3, y: 14 } },
    { id: 'w6', from: { x: 3, y: 14 }, to: { x: 3, y: 6 } },
  ],
};

const lines = (d: CircuitDoc) => csvReport(d, readCircuit(d)).split('\r\n').filter(Boolean);
const cols = (line: string) => line.split(';');

describe('relatório CSV (modo professor)', () => {
  it('cabeçalho com ; e uma linha por componente (12 colunas), fechada em CRLF', () => {
    const rows = lines(doc);
    expect(rows[0]).toBe(CSV_HEAD);
    expect(rows).toHaveLength(1 + doc.comps.length);
    expect(rows.slice(1).every((r) => cols(r).length === 12)).toBe(true);
    expect(csvReport(doc, readCircuit(doc)).endsWith('\r\n')).toBe(true);
  });

  it('lê o circuito: 9 V na lâmpada, I = 0,45 A, vírgula decimal', () => {
    const lamp = cols(lines(doc)[3]);
    expect(lamp.slice(0, 6)).toEqual(['lamp1', 'Lâmpada', '20', 'Ω', '16', '6']);
    expect(lamp[7]).toBe('—'); // só a chave tem estado
    expect(lamp[8]).toBe('9'); // tensão na lâmpada
    expect(lamp[9]).toBe('0,45'); // 9 V / 20 Ω
  });

  it('fonte entrega a corrente e está com um terminal em GND', () => {
    const bat = cols(lines(doc)[1]);
    expect(bat[1]).toBe('Fonte');
    expect(bat[2]).toBe('9');
    expect(bat[3]).toBe('V');
    expect(bat[9]).toBe('0,45');
    expect(bat.slice(10, 12)).toContain('GND');
  });

  it('chave: estado na coluna, sem valor, e os dois nós são o MESMO (curto)', () => {
    const sw = cols(lines(doc)[2]);
    expect(sw[1]).toBe('Chave');
    expect(sw[2]).toBe('—');
    expect(sw[3]).toBe('—');
    expect(sw[7]).toBe('fechada');
    expect(sw[10]).toBe(sw[11]); // terminais unidos = mesmo nó
  });

  it('chave aberta: estado aberta e a lâmpada sem corrente', () => {
    const aberto: CircuitDoc = {
      ...doc,
      comps: doc.comps.map((c) => (c.kind === 'switch' ? { ...c, closed: false } : c)),
    };
    const rows = lines(aberto);
    expect(cols(rows[2])[7]).toBe('aberta');
    expect(cols(rows[3])[9]).toBe('0');
  });

  it('capacitor converte a unidade como a etiqueta do símbolo (µF/mF)', () => {
    const c1 = lines({ comps: [{ id: 'c1', kind: 'capacitor', x: 4, y: 6, rot: 0, value: 1e-6 }], wires: [] });
    expect(cols(c1[1]).slice(2, 4)).toEqual(['1', 'µF']);
    const c2 = lines({ comps: [{ id: 'c2', kind: 'capacitor', x: 4, y: 6, rot: 0, value: 4.7e-3 }], wires: [] });
    expect(cols(c2[1]).slice(2, 4)).toEqual(['4,7', 'mF']);
  });

  it('documento vazio devolve só o cabeçalho', () => {
    expect(csvReport({ comps: [], wires: [] }, readCircuit({ comps: [], wires: [] }))).toBe(
      `${CSV_HEAD}\r\n`
    );
  });
});

/** Forma do relatório JSON (o que a automação escolar vai ler). */
type Rel = {
  schema: string;
  geradoEm: string;
  circuito: { componentes: { id: string }[]; fios: { id: string }[] };
  leituras: {
    id: string;
    componente: string;
    valor: number | null;
    unidade: string | null;
    estado: string | null;
    tensao_V: number | null;
    corrente_A: number | null;
    no_a: string | null;
    no_b: string | null;
  }[];
  nos: { no: string; tensao_V: number }[];
  desafio: DesafioRel | null;
  erros: { solver: string | null; diagnosticos: string[] };
};

const rel = (d: CircuitDoc, desafio: DesafioRel | null = null): Rel =>
  JSON.parse(jsonReport(d, readCircuit(d), desafio)) as Rel;
const achar = (r: Rel, id: string) => r.leituras.find((l) => l.id === id);

describe('relatório JSON (mesmo dado do CSV, forma de máquina)', () => {
  it('cabeçalho assinado, montagem CRU com fios e uma leitura por componente', () => {
    const r = rel(doc);
    expect(r.schema).toBe('handphys-relatorio-1');
    expect(typeof r.geradoEm).toBe('string');
    // o CSV perde os fios; o JSON guarda a montagem inteira (reconstrói o doc)
    expect(r.circuito.componentes).toHaveLength(doc.comps.length);
    expect(r.circuito.fios).toHaveLength(doc.wires.length);
    expect(r.leituras).toHaveLength(doc.comps.length);
  });

  it('números em SI e ponto decimal: 9 V e 0,45 A na lâmpada', () => {
    const lamp = achar(rel(doc), 'lamp1');
    expect(lamp).toMatchObject({
      componente: 'Lâmpada',
      valor: 20,
      unidade: 'Ω',
      tensao_V: 9,
      corrente_A: 0.45,
    });
    expect(lamp?.estado).toBeNull(); // só a chave tem estado
  });

  it('fonte em GND, chave com estado e os dois nós no mesmo nó (curto)', () => {
    const r = rel(doc);
    expect(r.nos[0]).toEqual({ no: 'GND', tensao_V: 0 }); // GND primeiro
    expect(achar(r, 'bat1')?.no_a === 'GND' || achar(r, 'bat1')?.no_b === 'GND').toBe(true);
    const sw = achar(r, 'sw1');
    expect(sw).toMatchObject({ estado: 'fechada', valor: null, unidade: null });
    expect(sw?.no_a).toBe(sw?.no_b);
  });

  it('chave aberta: a lâmpada sem corrente (mesma leitura da tela)', () => {
    const aberto: CircuitDoc = {
      ...doc,
      comps: doc.comps.map((c) => (c.kind === 'switch' ? { ...c, closed: false } : c)),
    };
    expect(achar(rel(aberto), 'lamp1')?.corrente_A).toBe(0);
    expect(achar(rel(aberto), 'sw1')?.estado).toBe('aberta');
  });

  it('capacitor em SI puro (F), sem prefixo de etiqueta', () => {
    const r = rel({ comps: [{ id: 'c1', kind: 'capacitor', x: 4, y: 6, rot: 0, value: 1e-6 }], wires: [] });
    expect(achar(r, 'c1')).toMatchObject({ valor: 1e-6, unidade: 'F' });
  });

  it('desafio registra o veredito; sem desafio, null', () => {
    const d: DesafioRel = { id: 'lampada', titulo: 'Acenda a lâmpada', ok: false, dica: 'Feche o circuito' };
    expect(rel(doc, d).desafio).toEqual(d);
    expect(rel(doc).desafio).toBeNull();
  });

  it('documento vazio: relatório válido, listas vazias e solver sem erro', () => {
    const r = rel({ comps: [], wires: [] });
    expect(r.leituras).toEqual([]);
    expect(r.nos).toEqual([]);
    expect(r.erros).toEqual({ solver: null, diagnosticos: [] });
  });
});
