/**
 * ESTAÇÃO RC — carga e descarga do capacitor, constante τ e o "osciloscópio".
 *
 * O motor já tem o transitório (Euler implícito, `simulate` em circuit.ts) e o
 * teste que garante que ele segue V(1 − e^(−t/RC)). O que faltava para a aula
 * era TRAZER isso para a bancada: a curva numa escala que se lê, a constante τ
 * medida como um osciloscópio de verdade mede (o instante dos 63,2% do
 * caminho) e as DUAS experiências do mesmo circuito — com a fonte (CARGA) e
 * com a fonte trocada por um fio (DESCARGA, a 2ª posição da chave comutadora
 * do laboratório) — que no RC de sempre dão o MESMO τ.
 *
 * Por que "trocar a fonte por um fio" e não "abrir a chave": com uma chave
 * simples (SPST) não existe o par carga/descarga do livro. Na topologia
 * clássica (fonte — chave — R — C) abrir a chave não fecha laço nenhum (o
 * capacitor fica carregado e pronto); e na topologia R ∥ C a fonte ideal
 * curto-circuita o resistor, dando τ = 0. Quem resolve isso na bancada de
 * verdade é a chave de DUAS posições: uma liga a fonte, a outra põe um fio no
 * lugar dela — que é exatamente `semFontes`.
 *
 * Tudo aqui é função PURA do documento: nada de estado escondido e nada de
 * relógio. A varredura animada do gráfico é enfeite local de cada tela; o
 * espelho recalcula a MESMA curva do MESMO doc, então a projeção não tem como
 * discordar da bancada (a mesma filosofia da estação de Kirchhoff).
 *
 * A escala do tempo é descoberta, não suposta: a soma das resistências é um
 * LIMITE SUPERIOR do R de Thévenin visto pelo capacitor (R_th ≤ ΣR — paralelo
 * só diminui), então começa-se bem abaixo e dobra-se até a curva assentar.
 * Medido o τ, roda-se uma passada FINA em 4,5 τ: é a janela que o gráfico
 * mostra, e é ela que faz o eixo do tempo cair sempre em "0 … 4,5 τ".
 */

import { simulate, type Capacitor } from './circuit';
import { buildNetlist, readCircuit, type CircuitDoc } from './netlist';

export interface RcCurve {
  /** Tensão do capacitor (sentido a → b) no instante zero. */
  v0: number;
  /** Tensão final do regime permanente da MESMA montagem. */
  vinf: number;
  /** Constante de tempo medida nos 63,2% (s) — `null` sem transitório. */
  tau: number | null;
  /** Janela plotada (s): o maior t da curva. */
  window: number;
  /** Amostras: tempo (s), tensão no capacitor (V), corrente nele (A, a → b). */
  t: number[];
  v: number[];
  i: number[];
}

export interface RcStation {
  /** Capacitor do gráfico (o selecionado, ou o primeiro do documento). */
  capId: string;
  /** Há fonte no circuito? Sem fonte não há carga para mostrar. */
  temFonte: boolean;
  /** Há chave? (a tela sugere fechá-la para carregar) */
  temChave: boolean;
  /** Chave fechada: o capacitor carrega de 0 até o regime da fonte. */
  carga: RcCurve | null;
  /**
   * A fonte TROCADA POR UM FIO (a 2ª posição da chave comutadora do
   * laboratório): o capacitor descarrega pelo caminho que sobrou até o novo
   * regime — zero, no caso do RC de sempre.
   */
  descarga: RcCurve | null;
}

/** Fração de carga em t = τ: 1 − e^(−1) = 63,2% — a marca do osciloscópio. */
export const TAU_FRACAO = 1 - Math.exp(-1);

/** Amostras da busca da janela (grossa — só para achar a escala). */
const PASSOS_BUSCA = 240;
/** Amostras da curva final (fina — é ela que vai para a tela). */
const PASSOS_FINO = 400;
/** "Assentou": a sobra até o regime é 0,5% do salto total. */
const ASSENTOU = 0.005;
/** Quantas dobras, no máximo, até desistir (circuito que não condiciona). */
const MAX_DOBRAS = 40;
/** Teto da janela (s): mais que isso não é aula, é circuito travado. */
const JANELA_MAX = 1e12;

interface Amostra {
  t: number[];
  v: number[];
  i: number[];
}

/** O documento com todas as chaves num estado só (a MESMA montagem, comutada). */
function comChaves(doc: CircuitDoc, closed: boolean): CircuitDoc {
  return {
    ...doc,
    comps: doc.comps.map((c) => (c.kind === 'switch' ? { ...c, closed } : c)),
  };
}

/**
 * O documento com cada FONTE trocada por um fio (uma chave fechada).
 *
 * É a 2ª posição da chave comutadora do laboratório de verdade: a que tira a
 * fonte do laço e fecha o caminho por um fio, deixando o capacitor descarregar
 * pelo resistor que sobrou. Sem isso, um circuito com uma chave simples
 * (SPST) não tem descarga nenhuma: abrir a chave não fecha laço, só deixa o
 * capacitor carregado como está — e é por isso que a bancada escolar usa a
 * chave de duas posições.
 */
export function semFontes(doc: CircuitDoc): CircuitDoc {
  return {
    ...doc,
    comps: doc.comps.map((c) =>
      c.kind === 'vsource' ? { ...c, kind: 'switch' as const, closed: true, value: 0 } : c,
    ),
  };
}

/** Tensão de regime do capacitor (sentido a → b), pela leitura DC de sempre. */
function tensaoDeRegime(doc: CircuitDoc, capId: string): number | null {
  const r = readCircuit(doc);
  if (r.error) return null;
  return r.comps.find((c) => c.id === capId)?.volts ?? null;
}

