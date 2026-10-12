import type { CircuitDoc, CompKind, Placed, Reading } from '../core/netlist';

/** Rótulos do relatório (mesmos do Inspector e do espelho). */
const KIND_LABEL: Record<CompKind, string> = {
  vsource: 'Fonte',
  resistor: 'Resistor',
  capacitor: 'Capacitor',
  lamp: 'Lâmpada',
  switch: 'Chave',
  ground: 'Terra',
};

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

/** Baixa o CSV do circuito (Blob + `<a download>`; nada sai do navegador). */
export function downloadCsv(doc: CircuitDoc, reading: Reading): void {
  const text = `\uFEFF${csvReport(doc, reading)}`; // BOM: o Excel reconhece o UTF-8
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `handphys-circuito-${new Date().toISOString().slice(0, 10)}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // solta a memória depois de o download começar (navegador antigo engasga
  // se revogar no mesmo tick)
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
