/**
 * Modelo do documento de circuito + geração de netlist — Fase 1 (editor).
 *
 * TypeScript puro, sem DOM: o MESMO código alimenta o editor 2D (SVG/React) do
 * desktop, os testes do Vitest e, na Fase 2, a cena3D — a cena só lê posições
 * e o solver recebe exatamente isto.
 *
 * Regras de conexão (as mesmas de um esquemático de verdade):
 *  - terminais e pontas de fio na MESMA coordenada de grade => mesmo nó;
 *  - ponta de fio ou terminal encostado NO MEIO do traço de outro fio => mesmo
 *    nó (junção em T, com ponto na renderização);
 *  - dois fios que apenas se CRUZAM => NÃO conectam (não há ponto de junção);
 *  - chave fechada => une os dois terminais e sai do netlist (é um curto);
 *    chave aberta => simplesmente ausente do netlist (circuito interrompido);
 *  - todos os símbolos de terra => um único nó de referência.
 *
 * Fio é ponto-a-ponto (não referência terminal), o que permite ligar em fios
 * livres, ramificar e continuar o caminho — ao mover/girar componente os fios
 * encostados nele são atualizados junto (ver `reattachWires`).
 */

import { GND, solveDC, type Component, type Solution } from './circuit';

export type CompKind = 'vsource' | 'resistor' | 'capacitor' | 'lamp' | 'switch' | 'ground';
export type Rot = 0 | 90 | 180 | 270;

export interface Pt {
  x: number;
  y: number;
}

export interface Placed {
  id: string;
  kind: CompKind;
  /** Célula de grade do CENTRO do símbolo. */
  x: number;
  y: number;
  rot: Rot;
  /**
   * Valor principal, por tipo:
   * fonte → volts · resistor/lâmpada → ohms · capacitor → farads.
   * (A lâmpada v1 é linear: R constante; a curva IV real entra depois.)
   */
  value: number;
  /** Lâmpada: potência nominal em watts (serve só para o brilho). */
  aux?: number;
  /** Chave: fechada (true) ou aberta (false/padrão). */
  closed?: boolean;
}

export interface Wire {
  id: string;
  from: Pt;
  to: Pt;
}

export interface CircuitDoc {
  comps: Placed[];
  wires: Wire[];
}

export const EMPTY_DOC: CircuitDoc = { comps: [], wires: [] };

/* ------------------------------------------------------------------ */
/* Geometria                                                           */
/* ------------------------------------------------------------------ */

export function rotatePt(v: Pt, rot: Rot): Pt {
  switch (rot) {
    case 0:
      return { x: v.x, y: v.y };
    case 90:
      return { x: -v.y, y: v.x };
    case 180:
      return { x: -v.x, y: -v.y };
    case 270:
      return { x: v.y, y: -v.x };
  }
}

/** Símbolo de 2 terminais ocupa 2 células (terminais em ±1 do centro). */
export function terminalCount(kind: CompKind): 1 | 2 {
  return kind === 'ground' ? 1 : 2;
}

/** Posição em células do terminal `i` (0 = a, 1 = b). */
export function terminalPos(p: Placed, i: 0 | 1): Pt {
  if (p.kind === 'ground') return { x: p.x, y: p.y };
  const local = i === 0 ? { x: -1, y: 0 } : { x: 1, y: 0 };
  const r = rotatePt(local, p.rot);
  return { x: p.x + r.x, y: p.y + r.y };
}

/**
 * Direção "para fora" do terminal: por onde o fio deve sair sem atravessar o
 * próprio corpo do componente. O terra aponta para cima (o símbolo desce).
 */
export function terminalDir(p: Placed, i: 0 | 1): Pt {
  if (p.kind === 'ground') return { x: 0, y: -1 };
  const local = i === 0 ? { x: -1, y: 0 } : { x: 1, y: 0 };
  return rotatePt(local, p.rot);
}

export function samePt(a: Pt, b: Pt): boolean {
  return a.x === b.x && a.y === b.y;
}

export const ptKey = (p: Pt) => `${p.x},${p.y}`;

function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}

function dot(a: Pt, b: Pt): number {
  return a.x * b.x + a.y * b.y;
}

