import { describe, expect, it, vi } from 'vitest';
import { boardHitAt, domHitAt, DwellActivator, labelOf, type DwellActApi } from './dwellAct';
import type { CircuitDoc } from '../core/netlist';

const doc: CircuitDoc = {
  comps: [
    { id: 'bat1', kind: 'vsource', x: 4, y: 10, rot: 0, value: 9 }, // terminais (3,10) e (5,10)
    { id: 'lamp1', kind: 'lamp', x: 12, y: 10, rot: 0, value: 20 }, // terminais (11,10) e (13,10)
  ],
  wires: [{ id: 'w1', from: { x: 5, y: 10 }, to: { x: 11, y: 10 } }],
};

describe('alvo da mira (boardHitAt)', () => {
  it('terminal tem prioridade (com imã)', () => {
    expect(boardHitAt(doc, { x: 5, y: 10 })).toMatchObject({ kind: 'term', refId: 'bat1', terminal: 1 });
    expect(boardHitAt(doc, { x: 11, y: 10 })).toMatchObject({ kind: 'term', refId: 'lamp1', terminal: 0 });
    // com célula fracionária (a mira devolve inteiros, mas o imã tolera desvio)
    expect(boardHitAt(doc, { x: 10.6, y: 10.3 })).toMatchObject({ kind: 'term', refId: 'lamp1', terminal: 0 });
  });

  it('corpo do componente quando não é terminal', () => {
    expect(boardHitAt(doc, { x: 4, y: 10 })).toMatchObject({ kind: 'comp', refId: 'bat1' });
  });

  it('fio no trecho entre componentes', () => {
    expect(boardHitAt(doc, { x: 8, y: 10 })).toMatchObject({ kind: 'wire', refId: 'w1' });
  });

  it('vazio no meio do nada', () => {
    expect(boardHitAt(doc, { x: 20, y: 25 })).toBeNull();
  });
});

describe('ação de botão (domHitAt)', () => {
  it('reconhece funções conhecidas', () => {
    expect(domHitAt('wire')?.kind).toBe('dom');
    expect(domHitAt('kind:lamp')?.action).toBe('kind:lamp');
    expect(domHitAt('view:3d')?.action).toBe('view:3d');
    expect(domHitAt('exemplo-inexistente')).toBeNull();
  });
});

function apiSpy(): DwellActApi & { calls: string[] } {
  const calls: string[] = [];
  const rec = (name: string) => (..._a: unknown[]) => {
    calls.push(name);
  };
  return {
    calls,
    arm: vi.fn(rec('arm')),
    armWire: vi.fn(rec('armWire')),
    loadExample: vi.fn(rec('loadExample')),
    clear: vi.fn(rec('clear')),
    setView: vi.fn(rec('setView')),
    select: vi.fn(rec('select')),
    startDraft: vi.fn(rec('startDraft')),
    moveDraft: vi.fn(rec('moveDraft')),
    endDraft: vi.fn(rec('endDraft')),
  };
}

describe('ativação por fixação', () => {
  it('botão de função dispara a ação certa', () => {
    const api = apiSpy();
    const act = new DwellActivator(api);
    act.fire(domHitAt('wire')!);
    act.fire(domHitAt('view:2d')!);
    act.fire(domHitAt('example:2')!);
    act.fire(domHitAt('kind:lamp')!);
    expect(api.calls).toEqual(['armWire', 'setView', 'loadExample', 'arm']);
  });

  it('componente e fio selecionam', () => {
    const api = apiSpy();
    const act = new DwellActivator(api);
    act.fire(boardHitAt(doc, { x: 4, y: 10 })!); // comp
    act.fire(boardHitAt(doc, { x: 8, y: 10 })!); // wire
    expect(api.calls).toEqual(['select', 'select']);
  });

  it('primeiro terminal inicia o fio; segundo completa (conectar pela mira)', () => {
    const api = apiSpy();
    const act = new DwellActivator(api);
    const t1 = boardHitAt(doc, { x: 5, y: 10 })!; // bat1 +
    const t2 = boardHitAt(doc, { x: 11, y: 10 })!; // lamp1 a
    act.fire(t1);
    expect(act.pendingFrom).toEqual({ x: 5, y: 10 });
    act.fire(t2);
    expect(act.pendingFrom).toBeNull();
    expect(api.calls).toEqual(['startDraft', 'moveDraft', 'endDraft', 'armWire']);
  });

  it('fixar duas vezes no MESMO terminal não fecha fio degenerado', () => {
    const api = apiSpy();
    const act = new DwellActivator(api);
    const t1 = boardHitAt(doc, { x: 5, y: 10 })!;
    act.fire(t1);
    expect(act.fire(t1)).toBe(false);
    expect(act.pendingFrom).toEqual({ x: 5, y: 10 });
  });

  it('rótulo legível por tipo', () => {
    expect(labelOf(domHitAt('wire')!)).toContain('função');
    expect(labelOf(boardHitAt(doc, { x: 5, y: 10 })!)).toContain('conectar');
  });
});
