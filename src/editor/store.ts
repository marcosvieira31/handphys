import { create } from 'zustand';
import {
  EMPTY_DOC,
  reattachWires,
  terminalPos,
  wiresAttachedTo,
  type CircuitDoc,
  type CompKind,
  type Placed,
  type Pt,
  type Wire,
} from '../core/netlist';

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
  selection: Selection | null;
  draft: Draft | null;
  colorByVoltage: boolean;
  seq: number;
  past: CircuitDoc[];
  arm: (kind: CompKind | null) => void;
  place: (kind: CompKind, at: Pt) => void;
  select: (sel: Selection | null) => void;
  startDraft: (p: Pt) => void;
  moveDraft: (p: Pt) => void;
  endDraft: (p: Pt) => void;
  cancelDraft: () => void;
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
  selection: null,
  draft: null,
  colorByVoltage: true,
  seq: 0,
  past: [],

  arm: (kind) => set({ placing: kind, selection: null, draft: null }),

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

  select: (sel) => set({ selection: sel, draft: null }),

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
    if (same && !d.moved) {
      // clique simples sobre o próprio terminal: mantém o fio "na mão"
      set({ draft: { ...d, moved: true, cursor: p } });
      return;
    }
    if (same) {
      set({ draft: null });
      return;
    }
    const wire: Wire = { id: `w${s.seq + 1}`, from: d.from, to: p };
    set({
      seq: s.seq + 1,
      past: [...s.past, s.doc].slice(-30),
      doc: { ...s.doc, wires: [...s.doc.wires, wire] },
      draft: null,
      selection: { kind: 'wire', id: wire.id },
    });
  },

  cancelDraft: () => set({ draft: null }),

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
    set((s) => ({ doc, past: [...s.past, s.doc].slice(-30), selection: null, draft: null, placing: null })),

  clear: () => set((s) => ({ doc: EMPTY_DOC, past: [...s.past, s.doc].slice(-30), selection: null, draft: null })),

  undo: () =>
    set((s) => {
      if (!s.past.length) return s;
      const past = s.past.slice(0, -1);
      return { past, doc: s.past[s.past.length - 1], selection: null, draft: null };
    }),

  setColorByVoltage: (on) => set({ colorByVoltage: on }),
}));
