import { appBase } from '../editor/share';
import type { MirrorChannel } from './channel';

/**
 * Salas na rede da escola: o aparelho que CONDUZ abre uma sala com código
 * curto (ditado em aula ou escaneado em QR) e os espelhos entram nela.
 *
 * Por baixo é WebRTC (dados andam de aparelho a aparelho, na rede local) e a
 * sinalização — o aperto de mão de oferta/resposta — passa pelo servidor
 * público do PeerJS. É o único pedaço que toca a internet; o circuito em si
 * não sai da sala. Sem internet a sala não abre, e aí o espelho continua
 * funcionando na mesma máquina pelo canal local (`channel.ts`) — o protocolo
 * é o mesmo, só o transporte muda.
 *
 * ImportANTE: peerjs é carregado por `import()` dinâmico — só entra no bundle
 * (e só na rede) quando alguém abre ou entra numa sala.
 */

const PREFIXO = 'handphys-';
/** Sem I/L/O/0/1: ninguém erra o código ao copiar do quadro. */
const ALFA = 'BCDFJKMPQRTVWXY346789';
/** De quanto em quanto tempo o espelho procura a sala de novo. */
const RETENTATIVA_MS = 4000;
const MAX_TENTATIVAS = 45; // ~3 minutos esperando o professor abrir a sala

export type StatusSala = 'abrindo' | 'procurando' | 'conectado' | 'erro';

/**
 * Só em dev: histórico curto dos eventos da sala. Em aula, quando algo não
 * conecta, o professor não tem console aberto — a automação lê isto daqui.
 */
export const SALA_LOG: string[] = [];
const loga = (t: string) => {
  if (import.meta.env.DEV) {
    SALA_LOG.push(t);
    if (SALA_LOG.length > 60) SALA_LOG.shift();
  }
};

/** Código de sala: curto, ditável, sem letra que se confunde. */
export function newRoomCode(tamanho = 5): string {
  const buf = new Uint8Array(tamanho);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => ALFA[b % ALFA.length]).join('');
}

/** Link do espelho para ESTA sala (é o que vira QR no quadro: a rota do app). */
export function mirrorUrl(code: string, base?: string): string {
  const root = (base ?? appBase()).replace(/\/?$/, '/');
  return `${root}?sala=${code}#/espelho`;
}

/** Código de sala vindo na query (`?sala=K7QW3`, o QR do professor). */
export function roomFromSearch(search: string): string | null {
  const m = /[?&]sala=([A-Za-z0-9_-]{1,12})/.exec(search);
  return m ? m[1].toUpperCase() : null;
}

/* ------------------------------------------------------------------ */
/* Abstrações mínimas (permitem testar sem WebRTC e sem rede)          */
/* ------------------------------------------------------------------ */

export interface PeerConn {
  open: boolean;
  send(data: unknown): void;
  close(): void;
  on(event: 'open', cb: () => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: 'error', cb: (e: unknown) => void): void;
  on(event: 'data', cb: (d: unknown) => void): void;
}

export interface PeerNode {
  on(event: 'open', cb: (id: string) => void): void;
  on(event: 'connection', cb: (c: PeerConn) => void): void;
  on(event: 'error', cb: (e: unknown) => void): void;
  connect(id: string, opts?: { reliable?: boolean }): PeerConn;
  destroy(): void;
}

export type PeerFactory = (id: string) => PeerNode;

export interface RoomChannel extends MirrorChannel {
  readonly code: string;
}

const tipoDo = (e: unknown): string => {
  if (e && typeof e === 'object' && 'type' in e) return String((e as { type?: unknown }).type);
  return '';
};

async function criarPeer(id: string, factory?: PeerFactory): Promise<PeerNode> {
  loga(`peer ${id}: criando`);
  const peer: PeerNode = factory
    ? factory(id)
    : await (async () => {
        const mod = await import('peerjs');
        loga(`peer ${id}: peerjs carregado`);
        const Ctor = ((mod as { default?: unknown }).default ?? (mod as { Peer?: unknown }).Peer) as new (
          i: string,
          o?: { debug?: number },
        ) => PeerNode;
        // debug 2 em dev: o log do próprio peerjs mostra oferta/resposta da
        // sinalização — é o que destrava quando o pareamento não fecha.
        return new Ctor(id, { debug: import.meta.env.DEV ? 2 : 0 });
      })();
  // Só devolve quando o id está registrado no sinalizador. Erro antes disso é
  // fatal (id em uso, sem rede, servidor fora) — depois disso não é mais.
  await new Promise<void>((resolve, reject) => {
    peer.on('open', () => {
      loga(`peer ${id}: abriu`);
      resolve();
    });
    peer.on('error', (e) => {
      loga(`peer ${id}: erro ${tipoDo(e) || String(e)}`);
      reject(new Error(tipoDo(e) || String(e)));
    });
  });
  return peer;
}

