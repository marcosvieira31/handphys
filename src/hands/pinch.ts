/**
 * Máquina de pinça por mão (pura, testável): razão polegar–indicador =>
 * agarrado/solto com histerese + debounce de soltura + graça de rastreio.
 * Parâmetros herdados do spike 0.1, medidos no PC real (pinça fechada 0,20–0,24,
 * aberta 0,84–0,88, limiar 0,45 com folga nos dois lados).
 */
export interface PinchConfig {
  /** Agarra abaixo disto. */
  threshold?: number;
  /** Solta acima de threshold + hysteresis, por N quadros seguidos. */
  hysteresis?: number;
  /** Quadros acima do limiar para confirmar a soltura. */
  releaseFrames?: number;
  /** Ms que a mão pode sumir sem perder o estado. */
  graceMs?: number;
}

export type PinchEdge = 'down' | 'up' | null;

interface Tracked {
  pinched: boolean;
  lastSeen: number;
  releaseCount: number;
}

const DEFAULTS: { threshold: number; hysteresis: number; releaseFrames: number; graceMs: number } = {
  threshold: 0.45,
  hysteresis: 0.12,
  releaseFrames: 3,
  graceMs: 400,
};

export class PinchTracker {
  private readonly cfg: typeof DEFAULTS;
  private readonly tracked = new Map<string, Tracked>();

  constructor(config: PinchConfig = {}) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  get threshold(): number {
    return this.cfg.threshold;
  }

  /** Uma detecção: devolve o estado e a borda (para apertar/soltar no store). */
  update(side: string, ratio: number, now: number): { pinched: boolean; edge: PinchEdge } {
    const { threshold, hysteresis, releaseFrames } = this.cfg;
    const prev = this.tracked.get(side);
    const was = prev?.pinched ?? false;
    let pinched = was;
    let releaseCount = 0;
    if (!was) {
      if (ratio < threshold) pinched = true;
    } else {
      if (ratio > threshold + hysteresis) releaseCount = (prev?.releaseCount ?? 0) + 1;
      if (releaseCount >= releaseFrames) {
        pinched = false;
        releaseCount = 0;
      }
    }
    this.tracked.set(side, { pinched, lastSeen: now, releaseCount });
    return { pinched, edge: pinched === was ? null : pinched ? 'down' : 'up' };
  }

  /**
   * Expira mãos sumidas há mais que a graça: devolve os lados que estavam
   * AGARRADOS (o adapter precisa soltar o aperto no store, senão trava).
   */
  prune(now: number): string[] {
    const expired: string[] = [];
    for (const [side, t] of [...this.tracked]) {
      if (now - t.lastSeen > this.cfg.graceMs) {
        this.tracked.delete(side);
        if (t.pinched) expired.push(side);
      }
    }
    return expired;
  }

  reset() {
    this.tracked.clear();
  }

  get sides(): string[] {
    return [...this.tracked.keys()];
  }
}
