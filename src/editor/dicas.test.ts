import { describe, expect, it } from 'vitest';
import { EMPTY_DOC } from '../core/netlist';
import { dicaDoMomento, type EstadoDica } from './dicas';
import { EXAMPLES } from './examples';
import { enquadrarConteudo, ZOOM_AUTO_MAX, viewBoxOf } from './zoomMath';
import { CELL } from './coords';

const base: EstadoDica = {
  doc: EXAMPLES[0].doc,
  placing: null,
  wiring: false,
  draft: null,
  grip: null,
  selection: null,
};

describe('dicaDoMomento', () => {
  it('quadro vazio e parado: sem dica (o convite do quadro fala)', () => {
    expect(dicaDoMomento({ ...base, doc: EMPTY_DOC })).toBeNull();
  });

  it('item armado manda clicar no quadro e diz qual peça', () => {
    const d = dicaDoMomento({ ...base, doc: EMPTY_DOC, placing: 'resistor' });
    expect(d?.tom).toBe('acao');
    expect(d?.texto).toContain('Resistor');
  });

  it('cada gesto em curso tem a sua frase', () => {
    const fio = dicaDoMomento({ ...base, draft: { moved: true } })!.texto;
    const modo = dicaDoMomento({ ...base, wiring: true })!.texto;
    const arraste = dicaDoMomento({ ...base, grip: { moved: true } })!.texto;
    expect(new Set([fio, modo, arraste]).size).toBe(3);
  });

  it('a chave selecionada ensina a abrir/fechar no clique', () => {
    const doc = EXAMPLES.find((e) => e.doc.comps.some((c) => c.kind === 'switch'))!.doc;
    const sw = doc.comps.find((c) => c.kind === 'switch')!;
    const d = dicaDoMomento({ ...base, doc, selection: { kind: 'comp', id: sw.id } });
    expect(d?.texto).toMatch(/abrir\/fechar/);
  });

  it('peças sem fio: ensina a ligar', () => {
    const doc = { comps: EXAMPLES[0].doc.comps, wires: [] };
    expect(dicaDoMomento({ ...base, doc })?.texto).toMatch(/ligar/);
  });
});

it('no toque nenhuma frase cita tecla', () => {
  const estados: Partial<EstadoDica>[] = [
    { placing: 'lamp' },
    { draft: { moved: true } },
    { wiring: true },
    { selection: { kind: 'wire', id: 'w1' } },
    { selection: { kind: 'comp', id: 'r1' } },
    {},
  ];
  for (const e of estados) {
    const d = dicaDoMomento({ ...base, ...e, toque: true });
    expect(d?.texto ?? '').not.toMatch(/Esc|Delete|R gira|F ou/);
  }
});

describe('enquadrarConteudo', () => {
  it('vazio = o quadro inteiro', () => {
    expect(enquadrarConteudo(EMPTY_DOC)).toEqual({ zoom: 1, pan: { x: 0, y: 0 } });
  });

  it('todo exemplo fica inteiro na vista, ampliado, sem passar do teto', () => {
    for (const ex of EXAMPLES) {
      const v = enquadrarConteudo(ex.doc);
      expect(v.zoom, ex.name).toBeGreaterThan(1);
      expect(v.zoom, ex.name).toBeLessThanOrEqual(ZOOM_AUTO_MAX);
      const vb = viewBoxOf(v);
      const pts = [...ex.doc.comps, ...ex.doc.wires.flatMap((w) => [w.from, w.to])];
      for (const p of pts) {
        expect(p.x * CELL, ex.name).toBeGreaterThanOrEqual(vb.x);
        expect(p.x * CELL, ex.name).toBeLessThanOrEqual(vb.x + vb.w);
        expect(p.y * CELL, ex.name).toBeGreaterThanOrEqual(vb.y);
        expect(p.y * CELL, ex.name).toBeLessThanOrEqual(vb.y + vb.h);
      }
    }
  });
});