/** Terminais encostados numa célula (pode haver mais de um). */
export function terminalsAt(doc: CircuitDoc, p: Pt): { comp: Placed; terminal: 0 | 1 }[] {
  const out: { comp: Placed; terminal: 0 | 1 }[] = [];
  for (const c of doc.comps) {
    const n = terminalCount(c.kind);
    for (let i = 0; i < n; i++) {
      if (samePt(terminalPos(c, i as 0 | 1), p)) out.push({ comp: c, terminal: i as 0 | 1 });
    }
  }
  return out;
}

export interface NearTerminal {
  comp: Placed;
  terminal: 0 | 1;
  pos: Pt;
  dist: number;
}

/**
 * Terminal mais próximo de uma célula, até `maxDist` (em células).
 * É o "imã" do editor: dispensa acertar o pontinho no pixel — clicar ou
 * soltar PERTO basta. Em empate, vale o primeiro componente do documento.
 */
export function nearestTerminal(doc: CircuitDoc, p: Pt, maxDist: number): NearTerminal | null {
  let best: NearTerminal | null = null;
  for (const c of doc.comps) {
    const n = terminalCount(c.kind);
    for (let i = 0; i < n; i++) {
      const pos = terminalPos(c, i as 0 | 1);
      const dist = Math.hypot(pos.x - p.x, pos.y - p.y);
      if (dist <= maxDist && (!best || dist < best.dist)) {
        best = { comp: c, terminal: i as 0 | 1, pos, dist };
      }
    }
  }
  return best;
}

/**
 * Direção de saída de um fio numa ponta: a do terminal mais alinhado com o
 * destino (se a célula tiver vários terminais) ou `null` para ponta livre.
 */
function exitDir(doc: CircuitDoc, p: Pt, toward: Pt): Pt | null {
  let best: Pt | null = null;
  let bestDot = 0;
  for (const t of terminalsAt(doc, p)) {
    const d = terminalDir(t.comp, t.terminal);
    const score = dot(d, { x: toward.x - p.x, y: toward.y - p.y });
    if (!best || score > bestDot) {
      best = d;
      bestDot = score;
    }
  }
  return best;
}

function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || !samePt(last, p)) out.push(p);
  }
  return out;
}

/** Remove vértices que não mudam a geometria (colineares entre vizinhos). */
function simplify(pts: Pt[]): Pt[] {
  let out = dedupe(pts);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1];
      const b = out[i];
      const c = out[i + 1];
      const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      if (collinear) {
        out = [...out.slice(0, i), ...out.slice(i + 1)];
        changed = true;
      }
    }
  }
  return out;
}

/**
 * Traçado ortogonal de um fio: sai pela direção do terminal, chega pela direção
 * do terminal de destino e faz uma única dobra. Se o destino estiver "atrás" do
 * terminal, contorna pelo lado de fora para não atravessar o próprio corpo.
 * Se o caminho cruzaria terminais ou corpos de OUTROS componentes, desvia por
 * uma faixa paralela livre (até 3 dobras): fio que passa por cima de terminal
 * alheio vira junção fantasma ("curto" sem sentido) — o desvio evita isso.
 * Sem obstáculo, o resultado é bit-idêntico ao traçado de uma dobra só.
 */