const idDoEspelho = () => `${PREFIXO}esp-${newRoomCode(6)}`;

/* ------------------------------------------------------------------ */
/* Quem CONDUZ abre a sala                                             */
/* ------------------------------------------------------------------ */

export async function openRoom(
  code: string,
  onPeers?: (n: number) => void,
  factory?: PeerFactory,
): Promise<RoomChannel> {
  let peer: PeerNode;
  let usado = code;
  for (let tentativa = 0; ; tentativa++) {
    try {
      peer = await criarPeer(PREFIXO + usado, factory);
      break;
    } catch (e) {
      // código já em uso por outra sala: sorteia outro em vez de falhar
      if (tentativa >= 2 || !/unavailable-id/.test(String(e))) throw e;
      usado = newRoomCode();
    }
  }
  const final = usado;

  const conns = new Set<PeerConn>();
  let cb: ((raw: unknown) => void) | null = null;
  const avisa = () => onPeers?.(conns.size);

  peer.on('connection', (c) => {
    c.on('open', () => {
      conns.add(c);
      loga('sala: entrou uma tela');
      avisa();
    });
    c.on('data', (d) => cb?.(d));
    c.on('close', () => {
      conns.delete(c);
      loga('sala: tela saiu');
      avisa();
    });
    c.on('error', () => {
      conns.delete(c);
      avisa();
    });
  });

  return {
    code: final,
    send: (raw) => {
      for (const c of conns) if (c.open) c.send(raw);
    },
    onMessage: (s) => {
      cb = s;
    },
    close: () => {
      for (const c of conns) c.close();
      conns.clear();
      peer.destroy();
      avisa();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Quem OBSERVA entra na sala                                          */
/* ------------------------------------------------------------------ */

export async function joinRoom(
  code: string,
  onStatus?: (s: StatusSala) => void,
  factory?: PeerFactory,
): Promise<RoomChannel> {
  const peer = await criarPeer(idDoEspelho(), factory);
  const status = onStatus ?? (() => {});
  let cb: ((raw: unknown) => void) | null = null;
  let conn: PeerConn | null = null;
  let fila: string[] = [];
  let tentativas = 0;
  let timer: number | null = null;
  let morto = false;

  const conectar = () => {
    if (morto) return;
    status('procurando');
    loga(`espelho: conectando a ${code} (tentativa ${tentativas + 1})`);
    const c = peer.connect(PREFIXO + code, { reliable: true });
    conn = c;
    c.on('open', () => {
      tentativas = 0;
      fila = fila.slice(-50); // só o estado recente importa
      for (const r of fila) c.send(r);
      fila = [];
      loga('espelho: conectado');
      status('conectado');
    });
    c.on('data', (d) => cb?.(d));
    c.on('close', () => reagenda());
    c.on('error', () => reagenda());
  };

  // Sala ainda não aberta (ou caiu): procura de novo, sem afogar a página.
  const reagenda = () => {
    fila = [];
    if (morto || timer !== null) return;
    if (++tentativas > MAX_TENTATIVAS) {
      loga('espelho: desistiu');
      status('erro');
      return;
    }
    loga(`espelho: reagenda em ${RETENTATIVA_MS} ms`);
    timer = setTimeout(() => {
      timer = null;
      conectar();
    }, RETENTATIVA_MS);
  };

  peer.on('error', (e) => {
    loga(`espelho: erro do peer ${tipoDo(e) || String(e)}`);
    if (tipoDo(e) === 'peer-unavailable') reagenda();
  });

  conectar();

  return {
    code,
    send: (raw) => {
      if (conn?.open) conn.send(raw);
      else if (fila.length < 200) fila.push(raw);
    },
    onMessage: (s) => {
      cb = s;
    },
    close: () => {
      morto = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      conn?.close();
      peer.destroy();
      status('erro');
    },
  };
}