/** Tensão "carregada" de CADA capacitor — o ponto de partida da descarga. */
function carregado(doc: CircuitDoc): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of readCircuit(doc).comps) {
    if (c.kind === 'capacitor') out[c.id] = c.volts;
  }
  return out;
}

/**
 * O instante em que a tensão cruza `v0 + 63,2%·(vinf − v0)`, interpolado entre
 * as duas amostras que abraçam o cruzamento. É a medida de τ do laboratório —
 * vale para a carga (que sobe) e para a descarga (que desce), porque o alvo
 * está sempre ENTRE v0 e vinf.
 */
export function medirTau(t: number[], v: number[], v0: number, vinf: number): number | null {
  if (Math.abs(vinf - v0) < 1e-12) return null; // sem salto não há caminho de 63,2%
  const alvo = v0 + TAU_FRACAO * (vinf - v0);
  for (let k = 1; k < v.length; k++) {
    const a = v[k - 1] - alvo;
    const b = v[k] - alvo;
    if (a === 0) return t[k - 1];
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      return t[k - 1] + (a / (a - b)) * (t[k] - t[k - 1]);
    }
  }
  return null;
}

/** Roda o transitório e devolve t, v (sentido a → b) e i (a → b) do capacitor. */
function amostrar(
  nl: ReturnType<typeof buildNetlist>,
  cap: { id: string; a: string; b: string },
  initialV: Record<string, number>,
  seconds: number,
  passos: number,
): Amostra | null {
  try {
    const res = simulate(nl.comps, { seconds, dt: seconds / passos, initialV }, nl.grounds);
    const va = res.voltage(cap.a);
    const vb = res.voltage(cap.b);
    return { t: res.t, v: va.map((x, k) => x - vb[k]), i: res.current(cap.id) };
  } catch {
    return null; // sem solução (fonte direto no capacitor, montagem aberta…)
  }
}

const empacotar = (a: Amostra, v0: number, vinf: number, tau: number | null): RcCurve => ({
  v0,
  vinf,
  tau,
  window: a.t[a.t.length - 1],
  t: a.t,
  v: a.v,
  i: a.i,
});

/**
 * Uma curva do capacitor numa montagem fixa: acha a janela em que o transitório
 * assenta, mede o τ e roda a passada fina em 4,5 τ. `null` quando não há o que
 * plotar (capacitor derrubado pelo solver, sem resistência para dar escala, ou
 * circuito sem solução).
 */
function curva(
  doc: CircuitDoc,
  capId: string,
  initialV: Record<string, number>,
  v0: number,
): RcCurve | null {
  const nl = buildNetlist(doc);
  const cap = nl.comps.find((c): c is Capacitor => c.kind === 'capacitor' && c.id === capId);
  if (!cap) return null;
  const vinf = tensaoDeRegime(doc, capId);
  if (vinf === null) return null;

  // sem resistência não há constante de tempo: o capacitor pula pro regime
  let somaR = 0;
  for (const c of nl.comps) if (c.kind === 'resistor') somaR += c.ohms;
  if (!(somaR > 0)) return null;

  const delta = vinf - v0;
  const semSalto = Math.abs(delta) < 1e-12;

  // 1) janela: começa em ΣR·C/64 (≤ τ/64) e dobra até a curva assentar
  let janela = Math.max(somaR * cap.farads, 1e-12) / 64;
  let bruta: Amostra | null = null;
  for (let k = 0; k < MAX_DOBRAS && janela < JANELA_MAX; k++) {
    const r = amostrar(nl, cap, initialV, janela, PASSOS_BUSCA);
    if (!r) return null;
    bruta = r;
    const fim = r.v[r.v.length - 1];
    if (semSalto || Math.abs(fim - vinf) <= ASSENTOU * Math.abs(delta)) break;
    janela *= 2;
  }
  if (!bruta) return null;

  // 2) passada fina na janela de 4,5 τ (a grossa só deu a escala)
  const grosso = medirTau(bruta.t, bruta.v, v0, vinf);
  if (!semSalto && grosso !== null && grosso > 0) {
    const fim = bruta.t[bruta.t.length - 1];
    const fina = amostrar(nl, cap, initialV, Math.min(fim, 4.5 * grosso), PASSOS_FINO);
    if (fina) {
      const tau = medirTau(fina.t, fina.v, v0, vinf) ?? grosso;
      return empacotar(fina, v0, vinf, tau);
    }
  }
  return empacotar(bruta, v0, vinf, semSalto ? null : grosso);
}

/**
 * A estação do documento: qual capacitor plotar e as DUAS experiências do
 * circuito — com a fonte (CARGA) e com a fonte trocada por um fio (DESCARGA).
 * `null` quando não há capacitor na bancada.
 *
 * As duas experiências são canônicas: as chaves entram fechadas nas duas (é o
 * gesto de energizar/descarregar) e o ponto de partida da descarga é o regime
 * que a carga alcança. Num circuito onde cada regime vê um resistor diferente,
 * os dois τ saem diferentes — e a tela mostra os dois, que é a lição.
 */
export function rcStation(doc: CircuitDoc, capId?: string | null): RcStation | null {
  const caps = doc.comps.filter((c) => c.kind === 'capacitor');
  if (!caps.length) return null;
  const id = capId && caps.some((c) => c.id === capId) ? capId : caps[0].id;

  const temFonte = doc.comps.some((c) => c.kind === 'vsource');
  const temChave = doc.comps.some((c) => c.kind === 'switch');
  const fechado = comChaves(doc, true);
  const vCarregado = tensaoDeRegime(fechado, id) ?? 0;

  const carga = curva(fechado, id, {}, 0);
  const descarga = curva(comChaves(semFontes(doc), true), id, carregado(fechado), vCarregado);

  return { capId: id, temFonte, temChave, carga, descarga };
}