export function wireRoute(doc: CircuitDoc, w: Wire): Pt[] {
  const a = w.from;
  const b = w.to;
  const da = exitDir(doc, a, b);
  const db = exitDir(doc, b, a);
  const pa = da ? add(a, da) : a;
  const pb = db ? add(b, db) : b;
  const axis = da ?? db;
  let elbow: Pt;
  if (axis && axis.x !== 0) {
    const forward = dot(da ?? axis, { x: b.x - a.x, y: b.y - a.y }) >= 0;
    elbow = forward ? { x: pb.x, y: pa.y } : { x: pa.x, y: pb.y };
  } else if (axis) {
    const forward = dot(da ?? axis, { x: b.x - a.x, y: b.y - a.y }) >= 0;
    elbow = forward ? { x: pa.x, y: pb.y } : { x: pb.x, y: pa.y };
  } else {
    elbow = { x: b.x, y: a.y };
  }

  // obstáculos: terminais e corpos alheios (nunca as pontas do próprio fio)
  const blocked = new Set<string>();
  for (const c of doc.comps) {
    blocked.add(ptKey({ x: c.x, y: c.y }));
    const n = terminalCount(c.kind);
    for (let i = 0; i < n; i++) blocked.add(ptKey(terminalPos(c, i as 0 | 1)));
  }
  blocked.delete(ptKey(a));
  blocked.delete(ptKey(b));

  /** O miolo (pa..pb) atravessa célula bloqueada? (só o miolo conta) */
  const crosses = (mid: Pt[]): boolean => {
    for (let i = 0; i + 1 < mid.length; i++) {
      const p = mid[i];
      const q = mid[i + 1];
      if (p.x === q.x) {
        for (let y = Math.min(p.y, q.y) + 1; y < Math.max(p.y, q.y); y++) {
          if (blocked.has(ptKey({ x: p.x, y }))) return true;
        }
      } else if (p.y === q.y) {
        for (let x = Math.min(p.x, q.x) + 1; x < Math.max(p.x, q.x); x++) {
          if (blocked.has(ptKey({ x, y: p.y }))) return true;
        }
      }
    }
    return false;
  };

  // candidatos: o traçado legado primeiro (livre => idêntico a antes),
  // depois o outro cotovelo, depois faixas paralelas (por baixo antes:
  // o retorno clássico passa embaixo dos componentes).
  const lane = (v: number) => Math.max(0, Math.min(29, v));
  const seen = new Set<string>();
  const cands: Pt[][] = [];
  const push = (mid: Pt[]) => {
    const k = mid.map((p) => ptKey(p)).join(';');
    if (!seen.has(k)) {
      seen.add(k);
      cands.push(mid);
    }
  };
  push([pa, elbow, pb]);
  push([pa, { x: pb.x, y: pa.y }, pb]);
  push([pa, { x: pa.x, y: pb.y }, pb]);
  // desvio em U: faixa única L (horizontal ou vertical) + pernas até pa/pb
  const hLanes: number[] = [];
  const vLanes: number[] = [];
  for (let k = 1; k <= 6; k++) {
    hLanes.push(lane(pa.y + k), lane(pb.y + k), lane(pa.y - k), lane(pb.y - k));
    vLanes.push(lane(pa.x + k), lane(pb.x + k), lane(pa.x - k), lane(pb.x - k));
  }
  for (const L of hLanes) push([pa, { x: pa.x, y: L }, { x: pb.x, y: L }, pb]);
  for (const L of vLanes) push([pa, { x: L, y: pa.y }, { x: L, y: pb.y }, pb]);
  const mid = cands.find((m) => !crosses(m)) ?? [pa, elbow, pb];
  return simplify([a, ...mid, b]);
}

/** Traçado provisório durante o arraste: da origem até o cursor (ou alvo). */
export function draftRoute(doc: CircuitDoc, from: Pt, to: Pt): Pt[] {
  return wireRoute(doc, { id: '~', from, to });
}

/* ------------------------------------------------------------------ */
/* Netlist                                                             */
/* ------------------------------------------------------------------ */

/** União-find sobre chaves de célula. */
class UF {
  private parent = new Map<string, string>();
  find(k: string): string {
    let r = this.parent.get(k) ?? k;
    while (r !== (this.parent.get(r) ?? r)) r = this.parent.get(r)!;
    this.parent.set(k, r);
    return r;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // raiz "menor" para o resultado ser determinístico
    if (ra < rb) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }
}

/** O ponto está dentro (exclusivo) de um segmento ortogonal da polilinha? */
function strictlyOnSegment(pts: Pt[], p: Pt): boolean {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a.y === b.y && a.y === p.y) {
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (p.x > lo && p.x < hi) return true;
    } else if (a.x === b.x && a.x === p.x) {
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      if (p.y > lo && p.y < hi) return true;
    }
  }
  return false;
}

