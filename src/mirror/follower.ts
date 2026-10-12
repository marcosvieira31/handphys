import type { MirrorChannel } from './channel';
import { decodeMsg, helloMsg, newWatcherId, type Msg } from './protocol';

const DEFAULT_ASK = 1500;

/**
 * Lado do ESPPELHO: pede o estado de tempos em tempos e repassa o que chega.
 *
 * Perguntar em loop (e não uma vez) é o que faz o observador funcionar em
 * qualquer ordem: espelho aberto antes do editor, editor recarregado, ou o
 * professor trocando de aba — no próximo "hello" o estado volta.
 */
export class MirrorFollower {
  private id = newWatcherId();
  private timer: number | null = null;

  constructor(
    private ch: MirrorChannel,
    private onMsg: (m: Msg) => void,
    private ask = DEFAULT_ASK,
  ) {}

  start(): void {
    this.ch.onMessage((raw) => {
      const m = decodeMsg(raw);
      if (m) this.onMsg(m);
    });
    this.ch.send(helloMsg(this.id));
    this.timer = setInterval(() => this.ch.send(helloMsg(this.id)), this.ask);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.ch.close();
  }
}
