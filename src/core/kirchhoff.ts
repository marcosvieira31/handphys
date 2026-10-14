import type { CompKind, Reading } from './netlist';

/**
 * LEI DE KIRCHHOFF POR NÓ — a leitura da estação.
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