export interface Netlist {
  /** Componentes prontos para o solver MNA. */
  comps: Component[];
  /** Nós de cada componente colocado, na ordem [a, b]. */
  netByComp: Record<string, [string, string]>;
  /** Todos os nós do documento, com GND primeiro e depois por posição. */
  nets: string[];
  gnd: string;
  /** Componentes sem equivalente no solver (chave, terra, curto interno). */
  dropped: string[];
  /** Avisos que o professor precisa ver (ex.: fonte em curto). */
  diagnostics: string[];
  /** Pontas de fio onde3+ condutores se encontram => ponto de junção. */
  junctions: Pt[];
  /** Nós de referência (um por ilha isolada + o GND principal). */
  grounds: string[];
  /** Nó de uma célula, para colorir fios por tensão (null se célula órfã). */
  netAt(p: Pt): string | null;
}

function compValue(c: Placed): { kind: 'resistor' | 'vsource' | 'capacitor'; value: number } | null {
  switch (c.kind) {
    case 'vsource':
      return { kind: 'vsource', value: c.value };
    case 'resistor':
    case 'lamp':
      return { kind: 'resistor', value: c.value };
    case 'capacitor':
      return { kind: 'capacitor', value: c.value };
    default:
      return null; // terra e chave não viram componente do solver
  }
}

