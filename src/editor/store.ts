import { create } from 'zustand';
import {
  EMPTY_DOC,
  compAt,
  nearestTerminal,
  reattachWires,
  samePt,
  terminalPos,
  wiresAttachedTo,
  type CircuitDoc,
  type CompKind,
  type Placed,
  type Pt,
  type Wire,
} from '../core/netlist';
import { GRAB_DIST, SNAP_DIST, WIRE_GRAB, wireAt } from './coords';
import { zoomAbout, panPx } from './zoomMath';

const LIMIT = 30; // células de 0..29 — o quadro tem borda, nada sai da grade

export interface Selection {
  kind: 'comp' | 'wire';
  id: string;
}

interface Draft {
  from: Pt;
  cursor: Pt;
  /** O ponteiro já saiu da célula de origem (distingue clique de arraste). */
  moved: boolean;
}

export interface EditorState {
  doc: CircuitDoc;
  placing: CompKind | null;
  /** Modo fio: só conecta (sem arrastar componente), com mira generosa e alvos acesos. */
  wiring: boolean;
  selection: Selection | null;
  draft: Draft | null;
  /** Componente segurado (arraste em curso, mouse ou pinça). */
  /** Componente segurado. `moved` distingue CLIQUE (apertar e soltar sem andar
   *  = alterna a chave) de ARRASTE (solta depois de mover = só posiciona). */
  grip: { id: string; dx: number; dy: number; moved: boolean } | null;
  colorByVoltage: boolean;
  /** Vista ativa: o MESMO documento em 2D ou na bancada 3D. */
  view: '2d' | '3d';
  /** Zoom do quadro 2D (1 = cabe tudo, 4 = o teto) e deslocamento do centro. */
  zoom: number;
  pan: Pt;
  seq: number;
  past: CircuitDoc[];
  /**
   * Diálogo em cima da cena (compartilhar): enquanto estiver aberto a cena não
   * recebe aperto nem movimento — senão a pinça continuaria arrastando
   * componentes atrás do cartão, sem o professor ver.
   */
  modal: boolean;
  setModal: (on: boolean) => void;
  arm: (kind: CompKind | null) => void;
  armWire: (on: boolean) => void;
  place: (kind: CompKind, at: Pt) => void;
  /**
   * Célula em que o item ARMADO está sendo carregado. Apertar = pegar (o
   * fantasma gruda na mira), soltar = posicionar — o gesto da pinça vira um
   * arrastar de verdade, em UMA apertada, em vez de posicionar na borda do
   * quadro no primeiro aperto que encontra célula.
   */
  carry: Pt | null;
  select: (sel: Selection | null) => void;
  startDraft: (p: Pt) => void;
  moveDraft: (p: Pt) => void;
  endDraft: (p: Pt) => void;
  cancelDraft: () => void;
  /** Aperta / move com aperto / solta: a MESMA semântica para mouse e pinça. */
  pressAt: (cell: Pt) => void;
  moveAt: (cell: Pt) => void;
  releaseAt: (cell: Pt) => void;
  releaseGrip: () => void;
  moveComp: (id: string, x: number, y: number) => void;
  rotate: (id: string) => void;
  removeSelected: () => void;
  /** Lixeira da bancada: soltou o item por lá (arrastou) ou clicou com algo
   *  selecionado. Desfazer com Ctrl+Z. */
  trash: () => void;
  setValue: (id: string, value: number) => void;
  toggleSwitch: (id: string) => void;
  load: (doc: CircuitDoc) => void;
  clear: () => void;
  undo: () => void;
  setColorByVoltage: (on: boolean) => void;
  setView: (v: '2d' | '3d') => void;
  /** Zoom mantendo um ponto do quadro preso na tela (`anchor` nulo = centro). */
  zoomBy: (factor: number, anchor?: Pt | null) => void;
  /** Arraste em px de tela => desloca a vista (o conteúdo acompanha o dedo). */
  panBy: (dxPx: number, dyPx: number, viewportPx: number) => void;
  resetView: () => void;
}

const clamp = (v: number) => Math.max(0, Math.min(LIMIT - 1, v));

