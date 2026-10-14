import type { CompKind, CompReading, Reading } from './netlist';

/**
 * 1ª LEI DE KIRCHHOFF, POR NÓ — metade da estação (a outra metade é as
 * malhas, mais embaixo neste arquivo).
 *
 * Para cada nó, quanto de corrente entra, quanto sai e por QUAL RAMO, de modo
 * que o aluno confere a conta na tela: Σ(entram) − Σ(saem) = 0. É o mesmo
 * solver de sempre, só reorganizado pelo nó — a lei vale por CONSTRUÇÃO (é o
 * que o solver impõe em cada nó para achar o circuito), então o valor da
 * estação está em LER, não em descobrir. Daí a soma nunca vir "errada": ela
 * flutua em ~1e-16 por causa de ponto flutuante, e é só o que a folga
 * `KCL_TOL` cobre.
 *
 * O sentido de um ramo é relativo AQUELE nó: a corrente do componente anda de
 * `netA` para `netB` quando `amps > 0` (a fonte também — positivo é ela
 * entregando), então o MESMO ramo é "sai" num nó e "entra" no outro. É o sinal
 * que a exibição de V/I mantém (decisão registrada no PLANO) aparecendo com
 * serviço por aqui.
 */
export interface Ramo {
  id: string;
  kind: CompKind;
  /** Módulo da corrente no ramo, em amperes (o sinal virou o `sentido`). */
  amps: number;
  /**
   * Relativo ESTE nó: `entra`, `sai`, ou `null` quando não há corrente — ramo
   * parado não tem lado, e dizer "entra 0 mA" ensinaria errado.
   */
  sentido: 'entra' | 'sai' | null;
}

export interface NoKirchhoff {
  net: string;
  /** Ramos ligados ao nó, na ordem do documento (mesma ordem da tabela V/I). */
  ramos: Ramo[];
  /** Σ das correntes que entram, em amperes. */
  entram: number;
  /** Σ das correntes que saem, em amperes. */
  saem: number;
  /** entram − saem: a lei cobrando a conta (≈ 0; a folga é só de float). */
  soma: number;
}

/**
 * Folga da soma. O solver é exato, mas 0,09 + 0,09 − 0,18 não dá zero bit a
 * bit — e um nó com corrente de nanoampère tem de ler zero, não 1e-17.
 */
export const KCL_TOL = 1e-9;

/**
 * Leitura por nó. Devolve só os nós de verdade (dois ramos ou mais): com um
 * ramo só a lei vale sozinha ("entra = sai" é a mesma corrente), não há
 * junção para a turma conferir.
 *
 * Sem solução (`reading.error`) não há conta nenhuma — a seção some e o aviso
 * de erro do painel já está em cima, vermelho.
 */
export function porNo(reading: Reading): NoKirchhoff[] {
  if (reading.error) return [];

  const porNet = new Map<string, Ramo[]>();
  const poe = (net: string, ramo: Ramo) => {
    const l = porNet.get(net);
    if (l) l.push(ramo);
    else porNet.set(net, [ramo]);
  };

  for (const c of reading.comps) {
    // terra tem um terminal só (não é ramo); e ramo curtocado — `netA` igual a
    // `netB` — é componente derrubado pelo solver: os dois "ramos" seriam o
    // mesmo nó com a mesma corrente, inflando a junção de ninguém.
    if (c.netB === null || c.netA === c.netB) continue;
    const zero = Math.abs(c.amps) <= KCL_TOL;
    const saiDe = c.amps >= 0 ? c.netA : c.netB;
    const entraEm = c.amps >= 0 ? c.netB : c.netA;
    const base = { id: c.id, kind: c.kind, amps: Math.abs(c.amps) };
    poe(saiDe, { ...base, sentido: zero ? null : 'sai' });
    poe(entraEm, { ...base, sentido: zero ? null : 'entra' });
  }

  const out: NoKirchhoff[] = [];
  // mesma ordem da tabela de tensão dos nós (GND primeiro, depois N1, N2…)
  for (const { net } of reading.nodes) {
    const ramos = porNet.get(net);
    if (!ramos || ramos.length < 2) continue;
    let entram = 0;
    let saem = 0;
    for (const r of ramos) {
      if (r.sentido === 'entra') entram += r.amps;
      else if (r.sentido === 'sai') saem += r.amps;
    }
    out.push({ net, ramos, entram, saem, soma: entram - saem });
  }
  return out;
}

/** A soma fecha (dentro da folga de float) — é o que o selo verde usa. */
export const fechaConta = (soma: number): boolean => Math.abs(soma) <= KCL_TOL;

/* ==========================================================================
 * 2ª LEI DE KIRCHHOFF — tensão ao redor das MALHAS
 * ========================================================================== */

export interface Passo {
  id: string;
  kind: CompKind;
  /** De qual nó o percurso sai… */
  de: string;
  /** …e para qual nó ele entra. */
  para: string;
  /**
   * Variação da tensão DE `de` PARA `para`: positivo = sobe, negativo = cai.
   * O módulo é sempre a leitura do painel para aquele componente (|V(a)−V(b)|
   * não muda quando os terminais trocam de lado) — o que muda é o sinal que a
   * volta dá, e é ele que o aluno confere com a seta do percurso.
   */
  dv: number;
}

export interface Malha {
  /** Elementos na ordem do percurso — o último volta ao primeiro nó. */
  passos: Passo[];
  /** Σ dv ao redor da volta: zero por construção (a lei valendo, não erro). */
  soma: number;
}

