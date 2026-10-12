import qrcode from 'qrcode-generator';

export type Qr = ReturnType<typeof qrcode>;

/**
 * QR do link do circuito (só o editor importa isto — o viewer do celular não
 * carrega a biblioteca).
 *
 * Correção de erro, do mais robusto ao mais capaz: `Q` aguenta foto de telona
 * e luz ruim de sala; se o link não couber, caímos para `M` e `L` (mais
 * capacidade). `typeNumber 0` = o tamanho do QR sai automático.
 */
const LEVELS = ['Q', 'M', 'L'] as const;

export function makeQr(text: string): Qr | null {
  for (const level of LEVELS) {
    try {
      const q = qrcode(0, level);
      q.addData(text, 'Byte');
      q.make();
      return q;
    } catch {
      /* não coube nesse nível: tenta o próximo, que é mais capaz */
    }
  }
  return null;
}

/**
 * Um caminho SVG só (runs horizontais fundidas): 1 elemento pro QR inteiro em
 * vez de um retângulo por módulo — versão 11 já são 3.721 módulos.
 */
export function qrPath(q: Qr): string {
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    let run = 0;
    for (let c = 0; c <= n; c++) {
      const dark = c < n && q.isDark(r, c);
      if (dark) run++;
      else if (run > 0) {
        d += `M${c - run} ${r}h${run}v1h-${run}z`;
        run = 0;
      }
    }
  }
  return d;
}
