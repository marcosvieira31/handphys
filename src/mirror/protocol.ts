/**
 * Protocolo do ESPPELHO AO VIVO — uma tela conduz (mouse, mãos ou cardboard) e
 * a outra acompanha a MESMA imagem em tempo real, para a projeção da sala.
 *
 * O transporte é plugável (ver `channel.ts`): hoje é BroadcastChannel na mesma
 * máquina (sem servidor, funciona offline); WebRTC na rede local entra depois
 * como mais um transporte — o protocolo não muda.
 *
 * A mensagem de trabalho é a `state`, com o estado COMPLETO e compacto: o
 * codec do link `?c=` (`share.ts`) faz o trabalho pesado e já é testado. Docs
 * são pequenos (≤2 kB), então estado completo a cada envio vale mais que
 * delta — nada de estado perdido, nada de reconstituir histórico, e um
 * observador que abre no meio já recebe tudo de uma vez.
 */

import type { CircuitDoc, CompKind, Pt } from '../core/netlist';
import { decodeDoc, encodeDoc } from '../editor/share';
import type { Selection } from '../editor/store';

export const CHANNEL_NAME = 'handphys.espelho';
export const MIRROR_VERSION = 1;

/** Estado da tela que conduz, o que o espelho aplica inteiro. */
export interface State {
  doc: CircuitDoc;
  view: '2d' | '3d';
  zoom: number;
  pan: Pt;
  sel: Selection | null;
  placing: CompKind | null;
  colorByVoltage: boolean;
  /** Corrente animada nos fios (o mesmo interruptor da tela que conduz). */
  flow: boolean;
}

export type Msg =
  | { kind: 'state'; state: State }
  | { kind: 'hello'; id: string }
  | { kind: 'bye' };

const KINDS: Readonly<Record<string, true>> = {
  vsource: true,
  resistor: true,
  capacitor: true,
  lamp: true,
  switch: true,
  ground: true,
};

/** Observador: "me mande o estado" (e marca que existe uma tela acompanhando). */
export function helloMsg(id: string): string {
  return JSON.stringify({ t: 'hello', v: MIRROR_VERSION, id });
}

/** Quem conduz parou de transmitir (fechou a aba, desligou o espelho). */
export const BYE = JSON.stringify({ t: 'bye', v: MIRROR_VERSION });

export function encodeState(st: State): string {
  return JSON.stringify({
    t: 'state',
    v: MIRROR_VERSION,
    d: encodeDoc(st.doc),
    w: st.view === '3d' ? '3d' : '2d',
    z: st.zoom,
    p: [st.pan.x, st.pan.y],
    s: st.sel ? `${st.sel.kind}:${st.sel.id}` : '',
    a: st.placing ?? '',
    c: st.colorByVoltage ? 1 : 0,
    f: st.flow ? 1 : 0,
  });
}

/** Número aleatório curto: só para o mestre contar quantas telas estão abertas. */
export function newWatcherId(): string {
  return Math.random().toString(36).slice(2, 8);
}

const num = (n: unknown, min: number, max: number, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

/**
 * Lê uma mensagem do espelho. Entrada podre (outra versão, JSON quebrado,
 * gente mandando outra coisa no canal) devolve `null` — nunca lança, nunca
 * manda lixo para a tela.
 */
export function decodeMsg(raw: unknown): Msg | null {
  if (typeof raw !== 'string') return null;
  let m: {
    t?: unknown;
    v?: unknown;
    id?: unknown;
    d?: unknown;
    w?: unknown;
    z?: unknown;
    p?: unknown;
    s?: unknown;
    a?: unknown;
    c?: unknown;
    f?: unknown;
  };
  try {
    m = JSON.parse(raw) as typeof m;
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || m.v !== MIRROR_VERSION) return null;
  if (m.t === 'hello') return { kind: 'hello', id: typeof m.id === 'string' ? m.id : '' };
  if (m.t === 'bye') return { kind: 'bye' };
  if (m.t !== 'state') return null;

  const doc = typeof m.d === 'string' ? decodeDoc(m.d) : null;
  if (!doc) return null;
  const pan = Array.isArray(m.p) && m.p.length === 2
    ? { x: num(m.p[0], -1e4, 1e4, 0), y: num(m.p[1], -1e4, 1e4, 0) }
    : { x: 0, y: 0 };
  const sel = typeof m.s === 'string' && /^(comp|wire):.+/.test(m.s)
    ? ({ kind: m.s.slice(0, m.s.indexOf(':')), id: m.s.slice(m.s.indexOf(':') + 1) } as Selection)
    : null;
  return {
    kind: 'state',
    state: {
      doc,
      view: m.w === '3d' ? '3d' : '2d',
      zoom: num(m.z, 1, 4, 1),
      pan,
      sel,
      placing: typeof m.a === 'string' && KINDS[m.a] ? (m.a as CompKind) : null,
      colorByVoltage: m.c === 1,
      flow: m.f === 1,
    },
  };
}
