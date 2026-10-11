/**
 * Seleção por fixação ("dwell"): manter a mira no MESMO alvo por um tempo
 * dispara a ação. Puro e testável — sem DOM, sem tempo real (o `now` vem de
 * fora). Base da mira assistida no editor (mão) e no Cardboard (olhar).
 */
export interface DwellResult {
  /** Alvo fixado (null quando a mira está no vazio). */
  id: string | null;
  /** 0..1: quanto do tempo já correu (para o anel de progresso crescer). */
  progress: number;
  /** true APENAS no quadro em que completa (dispare a ação aqui). */
  fired: boolean;
}

export const DEFAULT_DWELL_MS = 3000;

export class DwellController {
  private readonly ms: number;
  private currentId: string | null = null;
  private startedAt = 0;
  /** Alvo já disparado: não repete enquanto a mira não sair dele. */
  private firedId: string | null = null;

  constructor(ms: number = DEFAULT_DWELL_MS) {
    this.ms = Math.max(1, ms);
  }

  get duration(): number {
    return this.ms;
  }

  /** Alvo atual (null = nenhum). */
  get target(): string | null {
    return this.currentId;
  }

  /** Progresso corrente, sem avançar o tempo (para desenhar fora do tick). */
  get progress(): number {
    return this.currentId === null ? 0 : this.firedId === this.currentId ? 1 : Math.min(1, this.rawProgress());
  }

  private rawProgress(): number {
    if (this.currentId === null) return 0;
    return (this.nowRef - this.startedAt) / this.ms;
  }

  private nowRef = 0;

  /**
   * Um quadro de mira. `id` é o alvo sob a mira (null = vazio).
   * Trocar de alvo ZERA o progresso; manter o mesmo acumula até disparar uma
   * única vez (para repetir, é preciso sair e voltar).
   */
  update(id: string | null, now: number): DwellResult {
    this.nowRef = now;

    // mira saiu de tudo: limpa e destrava um novo disparo do mesmo alvo depois
    if (id === null) {
      this.currentId = null;
      this.startedAt = 0;
      this.firedId = null;
      return { id: null, progress: 0, fired: false };
    }

    // alvo novo: recomeça a contagem
    if (id !== this.currentId) {
      this.currentId = id;
      this.startedAt = now;
      this.firedId = null;
      return { id, progress: 0, fired: false };
    }

    // já disparou neste alvo: aguarda a mira sair (progresso cheio, sem repetir)
    if (this.firedId === id) {
      return { id, progress: 1, fired: false };
    }

    const progress = Math.min(1, (now - this.startedAt) / this.ms);
    if (progress >= 1) {
      this.firedId = id;
      return { id, progress: 1, fired: true };
    }
    return { id, progress, fired: false };
  }

  reset() {
    this.currentId = null;
    this.startedAt = 0;
    this.firedId = null;
  }
}
