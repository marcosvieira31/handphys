export type HandSide = 'right' | 'left';

/** O que o classificador entrega quadro a quadro => nosso lado. */
export const sideOfLabel = (label: string): HandSide => (/^\s*l/i.test(label) ? 'left' : 'right');

/** Amostras que valem no voto (~1,3 s a 15 Hz: acompanha mão que vira de lado). */
const WINDOW = 20;

/**
 * Qual é a mão DE VERDADE (direita/esquerda) de um id estável.
 *
 * O classificador do MediaPipe devolve Left/Right QUADRO A QUADRO e oscila —
 * é justamente por isso que a identidade aqui é o centroide e não o rótulo.
 * Mas para o professor escolher "só a mão direita comanda" a gente precisa de
 * um lado confiável: então VOTAMOS as últimas amostras daquele id. Empate
 * decide o mais recente (mão que acabou de virar de lado).
 */
export class SideVote {
  private hist = new Map<string, HandSide[]>();

  /** Registra uma amostra e devolve o lado vigente do id. */
  add(id: string, label: string): HandSide {
    const s = sideOfLabel(label);
    const h = this.hist.get(id) ?? [];
    h.push(s);
    if (h.length > WINDOW) h.shift();
    this.hist.set(id, h);
    return this.of(id) ?? s;
  }

  /** Lado vigente do id (null = ainda não visto). */
  of(id: string): HandSide | null {
    const h = this.hist.get(id);
    if (!h || !h.length) return null;
    let right = 0;
    for (const s of h) if (s === 'right') right++;
    const left = h.length - right;
    if (right > left) return 'right';
    if (left > right) return 'left';
    return h[h.length - 1]; // empate: o mais recente
  }

  /** Mão sumiu: esquece o voto (a que voltar pode ser outra). */
  forget(id: string): void {
    this.hist.delete(id);
  }

  clear(): void {
    this.hist.clear();
  }
}
