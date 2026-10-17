import { KIND_LABEL } from '../core/kinds';
import type { CircuitDoc, Placed, Reading } from '../core/netlist';

/** Cabeçalho do CSV (12 colunas). */
export const CSV_HEAD =
  'id;componente;valor;unidade;pos_x;pos_y;rotacao;estado;tensao_V;corrente_A;no_a;no_b';

/**
 * Número em vírgula decimal (pt-BR), arredondado em 6 casas: 0.45 → "0,45",
 * 9 → "9", 1e-12 → "0". O Excel pt-BR lê vírgula como decimal; ponto ele
 * confunde com separador de milhar.
 */
function num(v: number): string {
  return String(Number(v.toFixed(6))).replace('.', ',');
}

/** Valor + unidade em colunas separadas (mesma conversão da etiqueta do símbolo). */
function valueUnit(c: Placed): { n: string; u: string } {
  switch (c.kind) {
    case 'vsource':
      return { n: num(c.value), u: 'V' };
    case 'resistor':
    case 'lamp':
      return { n: num(c.value), u: 'Ω' };
    case 'capacitor':
      return c.value >= 1e-3
        ? { n: num(c.value * 1e3), u: 'mF' }
        : { n: num(c.value * 1e6), u: 'µF' };
    default:
      return { n: '—', u: '—' }; // chave e terra não têm valor
  }
}

/**
 * Relatório CSV do circuito atual (modo professor): uma linha por componente
 * com valor, leitura do solver e nós. Separador `;` + vírgula decimal + CRLF:
 * abre direto no Excel/LibreOffice pt-BR (o `Ω`/`µF` do texto não quebra a
 * separação, que a vírgula faria).
 *
 * As leituras são exatamente as da tela: a chave fechada é um curto ideal
 * (0 V entre os terminais — terminais no MESMO nó) e o solver não a tem como
 * incógnita, então a coluna `corrente_A` dela é 0 como no painel; quem
 * conduz aparece na lâmpada/resistores da série.
 */
export function csvReport(doc: CircuitDoc, reading: Reading): string {
  const byId = new Map(reading.comps.map((r) => [r.id, r]));
  const rows = doc.comps.map((c) => {
    const r = byId.get(c.id);
    const { n, u } = valueUnit(c);
    const estado = c.kind === 'switch' ? (c.closed ? 'fechada' : 'aberta') : '—';
    return [
      c.id,
      KIND_LABEL[c.kind],
      n,
      u,
      String(c.x),
      String(c.y),
      String(c.rot),
      estado,
      r ? num(r.volts) : '—',
      r ? num(r.amps) : '—',
      r?.netA ?? '—',
      r?.netB ?? '—',
    ].join(';');
  });
  return `${CSV_HEAD}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`;
}

/** Data do arquivo no nome (ISO só com o dia, sem `:` no nome de arquivo). */
const data = (): string => new Date().toISOString().slice(0, 10);

/** Descida comum dos dois relatórios: Blob + `<a download>`, tudo local. */
function baixa(nome: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // solta a memória depois de o download começar (navegador antigo engasga
  // se revogar no mesmo tick)
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Baixa o CSV do circuito (Blob + `<a download>`; nada sai do navegador). */
export function downloadCsv(doc: CircuitDoc, reading: Reading): void {
  const text = `\uFEFF${csvReport(doc, reading)}`; // BOM: o Excel reconhece o UTF-8
  baixa(`handphys-circuito-${data()}.csv`, text, 'text/csv;charset=utf-8');
}

/** Resumo do desafio no relatório JSON (mesmo veredito da tela). */
export interface DesafioRel {
  id: string;
  titulo: string;
  ok: boolean;
  /** Dica quando reprovado (`null` quando aprovado ou sem dica). */
  dica: string | null;
}

/** Número de relatório JSON: só tira a poeira do float (9 casas), sem vírgula. */
const bruto = (v: number): number => Number(v.toFixed(9));

/** Valor em SI puro (prefixos só na etiqueta da tela, nunca aqui). */
function valueSi(c: Placed): { valor: number | null; unidade: string | null } {
  switch (c.kind) {
    case 'vsource':
      return { valor: c.value, unidade: 'V' };
    case 'resistor':
    case 'lamp':
      return { valor: c.value, unidade: 'Ω' };
    case 'capacitor':
      return { valor: c.value, unidade: 'F' };
    default:
      return { valor: null, unidade: null }; // chave e terra não têm valor
  }
}

/**
 * Relatório JSON do circuito atual (o MESMO do CSV, em forma que a máquina
 * lê): o circuito CRU (`componentes` + `fios` — reconstrói a montagem, coisa
 * que o CSV não faz), as leituras do solver por componente, as tensões de nó,
 * o veredito do desafio (se houver) e os diagnósticos. Números em SI; o
 * arredondamento em 9 casas só tira a poeira do float (4.50000000001 ⇒ 4.5) e
 * mantém o mesmo número que a tela mostra.
 */
export function jsonReport(
  doc: CircuitDoc,
  reading: Reading,
  desafio: DesafioRel | null = null,
): string {
  const byId = new Map(reading.comps.map((r) => [r.id, r]));
  const rel = {
    schema: 'handphys-relatorio-1',
    geradoEm: new Date().toISOString(),
    circuito: { componentes: doc.comps, fios: doc.wires },
    leituras: doc.comps.map((c) => {
      const r = byId.get(c.id);
      const { valor, unidade } = valueSi(c);
      return {
        id: c.id,
        componente: KIND_LABEL[c.kind],
        valor,
        unidade,
        estado: c.kind === 'switch' ? (c.closed ? 'fechada' : 'aberta') : null,
        tensao_V: r ? bruto(r.volts) : null,
        corrente_A: r ? bruto(r.amps) : null,
        no_a: r?.netA ?? null,
        no_b: r?.netB ?? null,
      };
    }),
    nos: reading.nodes.map((n) => ({ no: n.net, tensao_V: bruto(n.volts) })),
    desafio,
    erros: { solver: reading.error, diagnosticos: reading.diagnostics },
  };
  return JSON.stringify(rel, null, 2);
}

/** Baixa o JSON do circuito (mesma descida do CSV; nada sai do navegador). */
export function downloadJson(
  doc: CircuitDoc,
  reading: Reading,
  desafio: DesafioRel | null = null,
): void {
  baixa(
    `handphys-circuito-${data()}.json`,
    jsonReport(doc, reading, desafio),
    'application/json;charset=utf-8',
  );
}
