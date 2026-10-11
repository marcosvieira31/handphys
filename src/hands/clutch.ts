/**
 * Trava de mira (pura, testável).
 *
 * A mira crua é o ponto médio entre a ponta do polegar (4) e a do indicador (8)
 * — que é onde a pinça acontece. Só que, ao FECHAR a mão, essas duas pontas se
 * convergem e o meio delas escorrega na direção do polegar (na vista espelhada,
 * p/ a direita). Como o esqueleto é ancorado na mira, o desenho inteiro
 * deslizava junto e a seleção errava o alvo.
 *
 * A trava congela a "apontada" dos dedos pouco antes da pinça começar (razão
 * caindo até `freezeAt`) e daí em diante a mira é `palma + apontada`: os dedos
 * fecham em volta da mira, mas ela só acompanha o MOVIMENTO DA PALMA (pulso 0 ×
 * metacarpal 9 — que não muda quando os dedos articulam). Abrir a mão além de
 * `releaseAt` devolve a mira crua aos dedos.
 *
 * Os limiares são relativos ao pico de abertura observado daquela mão, então
 * servem a mão dura ou flexível sem ajuste manual.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface ClutchFrame {
  /** Distância polegar×indicador normalizada pela palma (0,22 fechada / ~0,86 aberta). */
  ratio: number;
  /** Mira crua: ponto médio das pontas 4 e 8, janela 0..1 já espelhada. */
  tip: Pt;
  /** Palma: ponto médio do pulso (0) e do metacarpal (9) — estável ao pinçar. */
  palm: Pt;
}

/** Folga abaixo do pico de abertura para travar e para destravar. */
const FREEZE_GAP = 0.13;
const RELEASE_GAP = 0.05;
/** Teto do destravamento, para mão que nunca chega a abrir muito. */
const MIN_FREEZE = 0.35;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Clutch {
  private offset: Pt | null = null;
  private frozen = false;
  private openMax = 0;

  /** Uma detecção: devolve a mira corrente. */
  update(f: ClutchFrame): Pt {
    if (Number.isFinite(f.ratio) && f.ratio > this.openMax) this.openMax = f.ratio;
    const raw: Pt = { x: f.tip.x - f.palm.x, y: f.tip.y - f.palm.y };

    if (this.frozen) {
      if (f.ratio >= this.releaseAt) this.frozen = false;
    } else if (f.ratio <= this.freezeAt) {
      // congela SÓ na virada: captura a apontada ainda praticamente inteira
      this.frozen = true;
      this.offset = raw;
    }
    if (!this.frozen) this.offset = raw;

    const o = this.offset ?? raw;
    return { x: clamp01(f.palm.x + o.x), y: clamp01(f.palm.y + o.y) };
  }

  /** Razão abaixo da qual a mira trava. */
  get freezeAt(): number {
    return Math.max(this.openMax - FREEZE_GAP, MIN_FREEZE);
  }

  /** Razão acima da qual a mira volta a seguir os dedos (abertura − folga). */
  get releaseAt(): number {
    return this.freezeAt + (FREEZE_GAP - RELEASE_GAP);
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  /** Mirra de abertura observada (limiar adaptativo) — diagnóstico. */
  get openPeak(): number {
    return this.openMax;
  }

  reset() {
    this.offset = null;
    this.frozen = false;
    this.openMax = 0;
  }
}
