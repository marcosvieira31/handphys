import { CHANNEL_NAME } from './protocol';

/**
 * Transporte do espelho: só manda e recebe texto. O protocolo não sabe onde
 * os bytes andam — hoje é uma aba ao lado da outra, amanhã pode ser WebRTC na
 * rede da sala.
 */
export interface MirrorChannel {
  send(raw: string): void;
  onMessage(cb: (raw: unknown) => void): void;
  close(): void;
}

/**
 * Mesma máquina, sem servidor: a aba do editor e a aba do espelho falam entre
 * si pelo BroadcastChannel do navegador (todas as abas do mesmo origem veem
 * as mensagens — e NÃO recebem as próprias).
 *
 * É o transporte que funciona sempre: sem internet, sem instalar nada, e é o
 * que a projeção usa quando o projetor está ligado no PC do professor.
 */
export function localChannel(name: string = CHANNEL_NAME): MirrorChannel {
  const bc = new BroadcastChannel(name);
  return {
    send: (raw) => bc.postMessage(raw),
    onMessage: (cb) => {
      bc.onmessage = (e) => cb(e.data);
    },
    close: () => bc.close(),
  };
}
