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
  grip: { id: string; dx: number; dy: number } | null;
  colorByVoltage: boolean;
  seq: number;
  past: CircuitDoc[];
  arm: (kind: CompKind | null) => void;
  armWire: (on: boolean) => void;
  place: (kind: CompKind, at: Pt) => void;
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
  setValue: (id: string, value: number) => void;
  toggleSwitch: (id: string) => void;
  load: (doc: CircuitDoc) => void;
  clear: () => void;
  undo: () => void;
  setColorByVoltage: (on: boolean) => void;
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

/** Prefixo curto de id: "r3", "bat2" — legível no painel e nas mensagens. */
const PREFIX: Record<CompKind, string> = {
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
  wiring: false,
  selection: null,
  draft: null,
  grip: null,
  colorByVoltage: true,
  seq: 0,
  past: [],

  arm: (kind) => set({ placing: kind, wiring: false, selection: null, draft: null, grip: null }),

  armWire: (on) => set({ wiring: on, placing: null, selection: null, draft: null, grip: null }),

  place: (kind, at) => {
    const s = get();
    const n = s.seq + 1;
    const comp: Placed = {
      id: `${PREFIX[kind]}${n}`,
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

  cancelDraft: () => set({ draft: null }),

  /**
   * Aperta numa célula: a MESMA decisão para mouse (pointerdown) e pinça
   * (fechar os dedos). Ordem: posicionar > terminar fio > modo fio >
   * começar fio > segurar componente > selecionar fio.
   */
  pressAt: (cell) => {
    const s = get();
    if (s.placing) {
      s.place(s.placing, cell);
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
        grip: { id: comp.id, dx: comp.x - cell.x, dy: comp.y - cell.y },
      });
      return;
    }
    const wire = wireAt(s.doc, cell);
    s.select(wire ? { kind: 'wire', id: wire.id } : null);
  },

  /** Move com aperto: leva o fio em arraste ou o componente segurado. */
  moveAt: (cell) => {
    const s = get();
    if (s.draft) {
      s.moveDraft(cell);
      return;
    }
    if (s.grip) s.moveComp(s.grip.id, cell.x + s.grip.dx, cell.y + s.grip.dy);
  },

  /** Solta o aperto: termina o fio ou larga o componente. */
  releaseAt: (cell) => {
    const s = get();
    if (s.draft) s.endDraft(cell);
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
    set({ doc: reattachWires(doc, moved, before) });
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
    set((s) => ({ doc, past: [...s.past, s.doc].slice(-30), selection: null, draft: null, placing: null, wiring: false, grip: null })),

  clear: () => set((s) => ({ doc: EMPTY_DOC, past: [...s.past, s.doc].slice(-30), selection: null, draft: null, wiring: false, grip: null })),

  undo: () =>
    set((s) => {
      if (!s.past.length) return s;
      const past = s.past.slice(0, -1);
      return { past, doc: s.past[s.past.length - 1], selection: null, draft: null, grip: null };
    }),

  setColorByVoltage: (on) => set({ colorByVoltage: on }),
}));
