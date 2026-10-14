import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MirrorFollower } from './follower';
import { encodeState, type State } from './protocol';
import { joinRoom, mirrorUrl, newRoomCode, openRoom, type PeerConn, type PeerNode, type PeerFactory } from './peer';
import { MirrorTransmitter } from './transmitter';
import { EXAMPLES } from '../editor/examples';

/* ------------------------------------------------------------------ */
/* Rede falsa: dois "PeerNodes" ligados em memória, sem WebRTC e sem    */
/* sinalizador. É o que deixa testar a sala inteira de verdade.        */
/* ------------------------------------------------------------------ */

class FakeConn implements PeerConn {
  open = false;
  par: FakeConn | null = null;
  private ouvintes = new Map<string, ((a: never) => void)[]>();

  on(ev: string, cb: (a: never) => void) {
    const l = this.ouvintes.get(ev) ?? [];
    l.push(cb);
    this.ouvintes.set(ev, l);
  }
  private emite(ev: string, arg?: unknown) {
    for (const cb of this.ouvintes.get(ev) ?? []) cb(arg as never);
  }
  abrir() {
    this.open = true;
    this.emite('open');
  }
  send(data: unknown) {
    if (this.open && this.par) this.par.emite('data', data);
  }
  close() {
    this.open = false;
    this.emite('close');
    if (this.par && this.par.open) this.par.close();
  }
}

class FakePeer implements PeerNode {
  morto = false;
  private ouvintes = new Map<string, ((a: never) => void)[]>();

  constructor(
    readonly id: string,
    private rede: Map<string, FakePeer>,
    ocupado = false,
  ) {
    // id já em uso (outra sala): o sinalizador recusa — igual ao servidor real
    queueMicrotask(() => this.emite(ocupado ? 'error' : 'open', ocupado ? { type: 'unavailable-id' } : id));
  }
  on(ev: string, cb: (a: never) => void) {
    const l = this.ouvintes.get(ev) ?? [];
    l.push(cb);
    this.ouvintes.set(ev, l);
  }
  private emite(ev: string, arg?: unknown) {
    for (const cb of this.ouvintes.get(ev) ?? []) cb(arg as never);
  }
  connect(destino: string): PeerConn {
    const alvo = this.rede.get(destino);
    const local = new FakeConn();
    const remoto = new FakeConn();
    local.par = remoto;
    remoto.par = local;
    queueMicrotask(() => {
      if (alvo && !alvo.morto) {
        alvo.emite('connection', remoto); // o dono da sala anexa os ouvintes…
        local.abrir(); // …e só então os dois lados abrem
        remoto.abrir();
      } else {
        this.emite('error', { type: 'peer-unavailable' });
      }
    });
    return local;
  }
  destroy() {
    this.morto = true;
    this.rede.delete(this.id);
  }
}

function redeFake(): { factory: PeerFactory; aberta: () => number } {
  const peers = new Map<string, FakePeer>();
  return {
    factory: (id: string) => {
      const ocupado = peers.has(id);
      const p = new FakePeer(id, peers, ocupado);
      peers.set(id, p);
      return p;
    },
    aberta: () => peers.size,
  };
}

const estado = (): State => ({
  doc: EXAMPLES[0].doc,
  view: '2d',
  zoom: 1,
  pan: { x: 0, y: 0 },
  sel: null,
  placing: null,
  colorByVoltage: false,
  flow: true,
  challenge: null,
  questao: '',
});

/** Deixa a rede falsa (que agenda por microtask) terminar de correr. */
async function cede() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('salas na rede da escola (peer.ts)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('código de sala é curto, ditável e sem letra que se confunde', () => {
    const c = newRoomCode();
    expect(c).toMatch(/^[BCDFJKMPQRTVWXY346789]{5}$/);
    expect(c).not.toContain('I');
    expect(c).not.toContain('0');
    expect(newRoomCode()).not.toBe(newRoomCode());
  });

  it('link do espelho aponta para a sala certa', () => {
    const url = mirrorUrl('K7QW3', 'https://x.io/handphys/editor.html');
    expect(url).toBe('https://x.io/handphys/mirror.html?sala=K7QW3');
  });

  it('espelho entra na sala e recebe o estado ao vivo', async () => {
    const { factory } = redeFake();
    const sala = await openRoom('TEST1', undefined, factory);
    expect(sala.code).toBe('TEST1');

    const tx = new MirrorTransmitter(sala, () => estado());
    tx.start();

    const recebidos: State[] = [];
    const espelho = await joinRoom('TEST1', undefined, factory);
    const f = new MirrorFollower(espelho, (m) => {
      if (m.kind === 'state') recebidos.push(m.state);
    });
    f.start();
    await cede();

    expect(recebidos.length).toBeGreaterThan(0);
    expect(recebidos[0].doc).toEqual(EXAMPLES[0].doc);

    f.stop();
    tx.stop();
    espelho.close();
    sala.close();
  });

  it('uma sala atende várias telas ao mesmo tempo', async () => {
    const { factory } = redeFake();
    let contatos = -1;
    const sala = await openRoom('TEST2', (n) => (contatos = n), factory);
    const e1 = await joinRoom('TEST2', undefined, factory);
    const e2 = await joinRoom('TEST2', undefined, factory);
    await cede();
    expect(contatos).toBe(2);

    const vistas: string[] = [];
    e1.onMessage((raw) => vistas.push(`1:${String(raw).slice(0, 8)}`));
    e2.onMessage((raw) => vistas.push(`2:${String(raw).slice(0, 8)}`));
    sala.send(encodeState(estado()));
    await cede();
    expect(vistas.filter((v) => v.startsWith('1:')).length).toBe(1);
    expect(vistas.filter((v) => v.startsWith('2:')).length).toBe(1);

    e1.close();
    await cede();
    expect(contatos).toBe(1);
    e2.close();
    sala.close();
  });

  it('espelho que chega antes da sala fica procurando e entra sozinho', async () => {
    const { factory } = redeFake();
    const status: string[] = [];
    const espelho = await joinRoom('TARDE1', (s) => status.push(s), factory);
    espelho.onMessage(() => {});
    await cede(); // falhou: a sala ainda não existe
    expect(status).toContain('procurando');

    //4 s depois o professor abre a sala
    vi.advanceTimersByTime(4001);
    const sala = await openRoom('TARDE1', undefined, factory);
    await cede();
    vi.advanceTimersByTime(4001);
    await cede();

    const chegou: string[] = [];
    espelho.onMessage((raw) => chegou.push(String(raw)));
    sala.send('estado-novo');
    await cede();
    expect(chegou).toContain('estado-novo');
    expect(status).toContain('conectado');

    espelho.close();
    sala.close();
  });

  it('fechar a sala corta o envio (ninguém fica esperando para sempre)', async () => {
    const { factory } = redeFake();
    const sala = await openRoom('TEST3', undefined, factory);
    const espelho = await joinRoom('TEST3', undefined, factory);
    const chegou: string[] = [];
    espelho.onMessage((raw) => chegou.push(String(raw)));
    await cede();

    sala.send('antes');
    await cede();
    expect(chegou).toContain('antes');

    sala.close();
    sala.send('depois');
    await cede();
    expect(chegou).not.toContain('depois');
    espelho.close();
  });

  it('código já em uso: a sala sorteia outro em vez de morrer', async () => {
    const { factory } = redeFake();
    const a = await openRoom('DUP1', undefined, factory);
    const b = await openRoom('DUP1', undefined, factory);
    expect(a.code).toBe('DUP1');
    expect(b.code).not.toBe('DUP1');
    a.close();
    b.close();
  });
});