export function buildNetlist(doc: CircuitDoc): Netlist {
  const uf = new UF();
  const routes = new Map<string, Pt[]>();
  const diagnostics: string[] = [];

  // 1) fio: todos os vértices do traçado são o mesmo condutor
  for (const w of doc.wires) {
    const pts = wireRoute(doc, w);
    routes.set(w.id, pts);
    for (let i = 1; i < pts.length; i++) uf.union(ptKey(pts[0]), ptKey(pts[i]));
  }

  // 2) ponta de fio ou terminal encostado NO MEIO de outro fio => mesmo nó
  const anchors: Pt[] = [];
  for (const c of doc.comps) {
    const n = terminalCount(c.kind);
    for (let i = 0; i < n; i++) anchors.push(terminalPos(c, i as 0 | 1));
  }
  for (const w of doc.wires) {
    anchors.push(w.from);
    anchors.push(w.to);
  }
  for (const p of anchors) {
    for (const [id, pts] of routes) {
      if (strictlyOnSegment(pts, p)) uf.union(ptKey(p), ptKey(routes.get(id)![0]));
    }
  }

  // 3) chave fechada: os dois terminais viram um só nó
  for (const c of doc.comps) {
    if (c.kind === 'switch' && c.closed) {
      uf.union(ptKey(terminalPos(c, 0)), ptKey(terminalPos(c, 1)));
    }
  }

  // 4) todo terra é o mesmo nó de referência
  const groundSyms = doc.comps.filter((c) => c.kind === 'ground');
  for (let i = 1; i < groundSyms.length; i++) {
    uf.union(ptKey(terminalPos(groundSyms[0], 0)), ptKey(terminalPos(groundSyms[i], 0)));
  }

  // 5) escolhe a referência: terra explícito > terminal negativo da 1ª fonte
  //    > terminal do 1º componente (rede só com resistores ainda precisa de GND)
  let gndRoot: string | null = null;
  if (groundSyms.length) gndRoot = uf.find(ptKey(terminalPos(groundSyms[0], 0)));
  else {
    const src = doc.comps.find((c) => c.kind === 'vsource');
    const ref = src ?? doc.comps[0];
    if (ref) gndRoot = uf.find(ptKey(terminalPos(ref, 0)));
  }

  // 6) nomeia os nós de forma determinística: GND e depois por posição na grade
  const rootOf = (p: Pt) => uf.find(ptKey(p));
  const rootCoord = new Map<string, Pt>();
  for (const c of doc.comps) {
    const n = terminalCount(c.kind);
    for (let i = 0; i < n; i++) {
      const p = terminalPos(c, i as 0 | 1);
      rootCoord.set(rootOf(p), p);
    }
  }
  const others = [...rootCoord.keys()].filter((r) => r !== gndRoot).sort((r1, r2) => {
    const a = rootCoord.get(r1)!;
    const b = rootCoord.get(r2)!;
    return a.y - b.y || a.x - b.x;
  });
  const nameOf = new Map<string, string>();
  others.forEach((r, i) => nameOf.set(r, `N${i + 1}`));
  if (gndRoot) nameOf.set(gndRoot, GND);
  const netName = (p: Pt) => nameOf.get(rootOf(p)) ?? GND;

  // 7) componentes do solver
  const comps: Component[] = [];
  const netByComp: Record<string, [string, string]> = {};
  const dropped: string[] = [];
  for (const c of doc.comps) {
    const a = netName(terminalPos(c, 0));
    const b = terminalCount(c.kind) === 2 ? netName(terminalPos(c, 1)) : GND;
    netByComp[c.id] = [a, b];
    const v = compValue(c);
    if (!v) {
      dropped.push(c.id);
      continue;
    }
    if (a === b) {
      dropped.push(c.id);
      if (c.kind === 'vsource') {
        diagnostics.push(
          `Fonte "${c.id}" em curto: os dois terminais estão no mesmo nó ` +
            `(um fio liga o + ao −). Corrija antes de medir.`,
        );
      }
      continue;
    }
    if (v.kind === 'resistor' && !(v.value > 0)) {
      dropped.push(c.id);
      diagnostics.push(`"${c.id}": resistência deve ser maior que zero.`);
      continue;
    }
    if (v.kind === 'capacitor' && !(v.value > 0)) {
      dropped.push(c.id);
      diagnostics.push(`"${c.id}": capacitância deve ser maior que zero.`);
      continue;
    }
    if (v.kind === 'resistor') {
      comps.push({ kind: 'resistor', id: c.id, a, b, ohms: v.value });
    } else if (v.kind === 'vsource') {
      comps.push({ kind: 'vsource', id: c.id, a, b, volts: v.value });
    } else {
      comps.push({ kind: 'capacitor', id: c.id, a, b, farads: v.value });
    }
  }

  // 8) parte do circuito totalmente isolada não tem tensão absoluta definida
  //    (só as diferenças são físicas) e deixaria a matriz singular. Cada ilha
  //    ganha o SEU nó de referência (âncora = terminal negativo da fonte da
  //    ilha, ou o nó de menor nome). Assim nada trava no meio de uma montagem
  //    pela metade e as leituras continuam exatas (sem resistências fictícias).
  const gnd = gndRoot ? nameOf.get(gndRoot) ?? GND : GND;
  const grounds: string[] = [gnd];
  if (comps.length) {
    // Ilhas = componentes ligados entre si, agrupados por NÓ. Os nós entram
    // pelo nome (é o que os componentes referenciam), nunca pela chave crua.
    const island = new UF();
    for (const c of comps) island.union(c.a, c.b);
    const anchorByIsland = new Map<string, string>();
    for (const c of comps) {
      if (c.kind !== 'vsource') continue;
      const r = island.find(c.a);
      if (!anchorByIsland.has(r)) anchorByIsland.set(r, c.a); // terminal negativo da fonte
    }
    const netsOfIsland = new Map<string, string[]>();
    for (const net of nameOf.values()) {
      const r = island.find(net);
      const list = netsOfIsland.get(r) ?? [];
      list.push(net);
      netsOfIsland.set(r, list);
    }
    for (const [root, netList] of netsOfIsland) {
      // A ilha que já contém a referência principal não precisa de outra.
      if (netList.includes(gnd)) continue;
      // Âncora = terminal negativo da fonte da ilha, ou o nó de menor nome.
      // Uma ilha sem fonte (só resistores) tem todas as tensões indeterminadas
      // — ancorar UM nó resolve a matriz e deixa os demais soltos, que é
      // exatamente o que a lei de Ohm diz: sem diferença de potencial, sem
      // corrente. Ancorar dois nós de uma ilha sem fonte fingiria uma diferença
      // de potencial que não existe.
      const anchor = anchorByIsland.get(root) ?? [...netList].sort()[0];
      // Sem fonte a diferença de potencial é indeterminada: ancorar UM nó
      // resolve a matriz e deixa os demais soltos — que é o que a lei de Ohm
      // diz (sem diferença de potencial, sem corrente). Ancorar dois nós de
      // uma ilha sem fonte fingiria uma tensão que não existe. E nunca se
      // ancora de novo o GND principal.
      if (anchor !== gnd) grounds.push(anchor);
    }
  }

  const nets: string[] = [gnd, ...others.map((r) => nameOf.get(r)!)]

  /** Nó de uma célula (null quando a célula não pertence a circuito nenhum). */
  const netAt = (p: Pt): string | null => nameOf.get(rootOf(p)) ?? null;

  return {
    comps,
    netByComp,
    nets,
    gnd,
    dropped,
    diagnostics,
    junctions: junctionPoints(doc, routes),
    grounds,
    netAt,
  };
}

