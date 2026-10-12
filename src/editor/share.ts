/**
 * Circuito num LINK — Fase 4 (salvar/share por URL + QR na telona).
 *
 * O documento inteiro vira um payload curto e URL-safe em `?c=...`: sem
 * servidor, sem arquivo, sem login. O professor mostra o QR e a turma abre o
 * mesmo circuito (no editor do PC ou no viewer do celular).
 *
 * Formato — JSON compacto, depois base64url:
 *   { v:1, c:[[tipo,x,y,giro(0..3),valor,aux?,fechada?], ...],
 *           w:[[x1,y1,x2,y2], ...] }
 *
 * Os ids NÃO viajam pelo link: vêm de fora, não são de confiança e ninguém os
 * vê — são regenerados na abertura (bat1, r1, w1…). E isto é puro e
 * defensivo: link podro devolve `null`, nunca lança erro para a tela.
 */

import type { CircuitDoc, CompKind, Placed, Rot, Wire } from '../core/netlist';
import { ID_PREFIX, useEditor } from './store';

/** Versão do payload: muda o formato, o link antigo passa a ser recusado. */
export const SHARE_VERSION = 1;

const MAX_COMPS = 200;
const MAX_WIRES = 400;
const MAX_CELL = 29; // quadro 30×30 (0..29)
const MAX_VALUE = 1e12;

const KIND_CODE: Record<CompKind, string> = {
  vsource: 'V',
  resistor: 'R',
  capacitor: 'C',
  lamp: 'L',
  switch: 'S',
  ground: 'G',
};

const CODE_KIND: Record<string, CompKind> = {
  V: 'vsource',
  R: 'resistor',
  C: 'capacitor',
  L: 'lamp',
  S: 'switch',
  G: 'ground',
};

type Tuple = (string | number)[];

const isCell = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_CELL;

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/* ------------------------------------------------------------------ */
/* base64url                                                           */
/* ------------------------------------------------------------------ */

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  // fatal: byte que não é UTF-8 válido derruba aqui (vira `null` lá embaixo)
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/* ------------------------------------------------------------------ */
/* codificar / decodificar                                              */
/* ------------------------------------------------------------------ */

export function encodeDoc(doc: CircuitDoc): string {
  const comps: Tuple[] = [];
  for (const c of doc.comps) {
    const code = KIND_CODE[c.kind];
    if (!code) continue; // tipo que nem existe: não corrompe o link inteiro
    const t: Tuple = [
      code,
      c.x,
      c.y,
      Math.round(c.rot / 90),
      isNum(c.value) && c.value >= 0 && c.value <= MAX_VALUE ? c.value : 0,
    ];
    const aux = isNum(c.aux) && c.aux > 0 ? c.aux : 0;
    if (aux > 0 || c.closed) t.push(aux, c.closed ? 1 : 0);
    comps.push(t);
  }
  const wires: Tuple[] = doc.wires.map((w) => [w.from.x, w.from.y, w.to.x, w.to.y]);
  return toBase64Url(JSON.stringify({ v: SHARE_VERSION, c: comps, w: wires }));
}

export function decodeDoc(payload: string): CircuitDoc | null {
  try {
    const raw: unknown = JSON.parse(fromBase64Url(payload));
    if (!raw || typeof raw !== 'object') return null;
    const p = raw as { v?: unknown; c?: unknown; w?: unknown };
    if (p.v !== SHARE_VERSION || !Array.isArray(p.c) || !Array.isArray(p.w)) return null;
    if (p.c.length > MAX_COMPS || p.w.length > MAX_WIRES) return null;

    const comps: Placed[] = [];
    for (const item of p.c) {
      if (!Array.isArray(item) || item.length < 5) return null;
      const [code, x, y, rot, value, aux, closed] = item as unknown[];
      const kind = isNum(code) ? undefined : CODE_KIND[code as string];
      if (!kind || !isCell(x) || !isCell(y)) return null;
      if (typeof rot !== 'number' || !Number.isInteger(rot) || rot < 0 || rot > 3) return null;
      if (!isNum(value) || value < 0 || value > MAX_VALUE) return null;
      const comp: Placed = { id: '', kind, x, y, rot: (rot * 90) as Rot, value };
      if (isNum(aux) && aux > 0) comp.aux = aux;
      if (closed === 1) comp.closed = true;
      comps.push(comp);
    }

    const wires: Wire[] = [];
    for (const item of p.w) {
      if (!Array.isArray(item) || item.length !== 4) return null;
      const [x1, y1, x2, y2] = item as unknown[];
      if (!isCell(x1) || !isCell(y1) || !isCell(x2) || !isCell(y2)) return null;
      wires.push({ id: '', from: { x: x1, y: y1 }, to: { x: x2, y: y2 } });
    }

    return withFreshIds({ comps, wires });
  } catch {
    return null;
  }
}

/** Ids novos, no mesmo esquema do editor (vêm do link: não são de confiança). */
function withFreshIds(doc: { comps: Placed[]; wires: Wire[] }): CircuitDoc {
  const n = new Map<string, number>();
  const next = (k: string) => {
    const v = (n.get(k) ?? 0) + 1;
    n.set(k, v);
    return v;
  };
  return {
    comps: doc.comps.map((c) => ({ ...c, id: `${ID_PREFIX[c.kind]}${next(c.kind)}` })),
    wires: doc.wires.map((w) => ({ ...w, id: `w${next('w')}` })),
  };
}

/* ------------------------------------------------------------------ */
/* URL                                                                  */
/* ------------------------------------------------------------------ */

function pageBase(): string {
  if (typeof location === 'undefined') return '';
  return `${location.origin}${location.pathname}`;
}

/** Link do circuito a partir da página atual (editor.html?c=...). */
export function shareUrl(doc: CircuitDoc, base?: string): string {
  return `${base ?? pageBase()}?c=${encodeDoc(doc)}`;
}

/** Mesmo link, apontando para outro arquivo (editor ↔ viewer ↔ espelho). */
export function swapPage(url: string, page: 'editor.html' | 'cardboard.html' | 'mirror.html'): string {
  return url.replace(/\/(editor|cardboard|mirror)\.html/, `/${page}`);
}

/** O payload `?c=` da query (ou null se não veio link de circuito). */
export function sharePayload(search: string): string | null {
  const m = /[?&]c=([^&#]+)/.exec(search);
  return m ? m[1] : null;
}

/**
 * Abre a página já com o circuito do link: editor E espelho usam. Tem que
 * rodar ANTES do React montar, senão a tela pisca vazia e o professor vê o
 * quadro em branco por um frame.
 */
export function bootFromLink(): 'none' | 'ok' | 'bad' {
  const payload = sharePayload(location.search);
  if (!payload) return 'none';
  const doc = decodeDoc(payload);
  if (!doc) return 'bad';
  useEditor.setState({ doc });
  return 'ok';
}
