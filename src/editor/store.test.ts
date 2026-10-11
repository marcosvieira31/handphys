import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from './store';

/**
 * O fio tem imã nos dois lados: soltar PERTO de um terminal conecta nele,
 * soltar no vazio cancela (sem fio pendurado). Testes pelo store real,
 * mesma semântica que o mouse e (na Fase 2) a pinça usam.
 */
describe('fio com imã (store.endDraft)', () => {
  beforeEach(() => {
    useEditor.setState({
      doc: {
        comps: [
          { id: 'bat1', kind: 'vsource', x: 4, y: 10, rot: 0, value: 9 }, // + em (5,10)
          { id: 'lamp1', kind: 'lamp', x: 12, y: 10, rot: 0, value: 20 }, // a em (11,10)
        ],
        wires: [],
      },
      draft: null,
      selection: null,
      seq: 100,
      past: [],
    });
  });

  it('soltar perto do terminal conecta nele (fonte → lâmpada)', () => {
    const s = useEditor.getState();
    s.startDraft({ x: 5, y: 10 });
    s.moveDraft({ x: 8, y: 10 });
    s.endDraft({ x: 11, y: 11 }); // uma célula abaixo do terminal — o imã puxa
    const after = useEditor.getState();
    expect(after.doc.wires).toHaveLength(1);
    expect(after.doc.wires[0]).toMatchObject({ from: { x: 5, y: 10 }, to: { x: 11, y: 10 } });
    expect(after.draft).toBeNull();
  });

  it('soltar no vazio cancela, sem fio pendurado', () => {
    const s = useEditor.getState();
    s.startDraft({ x: 5, y: 10 });
    s.moveDraft({ x: 8, y: 10 });
    s.endDraft({ x: 20, y: 20 });
    const after = useEditor.getState();
    expect(after.doc.wires).toHaveLength(0);
    expect(after.draft).toBeNull();
  });

  it('soltar de volta na origem cancela (sem fio de um ponto a ele mesmo)', () => {
    const s = useEditor.getState();
    s.startDraft({ x: 5, y: 10 });
    s.moveDraft({ x: 6, y: 10 });
    s.endDraft({ x: 5, y: 10 });
    const after = useEditor.getState();
    expect(after.doc.wires).toHaveLength(0);
    expect(after.draft).toBeNull();
  });

  it('clique simples segura o fio na mão; segundo clique termina (clique-clique)', () => {
    const s = useEditor.getState();
    s.startDraft({ x: 5, y: 10 });
    s.endDraft({ x: 5, y: 10 }); // mesmo ponto, sem arrastar => fica "na mão"
    expect(useEditor.getState().draft).not.toBeNull();
    // o Schematic chama endDraft de novo no segundo clique (com imã)
    useEditor.getState().endDraft({ x: 11, y: 10 });
    const after = useEditor.getState();
    expect(after.doc.wires).toHaveLength(1);
    expect(after.doc.wires[0]).toMatchObject({ from: { x: 5, y: 10 }, to: { x: 11, y: 10 } });
  });
});