/** Valor inicial de cada tipo (o que um professor espera ao posicionar). */
const DEFAULT_VALUE: Record<CompKind, number> = {
  vsource: 9,
  resistor: 100,
  capacitor: 1e-6,
  lamp: 20,
  switch: 0,
  ground: 0,
};

/** Prefixo curto de id: "r3", "bat2" — legível no painel e nas mensagens.
 *  Exportado porque o share por URL regenera ids do mesmo jeito. */
export const ID_PREFIX: Record<CompKind, string> = {
  vsource: 'bat',
  resistor: 'r',
  capacitor: 'c',
  lamp: 'lamp',
  switch: 'sw',
  ground: 'gnd',
};

/**
 * Estado do editor. Toda mutação passa por aqui (nunca direto no React):
 * assim a MESMA semântica serve ao mouse hoje e à pinça da Fase 2.
 */
export const useEditor = create<EditorState>((set, get) => ({
  doc: EMPTY_DOC,
  placing: null,
  carry: null,
  wiring: false,
  selection: null,
  draft: null,
  grip: null,
  colorByVoltage: true,
  view: '2d',
  zoom: 1,
  pan: { x: 0, y: 0 },
  seq: 0,
  past: [],
  modal: false,

  setModal: (on) => {
    if (!on) {
      set({ modal: false });
      return;
    }
    // abrir já larga o que estava na mão (senão o aperto fica preso atrás do
    // cartão e o componente salta sozinho quando o diálogo fecha)
    set({ modal: true, grip: null, draft: null, placing: null, carry: null, wiring: false });
  },

  arm: (kind) => {
    if (get().modal) return; // diálogo em cima: nada arma componente
    set({ placing: kind, carry: null, wiring: false, selection: null, draft: null, grip: null });
  },

  armWire: (on) => {
    if (get().modal) return;
    set({ wiring: on, placing: null, carry: null, selection: null, draft: null, grip: null });
  },

  place: (kind, at) => {
    const s = get();
    const n = s.seq + 1;
    const comp: Placed = {
      id: `${ID_PREFIX[kind]}${n}`,
      kind,
      x: clamp(at.x),
      y: clamp(at.y),
      rot: 0,
      value: DEFAULT_VALUE[kind],
    };
    set({
      seq: n,
      past: [...s.past, s.doc].slice(-30),
      doc: { ...s.doc, comps: [...s.doc.comps, comp] },
      selection: { kind: 'comp', id: comp.id },
      placing: null, // um clique = um componente: evita espalhar sem querer
      carry: null,
    });
  },

  select: (sel) => set({ selection: sel, draft: null, grip: null }),

  startDraft: (p) => set({ draft: { from: p, cursor: p, moved: false }, selection: null }),

  moveDraft: (p) => {
    const d = get().draft;
    if (!d) return;
    const moved = d.moved || p.x !== d.from.x || p.y !== d.from.y;
    set({ draft: { ...d, cursor: p, moved } });
  },

  endDraft: (p) => {
    const s = get();
    const d = s.draft;
    if (!d) return;
    const same = p.x === d.from.x && p.y === d.from.y;
    if (same) {
      // soltar onde pegou SEGURA o fio na mão — mesmo com tremida no meio do
      // clique (sair e voltar à origem não cancela mais: para soltar, Esc ou
      // um clique no vazio fora do modo fio).
      set({ draft: { ...d, moved: true, cursor: p } });
      return;
    }
    // imã: soltar PERTO de um terminal conecta nele; a origem nunca é alvo dela mesma.
    const hit = nearestTerminal(s.doc, p, SNAP_DIST);
    const to = hit && !samePt(hit.pos, d.from) ? hit.pos : null;
    if (!to) {
      // no modo fio, errar o alvo mantém o fio na mão (clique o alvo em seguida);
      // fora dele, cancela sem deixar fio pendurado.
      if (s.wiring) set({ draft: { ...d, moved: true, cursor: p } });
      else set({ draft: null });
      return;
    }
    const wire: Wire = { id: `w${s.seq + 1}`, from: d.from, to };
    set({
      seq: s.seq + 1,
      past: [...s.past, s.doc].slice(-30),
      doc: { ...s.doc, wires: [...s.doc.wires, wire] },
      draft: null,
      selection: { kind: 'wire', id: wire.id },
    });
  },

  cancelDraft: () => set({ draft: null, carry: null }),

  /**
   * Aperta numa célula: a MESMA decisão para mouse (pointerdown) e pinça
   * (fechar os dedos). Ordem: carregar item armado > terminar fio > modo fio >
   * começar fio > segurar componente > selecionar fio.
   */
  pressAt: (cell) => {
    const s = get();
    if (s.modal) return; // diálogo em cima: a cena não recebe aperto
    if (s.placing) {
      // PEGOU o item: o fantasma gruda na mira e só cai no releaseAt — assim
      // a pinça carrega do trilho até onde QUER soltar, sem posicionar no
      // primeiro aperto (que acontecia na borda do quadro).
      set({ carry: cell });
      return;
    }
    if (s.draft?.moved) {
      s.endDraft(cell);
      return;
    }
    if (s.wiring) {
      const grab = nearestTerminal(s.doc, cell, WIRE_GRAB);
      if (grab) s.startDraft(grab.pos);
      return;
    }
    const grab = nearestTerminal(s.doc, cell, GRAB_DIST);
    if (grab) {
      s.startDraft(grab.pos);
      return;
    }
    const comp = compAt(s.doc, cell);
    if (comp) {
      set({
        selection: { kind: 'comp', id: comp.id },
        draft: null,
        grip: { id: comp.id, dx: comp.x - cell.x, dy: comp.y - cell.y, moved: false },
      });
      return;
    }
    const wire = wireAt(s.doc, cell);
    s.select(wire ? { kind: 'wire', id: wire.id } : null);
  },

  /** Move com aperto: leva o item carregado, o fio em arraste ou o componente segurado. */
  moveAt: (cell) => {
    const s = get();
    if (s.modal) return;
    if (s.placing && s.carry) {
      set({ carry: cell }); // o fantasma acompanha a mira até o soltar
      return;
    }
    if (s.draft) {
      s.moveDraft(cell);
      return;
    }
    if (s.grip) s.moveComp(s.grip.id, cell.x + s.grip.dx, cell.y + s.grip.dy);
  },

  /** Solta o aperto: posiciona o item carredado, termina o fio, alterna a chave
   *  (clique = apertar e soltar sem andar) ou larga o componente. */
  releaseAt: (cell) => {
    const s = get();
    if (s.modal) return;
    if (s.placing) {
      s.place(s.placing, cell); // SOLTOU = posiciona onde a mira estava
      return;
    }
    if (s.draft) {
      s.endDraft(cell);
      return;
    }
    const g = s.grip;
    if (g && !g.moved) {
      const c = s.doc.comps.find((k) => k.id === g.id);
      if (c?.kind === 'switch') {
        set({ grip: null }); // solta a mão antes: sem isso a chave fica colada na mira
        s.toggleSwitch(c.id); // clique na chave (sem arrastar) = abre/fecha
        return;
      }
    }
    set({ grip: null });
  },

  releaseGrip: () => set({ grip: null }),

  moveComp: (id, x, y) => {
    const s = get();
    const c = s.doc.comps.find((k) => k.id === id);
    if (!c) return;
    const nx = clamp(x);
    const ny = clamp(y);
    if (nx === c.x && ny === c.y) return;
    const before = [terminalPos(c, 0), terminalPos(c, 1)];
    const moved: Placed = { ...c, x: nx, y: ny };
    const doc: CircuitDoc = {
      ...s.doc,
      comps: s.doc.comps.map((k) => (k.id === id ? moved : k)),
    };
    // marcar o grip como "andou": soltar depois de mover NÃO vira clique de chave
    set({
      doc: reattachWires(doc, moved, before),
      grip: s.grip && s.grip.id === id ? { ...s.grip, moved: true } : s.grip,
    });
  },

  rotate: (id) => {
    const s = get();
    const c = s.doc.comps.find((k) => k.id === id);
    if (!c) return;
    const before = [terminalPos(c, 0), terminalPos(c, 1)];
    const rotated: Placed = { ...c, rot: (((c.rot + 90) % 360) as Placed['rot']) };
    const doc: CircuitDoc = {
      ...s.doc,
      comps: s.doc.comps.map((k) => (k.id === id ? rotated : k)),
    };
    set({ past: [...s.past, s.doc].slice(-30), doc: reattachWires(doc, rotated, before) });
  },

  removeSelected: () => {
    const s = get();
    const sel = s.selection;
    if (!sel) return;
    if (sel.kind === 'wire') {
      set({
        past: [...s.past, s.doc].slice(-30),
        doc: { ...s.doc, wires: s.doc.wires.filter((w) => w.id !== sel.id) },
        selection: null,
      });
      return;
    }
    const c = s.doc.comps.find((k) => k.id === sel.id);
    if (!c) return;
    const gone = new Set(wiresAttachedTo(s.doc, c));
    set({
      past: [...s.past, s.doc].slice(-30),
      doc: {
        comps: s.doc.comps.filter((k) => k.id !== c.id),
        wires: s.doc.wires.filter((w) => !gone.has(w.id)),
      },
      selection: null,
    });
  },

  /** Lixeira da bancada: o MESMO destino para soltar por lá (arrastou com a
   *  pinça/mouse) e para clicar com o item selecionado. Fio na mão ou item em
   *  arraste que ainda não foi colocado só são CANCELADOS — apagar mesmo é
   *  quando tem algo selecionado/segurado (segurar já seleciona). */
  trash: () => {
    const s = get();
    if (s.modal) return;
    if (s.wiring) {
      s.armWire(false); // modo fio (com ou sem fio na mão): sai — limpa o draft
      return;
    }
    if (s.draft) {
      s.cancelDraft(); // fio na mão no clique-clique: jogou fora antes de conectar
      return;
    }
    if (s.placing) {
      s.arm(null); // item armado/nas mãos: desiste de posicionar
      return;
    }
    if (!s.grip && !s.selection) return; // lixeira sem nada selecionado: nada a apagar
    s.removeSelected(); // segurar já seleciona o item (ou a seleção é um fio)
    set({ grip: null, carry: null }); // solta a mão
  },

  setValue: (id, value) => {
    const s = get();
    const c = s.doc.comps.find((k) => k.id === id);
    if (!c || !Number.isFinite(value)) return;
    set({
      doc: { ...s.doc, comps: s.doc.comps.map((k) => (k.id === id ? { ...k, value } : k)) },
    });
  },

  toggleSwitch: (id) => {
    const s = get();
    const c = s.doc.comps.find((k) => k.id === id);
    if (!c) return;
    set({
      past: [...s.past, s.doc].slice(-30),
      doc: {
        ...s.doc,
        comps: s.doc.comps.map((k) => (k.id === id ? { ...k, closed: !k.closed } : k)),
      },
    });
  },

  load: (doc) =>
    set((s) => ({
      doc,
      past: [...s.past, s.doc].slice(-30),
      selection: null,
      draft: null,
      placing: null,
      carry: null,
      wiring: false,
      grip: null,
    })),

  clear: () =>
    set((s) => ({
      doc: EMPTY_DOC,
      past: [...s.past, s.doc].slice(-30),
      selection: null,
      draft: null,
      carry: null,
      wiring: false,
      grip: null,
    })),

  undo: () =>
    set((s) => {
      if (!s.past.length) return s;
      const past = s.past.slice(0, -1);
      return { past, doc: s.past[s.past.length - 1], selection: null, draft: null, grip: null };
    }),

  setColorByVoltage: (on) => set({ colorByVoltage: on }),

  setView: (v) => set({ view: v, draft: null, grip: null }),

  zoomBy: (factor, anchor) =>
    set((s) => zoomAbout({ zoom: s.zoom, pan: s.pan }, factor, anchor ?? null)),

  panBy: (dxPx, dyPx, viewportPx) =>
    set((s) => panPx({ zoom: s.zoom, pan: s.pan }, dxPx, dyPx, viewportPx)),

  resetView: () => set({ zoom: 1, pan: { x: 0, y: 0 } }),
}));
