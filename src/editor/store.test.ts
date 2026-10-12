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

  it('soltar de volta na origem SEGURA o fio (tremida no clique não cancela)', () => {
    const s = useEditor.getState();
    s.startDraft({ x: 5, y: 10 });
    s.moveDraft({ x: 6, y: 10 }); // tremida: saiu e voltou
    s.endDraft({ x: 5, y: 10 });
    const after = useEditor.getState();
    expect(after.doc.wires).toHaveLength(0);
    expect(after.draft).not.toBeNull(); // continua na mão em vez de sumir
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

  it('modo fio: soltar no vazio mantém o fio na mão (errar não perde o progresso)', () => {
    const s = useEditor.getState();
    s.armWire(true);
    s.startDraft({ x: 5, y: 10 });
    s.moveDraft({ x: 8, y: 10 });
    s.endDraft({ x: 20, y: 20 });
    const after = useEditor.getState();
    expect(after.doc.wires).toHaveLength(0);
    expect(after.draft).not.toBeNull();
    // e o segundo clique no alvo termina o fio
    after.endDraft({ x: 11, y: 10 });
    expect(useEditor.getState().doc.wires).toHaveLength(1);
  });

  it('armar componente (ou exemplo) sai do modo fio', () => {
    const s = useEditor.getState();
    s.armWire(true);
    expect(useEditor.getState().wiring).toBe(true);
    s.arm('resistor');
    expect(useEditor.getState().wiring).toBe(false);
    expect(useEditor.getState().placing).toBe('resistor');
  });
});

describe('semântica única press/move/release (mouse e pinça)', () => {
  beforeEach(() => {
    useEditor.setState({
      doc: {
        comps: [
          { id: 'bat1', kind: 'vsource', x: 4, y: 10, rot: 0, value: 9 },
          { id: 'lamp1', kind: 'lamp', x: 12, y: 10, rot: 0, value: 20 },
        ],
        wires: [],
      },
      placing: null,
      wiring: false,
      draft: null,
      grip: null,
      selection: null,
      seq: 100,
      past: [],
    });
  });

  it('press no terminal começa o fio; release no alvo conecta (via press/move/release)', () => {
    const s = useEditor.getState();
    s.pressAt({ x: 5, y: 10 });
    expect(useEditor.getState().draft).not.toBeNull();
    s.moveAt({ x: 8, y: 10 });
    s.releaseAt({ x: 11, y: 11 }); // perto: o imã puxa para (11,10)
    const after = useEditor.getState();
    expect(after.doc.wires).toHaveLength(1);
    expect(after.doc.wires[0]).toMatchObject({ from: { x: 5, y: 10 }, to: { x: 11, y: 10 } });
  });

  it('press no corpo segura o componente; move arrasta; release larga', () => {
    const s = useEditor.getState();
    s.pressAt({ x: 12, y: 10 }); // centro da lâmpada (a 1,0 do terminal: não é fio)
    expect(useEditor.getState().grip?.id).toBe('lamp1');
    s.moveAt({ x: 14, y: 12 });
    expect(useEditor.getState().doc.comps.find((c) => c.id === 'lamp1')).toMatchObject({ x: 14, y: 12 });
    s.releaseAt({ x: 14, y: 12 });
    expect(useEditor.getState().grip).toBeNull();
  });

  it('press com fio na mão termina o fio (clique-clique pela mesma via)', () => {
    const s = useEditor.getState();
    s.pressAt({ x: 5, y: 10 });
    s.releaseAt({ x: 5, y: 10 });
    expect(useEditor.getState().draft).not.toBeNull();
    s.pressAt({ x: 11, y: 10 });
    expect(useEditor.getState().doc.wires).toHaveLength(1);
  });

  it('press posiciona quando há componente armado', () => {
    const s = useEditor.getState();
    s.arm('resistor');
    s.pressAt({ x: 20, y: 5 });
    const after = useEditor.getState();
    expect(after.doc.comps.some((c) => c.x === 20 && c.y === 5)).toBe(true);
    expect(after.placing).toBeNull();
  });
});

/**
 * Diálogo em cima da cena (compartilhar): enquanto estiver aberto nada aperta,
 * nada move — a pinça continuaria arrastando componente atrás do cartão.
 */
describe('diálogo em cima (store.modal)', () => {
  beforeEach(() => {
    useEditor.setState({
      doc: {
        comps: [
          { id: 'bat1', kind: 'vsource', x: 4, y: 10, rot: 0, value: 9 },
          { id: 'lamp1', kind: 'lamp', x: 12, y: 10, rot: 0, value: 20 },
        ],
        wires: [],
      },
      placing: null,
      wiring: false,
      draft: null,
      grip: null,
      selection: null,
      modal: false,
      seq: 100,
      past: [],
    });
  });

  it('com o diálogo aberto, aperto e movimento não tocam na cena', () => {
    const st = useEditor.getState();
    st.setModal(true);

    st.pressAt({ x: 12, y: 10 }); // em cima da lâmpada: não segura nada
    expect(useEditor.getState().grip).toBeNull();
    expect(useEditor.getState().selection).toBeNull();

    st.arm('resistor'); // nem posiciona componente armado
    st.pressAt({ x: 20, y: 5 });
    expect(useEditor.getState().doc.comps).toHaveLength(2);

    st.moveAt({ x: 20, y: 5 });
    st.releaseAt({ x: 20, y: 5 });
    expect(useEditor.getState().doc.comps.find((c) => c.id === 'lamp1')).toMatchObject({
      x: 12,
      y: 10,
    });
    expect(useEditor.getState().grip).toBeNull();
  });

  it('abrir já larga o que estava na mão', () => {
    useEditor.getState().pressAt({ x: 12, y: 10 });
    expect(useEditor.getState().grip).not.toBeNull();
    useEditor.getState().setModal(true);
    expect(useEditor.getState().grip).toBeNull();
  });

  it('fechar devolve o controle na hora', () => {
    const st = useEditor.getState();
    st.setModal(true);
    st.pressAt({ x: 12, y: 10 });
    expect(useEditor.getState().grip).toBeNull();
    st.setModal(false);
    st.pressAt({ x: 12, y: 10 });
    expect(useEditor.getState().grip?.id).toBe('lamp1');
  });
});
