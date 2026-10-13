import { ptKey, terminalCount, terminalPos, wireRoute, type CircuitDoc, type Pt, type Reading } from './netlist';

/**
 * Corrente elétrica na GEOMETRIA do desenho: para cada trecho de fio, quanto
 * de corrente passa ali e para que lado. É o MESMO número do solver
 * (`readCircuit`), distribuído na malha — os terminais injetam a corrente do
 * componente (sentido a → b quando amps > 0, uniforme em fonte/resistidor/
 * capacitor) e um passeio em árvore acomoda nos fios com KCL exata em cada
 * célula. Serve para animar a corrente nos fios (2D e 3D).
 *
 * Regras de conexão iguais às do netlist: ponta de fio ou terminal encostado
 * NO MEIO de outro fio vira junção (o traçado é partido ali, como o
 * `strictlyOnSegment` do solver faz); a chave fechada liga os dois terminais
 * com uma aresta LIVRE (o solver não a tem como incógnita — o curto conduz);
 * fio sem corrente (circuito aberto) fica de fora do mapa.
 */

/** Um trecho de fio com corrente uniforme (um fio vira 2+ onde há junção). */
export interface FlowPart {
  /** Células do traçado, na ordem da rota do fio (from → to). */
  pts: Pt[];
  /** Corrente do trecho em amperes; positivo = no sentido da rota. */
  amps: number;
}

/** id do fio => trechos COM corrente (fios apagados não entram). */
export type FlowMap = Map<string, FlowPart[]>;

/** Correntes abaixo disso contam como zero (lixo do solver em circuito aberto). */
const EPS = 1e-9;

/** Ponto estritamente DENTRO do segmento ortogonal a→b (igual ao do netlist). */
function strictlyInside(p: Pt, a: Pt, b: Pt): boolean {
  if (a.y === b.y && a.y === p.y) return p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x);
  if (a.x === b.x && a.x === p.x) return p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y);
  return false;
}

/**
 * Corrente por trecho de cada fio. `reading` é o do MESMO doc (o painel).
 * Fios com corrente nula não aparecem no mapa.
 */