/**
 * Onde desenhar o ponto de junção: alguma ponta de fio ou terminal no ponto
 * E3+ condutores se encontrando. Dois fios que apenas se cruzam não contam
 * (ninguém "acaba" ali) — é justamente o que separa cruzamento de junção.
 */
function junctionPoints(doc: CircuitDoc, routes: Map<string, Pt[]>): Pt[] {
  const coord = new Map<string, Pt>();
  const leads = new Map<string, number>();
  const isEnd = new Map<string, boolean>();
  const bump = (p: Pt, n: number, end: boolean) => {
    const k = ptKey(p);
    coord.set(k, p);
    leads.set(k, (leads.get(k) ?? 0) + n);
    if (end) isEnd.set(k, true);
  };

  for (const c of doc.comps) {
    const n = terminalCount(c.kind);
    for (let i = 0; i < n; i++) bump(terminalPos(c, i as 0 | 1), 1, true);
  }
  for (const pts of routes.values()) {
    for (let i = 0; i < pts.length; i++) {
      const end = i === 0 || i === pts.length - 1;
      bump(pts[i], end ? 1 : 2, end);
    }
  }
  // ponta de fio ou terminal encostado no MEIO de outro fio => +2 condutores
  for (const p of [...coord.values()]) {
    for (const pts of routes.values()) {
      if (pts.some((v) => samePt(v, p))) continue;
      if (strictlyOnSegment(pts, p)) bump(p, 2, false);
    }
  }
  return [...coord.values()].filter((p) => isEnd.get(ptKey(p)) && (leads.get(ptKey(p)) ?? 0) >= 3);
}

/* ------------------------------------------------------------------ */
/* Medição                                                             */
/* ------------------------------------------------------------------ */

export interface CompReading {
  id: string;
  kind: CompKind;
  /** Nó do terminal a (e b; null no terra, que tem um só). */
  netA: string;
  netB: string | null;
  /**
   * Tensão sobre o componente, em volts, com o sinal próprio de cada um:
   * resistor/lâmpada/capacitor no sentido a → b; fonte no sentido − → +
   * (assim a fonte mostra +9 V ao invés de −9 V).
   */
  volts: number;
  /**
   * Corrente no componente, em amperes. Para resistores/capacitores é o
   * sentido a → b; para a fonte é a corrente que sai do terminal − e entra no
   * + (ou seja: positivo = entregando energia no circuito).
   */
  amps: number;
  /** Potência |V·I| em watts (para a lâmpada vira brilho). */
  watts: number;
  /** Brilho 0..1,5 da lâmpada (0 nos demais). */
  glow: number;
}

export interface NodeReading {
  net: string;
  volts: number;
}

export interface Reading {
  comps: CompReading[];
  nodes: NodeReading[];
  /** Mensagem de erro do solver (nó flutuante, fontes em conflito…). */
  error: string | null;
  diagnostics: string[];
  gnd: string;
  /** Maior tensão de nó em módulo — escala das cores por tensão. */
  maxVolts: number;
  /** Documento vazio: convém mostrar o convite ao invés de uma tela vazia. */
  empty: boolean;
  /** Nó de uma célula (para colorir fios por tensão); null se a célula é órfã. */
  netAt(p: Pt): string | null;
}

export const EMPTY_READING: Reading = {
  comps: [],
  nodes: [],
  error: null,
  diagnostics: [],
  gnd: GND,
  maxVolts: 0,
  empty: true,
  netAt: () => null,
};

/**
 * Resolve o circuito do documento em regime permanente e devolve leituras por
 * componente e por nó. Erros do solver viram `error` (nunca exceção solta):
 * numa sala de aula o circuito está constantemente pela metade.
 */
