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
      carry: null,
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

  it('armado: apertar PEGA (carry), mover leva o fantasma, soltar POSICIONA', () => {
    const s = useEditor.getState();
    s.arm('resistor');
    s.pressAt({ x: 4, y: 5 }); // pegou: não cai na borda, só carrega
    const pegou = useEditor.getState();
    expect(pegou.carry).toMatchObject({ x: 4, y: 5 });
    expect(pegou.doc.comps.some((c) => c.x === 4 && c.y === 5)).toBe(false);
    pegou.moveAt({ x: 20, y: 11 }); // o fantasma acompanha a mira
    expect(useEditor.getState().carry).toMatchObject({ x: 20, y: 11 });
    useEditor.getState().releaseAt({ x: 21, y: 12 }); // soltou = posiciona
    const after = useEditor.getState();
    expect(after.doc.comps.some((c) => c.kind === 'resistor' && c.x === 21 && c.y === 12)).toBe(true);
    expect(after.placing).toBeNull();
    expect(after.carry).toBeNull();
  });

  it('lixeira: item na mão (grip) é apagado — e o Ctrl+Z traz de volta', () => {
    const s = useEditor.getState();
    s.pressAt({ x: 12, y: 10 }); // segura a lâmpada
    expect(useEditor.getState().grip?.id).toBe('lamp1');
    useEditor.getState().trash();
    const after = useEditor.getState();
    expect(after.doc.comps.find((c) => c.id === 'lamp1')).toBeUndefined();
    expect(after.doc.comps.find((c) => c.id === 'bat1')).toBeDefined(); // a fonte fica
    expect(after.grip).toBeNull();
    expect(after.selection).toBeNull();
    expect(after.past.length).toBeGreaterThan(0);
    after.undo();
    expect(useEditor.getState().doc.comps.find((c) => c.id === 'lamp1')).toBeDefined();
  });

  it('lixeira: com só a seleção apaga; sem nada selecionado não faz nada', () => {
    const s = useEditor.getState();
    s.select({ kind: 'comp', id: 'lamp1' });
    useEditor.getState().trash();
    expect(useEditor.getState().doc.comps.find((c) => c.id === 'lamp1')).toBeUndefined();
    const n = useEditor.getState().doc.comps.length;
    useEditor.getState().trash(); // nada selecionado: lixeira vazia
    expect(useEditor.getState().doc.comps.length).toBe(n);
  });

  it('lixeira: fio na mão é cancelado e item armado só desarma (nada foi colocado)', () => {
    const s = useEditor.getState();
    s.pressAt({ x: 5, y: 10 }); // aperto no terminal: fio na mão
    expect(useEditor.getState().draft).not.toBeNull();
    useEditor.getState().trash();
    const a1 = useEditor.getState();
    expect(a1.draft).toBeNull();
    expect(a1.doc.wires).toHaveLength(0);
    s.arm('resistor');
    s.pressAt({ x: 4, y: 5 }); // pegou o item armado (carry)
    expect(useEditor.getState().carry).not.toBeNull();
    useEditor.getState().trash(); // desistiu de posicionar: só desarma
    const a2 = useEditor.getState();
    expect(a2.placing).toBeNull();
    expect(a2.carry).toBeNull();
    expect(a2.doc.comps.some((c) => c.kind === 'resistor')).toBe(false);
  });

  it('lixeira: modo fio aberto (com ou sem fio na mão) sai do modo', () => {
    const s = useEditor.getState();
    s.armWire(true);
    s.startDraft({ x: 5, y: 10 });
    expect(useEditor.getState().draft).not.toBeNull();
    useEditor.getState().trash();
    const after = useEditor.getState();
    expect(after.wiring).toBe(false);
    expect(after.draft).toBeNull();
    expect(after.doc.wires).toHaveLength(0);
    s.armWire(true);
    useEditor.getState().trash(); // modo fio sem nada na mão: só sai do modo
    expect(useEditor.getState().wiring).toBe(false);
  });

  it('chave: clique (apertar e soltar sem andar) abre/fechara; arrastar não alterna', () => {
    const s = useEditor.getState();
    // troca a lâmpada por uma chave em (12,10)
    useEditor.setState({
      doc: { comps: [{ id: 'sw1', kind: 'switch', x: 12, y: 10, rot: 0, value: 0 }], wires: [] },
    });
    // 1º clique => fechada
    s.pressAt({ x: 12, y: 10 });
    expect(useEditor.getState().grip?.id).toBe('sw1');
    useEditor.getState().releaseAt({ x: 12, y: 10 });
    expect(useEditor.getState().doc.comps[0].closed).toBe(true);
    expect(useEditor.getState().grip).toBeNull();
    // 2º clique => abre de novo
    s.pressAt({ x: 12, y: 10 });
    useEditor.getState().releaseAt({ x: 12, y: 10 });
    expect(useEditor.getState().doc.comps[0].closed).toBeFalsy();
    // arrastou => só move (não alterna)
    s.pressAt({ x: 12, y: 10 });
    s.moveAt({ x: 10, y: 10 });
    useEditor.getState().releaseAt({ x: 10, y: 10 });
    const after = useEditor.getState();
    expect(after.doc.comps[0]).toMatchObject({ x: 10, y: 10, closed: false });
    // apertar NEM SEMPRE alterna resistor: clique em resistor comum é só soltar
    useEditor.setState({
      doc: { comps: [{ id: 'r1', kind: 'resistor', x: 12, y: 10, rot: 0, value: 100 }], wires: [] },
    });
    s.pressAt({ x: 12, y: 10 });
    useEditor.getState().releaseAt({ x: 12, y: 10 });
    expect(useEditor.getState().grip).toBeNull();
    expect(useEditor.getState().doc.comps).toHaveLength(1);
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

describe('aperto no vazio = deslocar a vista (pan)', () => {
  beforeEach(() => {
    useEditor.setState({
      doc: {
        comps: [{ id: 'bat1', kind: 'vsource', x: 4, y: 10, rot: 0, value: 9 }],
        wires: [],
      },
      draft: null,
      grip: null,
      selection: null,
      placing: null,
      carry: null,
      wiring: false,
      modal: false,
      panning: false,
      zoom: 2,
      pan: { x: 40, y: -25 },
      seq: 100,
      past: [],
    });
  });

  it('aperto LONGE de tudo marca panning; soltar encerra', () => {
    useEditor.getState().pressAt({ x: 22, y: 22 });
    expect(useEditor.getState().panning).toBe(true);
    expect(useEditor.getState().grip).toBeNull();
    useEditor.getState().releaseAt({ x: 24, y: 20 });
    expect(useEditor.getState().panning).toBe(false);
  });

  it('aperto em componente NAO vira pan (� arraste do componente)', () => {
    useEditor.getState().pressAt({ x: 4, y: 10 }); // corpo da fonte
    const st = useEditor.getState();
    expect(st.panning).toBe(false);
    expect(st.grip?.id).toBe('bat1');
  });

  it('aperto no TERMINAL nao vira pan (� o fio na mao)', () => {
    useEditor.getState().pressAt({ x: 5, y: 10 }); // terminal + da fonte
    const st = useEditor.getState();
    expect(st.panning).toBe(false);
    expect(st.draft).not.toBeNull();
    useEditor.getState().cancelDraft();
  });

  it('stopPan corta no meio do arraste (chegou o segundo dedo do toque)', () => {
    useEditor.getState().pressAt({ x: 22, y: 22 });
    expect(useEditor.getState().panning).toBe(true);
    useEditor.getState().stopPan();
    expect(useEditor.getState().panning).toBe(false);
  });

  it('centerView leva ao CENTRO do quadro mantendo o zoom', () => {
    const st = useEditor.getState();
    expect(st.zoom).toBe(2);
    st.centerView();
    const after = useEditor.getState();
    expect(after.pan).toEqual({ x: 0, y: 0 });
    expect(after.zoom).toBe(2); // so o enquadramento muda
  });

  it('moveAt durante o pan nao mexe em componente (o consumidor e quem pan-a)', () => {
    useEditor.getState().pressAt({ x: 22, y: 22 });
    const antes = JSON.stringify(useEditor.getState().doc.comps);
    useEditor.getState().moveAt({ x: 18, y: 16 });
    expect(JSON.stringify(useEditor.getState().doc.comps)).toBe(antes);
    expect(useEditor.getState().grip).toBeNull();
    expect(useEditor.getState().draft).toBeNull();
  });
});
