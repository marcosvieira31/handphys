import { describe, expect, it } from 'vitest';
import { readCircuit, type CircuitDoc } from '../core/netlist';
import { CSV_HEAD, csvReport } from './report';

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