export function readCircuit(doc: CircuitDoc): Reading {
  if (!doc.comps.length) return EMPTY_READING;
  const nl = buildNetlist(doc);
  const dropped = new Set(nl.dropped);

  let solution: Solution | null = null;
  let error: string | null = null;
  if (nl.comps.length) {
    try {
      solution = solveDC(nl.comps, nl.grounds);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  // nós que o solver realmente resolveu (referências valem 0 por definição)
  const groundSet = new Set(nl.grounds);
  const known = new Set<string>();
  for (const c of nl.comps) {
    if (!groundSet.has(c.a)) known.add(c.a);
    if (!groundSet.has(c.b)) known.add(c.b);
  }
  const volts = (net: string): number => {
    if (groundSet.has(net) || !solution || !known.has(net)) return 0;
    try {
      return solution.voltage(net);
    } catch {
      return 0;
    }
  };

  const comps: CompReading[] = [];
  let maxVolts = 0;
  for (const c of doc.comps) {
    const [na, nb] = nl.netByComp[c.id];
    const va = volts(na);
    const vb = nb === null ? 0 : volts(nb);
    let amps = 0;
    if (!dropped.has(c.id) && solution) {
      try {
        amps = solution.current(c.id);
      } catch {
        amps = 0;
      }
    }
    const vab = c.kind === 'vsource' ? vb - va : va - vb;
    const watts = Math.abs(vab * amps);
    const nominal = c.kind === 'lamp' ? (c.aux && c.aux > 0 ? c.aux : 1) : 0;
    comps.push({
      id: c.id,
      kind: c.kind,
      netA: na,
      netB: c.kind === 'ground' ? null : nb,
      volts: vab,
      amps,
      watts,
      glow: c.kind === 'lamp' ? Math.min(1.5, watts / nominal) : 0,
    });
  }

  const nodes: NodeReading[] = [];
  for (const net of nl.nets) {
    const v = volts(net);
    nodes.push({ net, volts: v });
    maxVolts = Math.max(maxVolts, Math.abs(v));
  }

  return {
    comps,
    nodes,
    error,
    diagnostics: nl.diagnostics,
    gnd: nl.gnd,
    maxVolts,
    empty: false,
    netAt: nl.netAt,
  };
}

/* ------------------------------------------------------------------ */
/* Mutações do documento (o editor usa exatamente estas)               */
/* ------------------------------------------------------------------ */

export function compAt(doc: CircuitDoc, p: Pt): Placed | null {
  for (const c of doc.comps) {
    if (Math.abs(c.x - p.x) <= 1 && Math.abs(c.y - p.y) <= 1) return c;
  }
  return null;
}

/**
 * Move/gira componente e leva junto os fios encostados nos seus terminais.
 * Se o ponto também pertence a outro componente, o fio fica com ele.
 */
export function reattachWires(doc: CircuitDoc, moved: Placed, before: Pt[]): CircuitDoc {
  const others = doc.comps.filter((c) => c.id !== moved.id);
  const wires = doc.wires.map((w) => {
    let from = w.from;
    let to = w.to;
    for (let i = 0; i < before.length; i++) {
      if (samePt(w.from, before[i]) && exclusiveIn(others, before[i])) from = terminalPos(moved, i as 0 | 1);
      if (samePt(w.to, before[i]) && exclusiveIn(others, before[i])) to = terminalPos(moved, i as 0 | 1);
    }
    return from === w.from && to === w.to ? w : { ...w, from, to };
  });
  return { ...doc, wires };
}

function exclusiveIn(comps: Placed[], p: Pt): boolean {
  for (const c of comps) {
    const n = terminalCount(c.kind);
    for (let i = 0; i < n; i++) if (samePt(terminalPos(c, i as 0 | 1), p)) return false;
  }
  return true;
}

/**
 * Fios que ficariam órfãos ao remover o componente: os que encostam num
 * terminal que NENHUM outro componente reivindica. Fio que encosta num
 * terminal compartilhado continua vivo (o outro componente o segura).
 */
export function wiresAttachedTo(doc: CircuitDoc, comp: Placed): string[] {
  const others = doc.comps.filter((c) => c.id !== comp.id);
  const n = terminalCount(comp.kind);
  const owned: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = terminalPos(comp, i as 0 | 1);
    if (exclusiveIn(others, p)) owned.push(p);
  }
  const out: string[] = [];
  for (const w of doc.wires) {
    if (owned.some((p) => samePt(w.from, p) || samePt(w.to, p))) out.push(w.id);
  }
  return out;
}