/**
 * Base de MALHAS INDEPENDENTES do circuito: uma volta para cada aresta que
 * não entrou na árvore de ligação — isso é E − V + C de grafos, a MESMA base
 * que a análise de malhas usa na escola (o número de voltas independentes,
 * não todas as voltas que o desenho deixa imaginar).
 *
 * Cada volta sai de `GND` quando passa por ele, e o sentido é escolhido para
 * atravessar a fonte do − para o + (o jeito do livro começar a conta): assim a
 * leitura vira `+EMF` na fonte e quedas negativas nos cargas — os MESMOS
 * números do painel, com o sinal da volta em cima.
 *
 * Assim como a 1ª lei, o Σ é zero POR CONSTRUÇÃO: o solver acha tensões de
 * nó, e volta fechada fechá por definição. O valor da estação é ler.
 */
export function malhas(reading: Reading): Malha[] {
  if (reading.error) return []; // sem solução não há volta para conferir

  interface Aresta {
    c: CompReading;
    u: string;
    v: string;
  }
  const arestas: Aresta[] = [];
  for (const c of reading.comps) {
    // mesma peneira da 1ª lei: terra tem um terminal só; ramo curto é o mesmo
    // nó dos dois lados (derrubado pelo solver) e não é volta nenhuma.
    if (c.netB === null || c.netA === c.netB) continue;
    arestas.push({ c, u: c.netA, v: c.netB });
  }

  // união por raiz: a aresta que liga ilhas diferentes vira árvore; a que não
  // liga fecha uma malha independente.
  const raiz = new Map<string, string>();
  const acha = (x: string): string => {
    let r = x;
    while (raiz.has(r) && raiz.get(r) !== r) r = raiz.get(r)!;
    return r;
  };
  const une = (a: string, b: string): boolean => {
    const ra = acha(a);
    const rb = acha(b);
    if (ra === rb) return false;
    raiz.set(ra, rb);
    return true;
  };
  const arvore: number[] = [];
  const cruzes: number[] = [];
  for (let i = 0; i < arestas.length; i++) {
    const e = arestas[i];
    if (!raiz.has(e.u)) raiz.set(e.u, e.u);
    if (!raiz.has(e.v)) raiz.set(e.v, e.v);
    if (une(e.u, e.v)) arvore.push(i);
    else cruzes.push(i);
  }

  interface Bruto {
    idx: number;
    dir: 1 | -1;
  }
  const poe = (m: Map<string, number[]>, k: string, v: number) => {
    const l = m.get(k);
    if (l) l.push(v);
    else m.set(k, [v]);
  };
  const vizinho = new Map<string, number[]>();
  for (const i of arvore) {
    poe(vizinho, arestas[i].u, i);
    poe(vizinho, arestas[i].v, i);
  }

  /** Caminho de `de` até `ate` só na árvore, com o sentido de cada trecho. */
  const caminho = (de: string, ate: string): Bruto[] | null => {
    const veio = new Map<string, { de: string; idx: number; dir: 1 | -1 }>();
    const fila = [de];
    const visto = new Set<string>([de]);
    for (let h = 0; h < fila.length && !visto.has(ate); h++) {
      for (const idx of vizinho.get(fila[h]) ?? []) {
        const e = arestas[idx];
        const outro = e.u === fila[h] ? e.v : e.u;
        if (visto.has(outro)) continue;
        visto.add(outro);
        veio.set(outro, { de: fila[h], idx, dir: e.u === fila[h] ? 1 : -1 });
        fila.push(outro);
      }
    }
    if (!visto.has(ate)) return null;
    const passos: Bruto[] = [];
    let atual = ate;
    while (atual !== de) {
      const a = veio.get(atual);
      if (!a) return null;
      passos.push({ idx: a.idx, dir: a.dir });
      atual = a.de;
    }
    return passos.reverse();
  };

  const volt = new Map<string, number>();
  for (const n of reading.nodes) volt.set(n.net, n.volts);

  const saida: Malha[] = [];
  for (const i of cruzes) {
    const fecho = arestas[i];
    const meio = caminho(fecho.u, fecho.v);
    if (!meio) continue; // ilhas diferentes não fecham volta (não acontece)
    // vai do u ao v pela árvore e fecha voltando do v ao u (dir −1 = v→u)
    let bruto: Bruto[] = [...meio, { idx: i, dir: -1 }];

    // sentido: a fonte atravessada do − para o +; sem fonte na volta, a
    // primeira aresta no sentido a→b (arbitrário, mas sempre o mesmo).
    const fonte = bruto.find((p) => arestas[p.idx].c.kind === 'vsource');
    const aoContrario = fonte ? fonte.dir === -1 : bruto[0]?.dir === -1;
    if (aoContrario)
      bruto = [...bruto].reverse().map((p): Bruto => ({ idx: p.idx, dir: p.dir === 1 ? -1 : 1 }));

    // começa em GND quando a volta passa por ele (é ali que o aluno está);
    // rotacionar muda o nó de partida, não os sentidos.
    const ini = bruto.findIndex(
      (p) => (p.dir === 1 ? arestas[p.idx].u : arestas[p.idx].v) === reading.gnd,
    );
    if (ini > 0) bruto = [...bruto.slice(ini), ...bruto.slice(0, ini)];

    const passos: Passo[] = bruto.map((p) => {
      const e = arestas[p.idx];
      const de = p.dir === 1 ? e.u : e.v;
      const para = p.dir === 1 ? e.v : e.u;
      return { id: e.c.id, kind: e.c.kind, de, para, dv: (volt.get(para) ?? 0) - (volt.get(de) ?? 0) };
    });
    saida.push({ passos, soma: passos.reduce((s, p) => s + p.dv, 0) });
  }
  return saida;
}
