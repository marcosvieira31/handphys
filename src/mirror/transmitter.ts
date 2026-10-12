import type { MirrorChannel } from './channel';
import { BYE, decodeMsg, encodeState, type State } from './protocol';

/** Um envio a cada "poke": o último estado vence (não enfileira arraste). */
const DEFAULT_EVERY = 90;
/** Estado periódico: batimento + recuperação de quem abriu o espelho depois. */
const DEFAULT_BEAT = 1400;
/** Tela que mandou hello nos últimos N ms ainda conta como acompanhando. */
const WATCHER_TTL = 4500;

/**
 * Lado de QUEM CONDUZ: publica o estado da tela para os espelhos.
 *
 * Duas rotas de envio: `poke()` a cada mudança do estado (coalescido — o
 * último vence, então arrastar componente não enche a rede) e um batimento
 * periódico que também é o "estou vivo" do observador e serve para quem abre
 * a aba do espelho no meio já receber tudo.
 */
export class MirrorTransmitter {
  private timer: number | null = null;
  private beat: number | null = null;
  private watchers = new Map<string, number>();
  private open = false;

  constructor(
    private ch: MirrorChannel,
    private source: () => State,
    private onWatchers?: (n: number) => void,
    private every = DEFAULT_EVERY,
    private beatMs = DEFAULT_BEAT,
  ) {}

  start(): void {
    if (this.open) return;
    this.open = true;
    this.ch.onMessage((raw) => {
      const m = decodeMsg(raw);
      if (m?.kind !== 'hello') return;
      if (m.id) this.watchers.set(m.id, Date.now());
      this.prune();
      this.flush(); // responde na hora: o espelho não fica esperando o batimento
    });
    this.flush();
    this.beat = setInterval(() => {
      this.prune();
      this.flush();
    }, this.beatMs);
  }

  /** Mudou o estado da tela que conduz: manda já (coalescido). */
  poke(): void {
    if (!this.open || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.every);
  }

  stop(): void {
    if (!this.open) return;
    this.open = false;
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.beat !== null) clearInterval(this.beat);
    this.timer = null;
    this.beat = null;
    this.ch.send(BYE);
    this.ch.close();
  }

  private flush(): void {
    if (this.open) this.ch.send(encodeState(this.source()));
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, t] of this.watchers) if (now - t > WATCHER_TTL) this.watchers.delete(id);
    this.onWatchers?.(this.watchers.size);
  }
}
