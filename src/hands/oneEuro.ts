/**
 * Filtro One Euro (Géry Casiez et al.): passa-baixa adaptativo — corta o tremor
 * parado sem atrasar o movimento rápido. Sem isso a mão "treme" e o objeto
 * pisca entre agarrado/solto. Um filtro por eixo (x, y) por ponto da mão.
 */
export class LowPassFilter {
  private y: number | null = null;

  filter(x: number, alpha: number): number {
    if (this.y === null) this.y = x;
    else this.y = alpha * x + (1 - alpha) * this.y;
    return this.y;
  }

  get value(): number | null {
    return this.y;
  }
}

export interface OneEuroOptions {
  /** Quadros/s nominais da detecção (webcam típica: 15–30; ajusta sozinho por dt). */
  freq?: number;
  /** Corte mínimo (mão parada): menor = mais estável, mais lerdo. */
  minCutoff?: number;
  /** Quanto o corte abre com a velocidade (compensa o atraso em movimento). */
  beta?: number;
  /** Corte do estimador de derivada. */
  dCutoff?: number;
}

function smoothingAlpha(cutoff: number, rate: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  const te = 1 / rate;
  return 1 / (1 + tau / te);
}

export class OneEuroFilter {
  private readonly nominalFreq: number;
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private readonly xFilter = new LowPassFilter();
  private readonly dxFilter = new LowPassFilter();
  private lastTime: number | null = null;

  constructor(opts: OneEuroOptions = {}) {
    this.nominalFreq = opts.freq ?? 30;
    this.minCutoff = opts.minCutoff ?? 1.0;
    this.beta = opts.beta ?? 0.02;
    this.dCutoff = opts.dCutoff ?? 1.0;
  }

  /** Filtra uma amostra; `t` em segundos (performance.now()/1000). */
  filter(x: number, t: number): number {    if (!Number.isFinite(x) || !Number.isFinite(t)) return this.xFilter.value ?? x;
    // taxa real entre 1 e 120 Hz: rajadas ou lentidão não explodem o alfa
    const rate =
      this.lastTime !== null && t > this.lastTime
        ? Math.max(1, Math.min(120, 1 / (t - this.lastTime)))
        : this.nominalFreq;
    this.lastTime = t;
    const prev = this.xFilter.value;
    const d = prev === null ? 0 : (x - prev) * rate;
    const dHat = this.dxFilter.filter(d, smoothingAlpha(this.dCutoff, rate));
    const cutoff = this.minCutoff + this.beta * Math.abs(dHat);
    return this.xFilter.filter(x, smoothingAlpha(cutoff, rate));
  }

  /** Última estimativa (para desenhar sem nova amostra). */
  get value(): number | null {
    return this.xFilter.value;
  }
}