export function computeFlow(doc: CircuitDoc, reading: Reading): FlowMap {
  // --- âncoras (terminais + pontas de fio): onde o solver permite junção ---
  const anchors: Pt[] = [];
  for (const c of doc.comps) {
    const n = terminalCount(c.kind);
    for (let i = 0; i < n; i++) anchors.push(terminalPos(c, i as 0 | 1));
  }
  for (const w of doc.wires) {
    anchors.push(w.from);
    anchors.push(w.to);
  }

  // --- grafo: arestas = sub-traços de fio, na ordem da rota de cada fio ---
  type Seg = { u: string; v: string; pu: Pt; pv: Pt; wire: string | null };
  const segs: Seg[] = [];
  const perWire = new Map<string, number[]>();
  const adj = new Map<string, number[]>(); // célula => índices de arestas
  const pushInto = <K, V>(m: Map<K, V[]>, k: K): V[] => {
    let l = m.get(k);
    if (!l) m.set(k, (l = []));
    return l;
  };
  const link = (u: string, v: string, pu: Pt, pv: Pt, wire: string | null): void => {
    const si = segs.push({ u, v, pu, pv, wire }) - 1;
    if (wire) pushInto(perWire, wire).push(si);
    pushInto(adj, u).push(si);
    pushInto(adj, v).push(si);
  };

  for (const w of doc.wires) {
    const route = wireRoute(doc, w);
    for (let i = 0; i + 1 < route.length; i++) {
      const a = route[i];
      const b = route[i + 1];
      // junções NO MEIO do traçado: âncoras estritamente dentro => parte ali
      const seenInner = new Set<string>();
      const inner = anchors
        .filter((p) => strictlyInside(p, a, b))
        .filter((p) => !seenInner.has(ptKey(p)) && seenInner.add(ptKey(p)) !== undefined)
        .map((p) => ({ ...p }))
        .sort((p, q) => {
          const horiz = a.y === b.y;
          const tp = horiz ? p.x - a.x : p.y - a.y;
          const tq = horiz ? q.x - a.x : q.y - a.y;
          const fwd = horiz ? b.x >= a.x : b.y >= a.y;
          return fwd ? tp - tq : tq - tp;
        });
      let prev = a;
      for (const p of inner) {
        if (p.x !== prev.x || p.y !== prev.y) link(ptKey(prev), ptKey(p), prev, p, w.id);
        prev = p;
      }
      if (prev.x !== b.x || prev.y !== b.y) link(ptKey(prev), ptKey(b), prev, b, w.id);
    }
  }

  // --- injeções: corrente que cada componente entrega na malha de fios ---
  const supply = new Map<string, number>();
  const bump = (p: Pt, dx: number): void => {
    supply.set(ptKey(p), (supply.get(ptKey(p)) ?? 0) + dx);
  };
  const byId = new Map(reading.comps.map((r) => [r.id, r]));
  for (const c of doc.comps) {
    if (terminalCount(c.kind) !== 2) continue;
    const amps = byId.get(c.id)?.amps ?? 0;
    if (amps === 0) continue; // chave aberta/lâmpada sem corrente: nada a injetar
    bump(terminalPos(c, 0), -amps); // corrente ENTRA no fio em b e SAI por a
    bump(terminalPos(c, 1), amps);
  }
  // chave fechada: os dois terminais são o MESMO condutor (aresta livre —
  // serve para a corrente atravessar o curto; não é fio, não vira trecho)
  for (const c of doc.comps) {
    if (c.kind === 'switch' && c.closed) {
      const a = terminalPos(c, 0);
      const b = terminalPos(c, 1);
      link(ptKey(a), ptKey(b), a, b, null);
    }
  }

  // --- fluxo factível: DFS => árvore; sobras sobem para a raiz (KCL exata
  //     em todo vértice; a raiz guarda só o resíduo ~0 do solver) ---
  const flow = new Array<number>(segs.length).fill(0);
  const seen = new Set<string>();
  for (const seed of adj.keys()) {
    if (seen.has(seed)) continue;
    const order: string[] = [];
    const parent = new Map<string, { v: string; seg: number }>();
    const stack = [seed];
    seen.add(seed);
    while (stack.length) {
      const v = stack.pop()!;
      order.push(v);
      for (const si of adj.get(v)!) {
        const s = segs[si];
        const o = s.u === v ? s.v : s.u;
        if (!seen.has(o)) {
          seen.add(o);
          parent.set(o, { v, seg: si });
          stack.push(o);
        }
      }
    }
    // filhos antes dos pais (ordem inversa da visita)
    const excess = new Map<string, number>();
    for (let i = order.length - 1; i >= 0; i--) {
      const v = order[i];
      let e = supply.get(v) ?? 0;
      for (const si of adj.get(v)!) {
        const s = segs[si];
        const o = s.u === v ? s.v : s.u;
        const p = parent.get(o);
        if (p && p.v === v) e += excess.get(o)!; // filho despeja aqui
      }
      excess.set(v, e);
      const p = parent.get(v);
      if (p) flow[p.seg] = segs[p.seg].u === v ? e : -e;
    }
  }

  // --- agrupa sub-traços consecutivos do MESMO fio com a MESMA corrente ---
  const out: FlowMap = new Map();
  for (const [wire, idxs] of perWire) {
    let cur: FlowPart | null = null;
    const flush = (): void => {
      if (cur && Math.abs(cur.amps) > EPS) {
        const list = out.get(wire) ?? [];
        list.push(cur);
        out.set(wire, list);
      }
      cur = null;
    };
    for (const si of idxs) {
      const s = segs[si];
      const amps = flow[si];
      if (amps === 0) {
        flush();
        continue;
      }
      const last = cur?.pts[cur.pts.length - 1];
      const encosta = !!last && last.x === s.pu.x && last.y === s.pu.y;
      if (cur && cur.amps === amps && encosta) cur.pts.push(s.pv);
      else {
        flush();
        cur = { pts: [s.pu, s.pv], amps };
      }
    }
    flush();
  }
  return out;
}

/**
 * Segundos por ciclo da animação: ∝ 1/intensidade — 0,45 A sai piscando
 * (0,4 s), 15 mA ritmo de aula (≈ 3 s), µA vira cunha (12 s). Zero não anima
 * (o chamador nem chama).
 */
export function flowDuration(amps: number): number {
  return Math.min(12, Math.max(0.4, 0.05 / (Math.abs(amps) + 0.002)));
}
