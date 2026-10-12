import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from '../editor/examples';
import type { MirrorChannel } from './channel';
import { MirrorFollower } from './follower';
import { BYE, decodeMsg, encodeState, helloMsg, newWatcherId, type State } from './protocol';
import { MirrorTransmitter } from './transmitter';

/** Par de canais que se falam (o BroadcastChannel de verdade não manda p/ si). */
function pair(): [MirrorChannel, MirrorChannel] {
  const subs: { a?: (r: unknown) => void; b?: (r: unknown) => void } = {};
  const closed = { a: false, b: false };
  const mk = (me: 'a' | 'b'): MirrorChannel => ({
    send: (raw) => {
      const outro = me === 'a' ? 'b' : 'a';
      if (!closed[outro]) subs[outro]?.(raw);
    },
    onMessage: (cb) => {
      subs[me] = cb;
    },
    close: () => {
      closed[me] = true;
    },
  });
  return [mk('a'), mk('b')];
}

const estado = (sobrescrever: Partial<State> = {}): State => ({
  doc: EXAMPLES[0].doc,
  view: '2d',
  zoom: 1.25,
  pan: { x: 3, y: -2 },
  sel: { kind: 'comp', id: 'r1' },
  placing: 'resistor',
  colorByVoltage: false,
  ...sobrescrever,
});

/** Tudo que um observador recebeu, para as contas. */
function gravador() {
  const msgs: unknown[] = [];
  return {
    msgs,
    canal: (): MirrorChannel => ({
      send: (raw) => msgs.push(raw),
      onMessage: () => {},
      close: () => {},
    }),
  };
}

describe('protocolo do espelho', () => {
  it('estado sobe e desce inteiro', () => {
    const st = estado();
    const m = decodeMsg(encodeState(st));
    expect(m?.kind).toBe('state');
    expect(m && m.kind === 'state' ? m.state : null).toEqual(st);
  });

  it('aceita os extremos e enxuga o que é option', () => {
    const st = estado({ view: '3d', zoom: 9, pan: { x: -50, y: 40 }, sel: null, placing: null, colorByVoltage: true });
    const m = decodeMsg(encodeState(st));
    expect(m && m.kind === 'state' ? m.state : null).toEqual({
      ...st,
      zoom: 4, // clamp do editor
    });
  });

  it('hello e bye passam; id inválido vira id vazio', () => {
    expect(decodeMsg(helloMsg('ab12'))).toEqual({ kind: 'hello', id: 'ab12' });
    expect(decodeMsg(BYE)).toEqual({ kind: 'bye' });
    expect(decodeMsg('{"t":"hello","v":1}')).toEqual({ kind: 'hello', id: '' });
  });

  it('lixo no canal vira null, nunca erro na tela', () => {
    expect(decodeMsg(null)).toBeNull();
    expect(decodeMsg(123)).toBeNull();
    expect(decodeMsg('{quebrado')).toBeNull();
    expect(decodeMsg('{"t":"state","v":99}')).toBeNull(); // outra versão
    expect(decodeMsg('{"t":"state","v":1,"d":"lixo"}')).toBeNull(); // doc podre
    expect(decodeMsg('{"t":"state","v":1,"d":"eyJ2IjoxLCJjIjpbXSwidyI6W119","z":2}')).not.toBeNull();
    expect(decodeMsg('{"t":"qualquer","v":1}')).toBeNull();
  });

  it('sel e placing estranhos não entram', () => {
    const doc = encodeState(estado({ sel: { kind: 'comp', id: 'r1' }, placing: 'lamp' }));
    const m = decodeMsg(doc);
    expect(m && m.kind === 'state' ? m.state.sel : null).toEqual({ kind: 'comp', id: 'r1' });
    expect(m && m.kind === 'state' ? m.state.placing : null).toBe('lamp');

    const podre = JSON.stringify({
      ...JSON.parse(encodeState(estado())),
      s: 'zap:injecao',
      a: 'wtf',
    });
    const m2 = decodeMsg(podre);
    expect(m2 && m2.kind === 'state' ? m2.state.sel : null).toBeNull();
    expect(m2 && m2.kind === 'state' ? m2.state.placing : null).toBeNull();
  });

  it('id de tela é curto e muda', () => {
    expect(newWatcherId()).toMatch(/^[a-z0-9]{1,7}$/);
    expect(newWatcherId()).not.toBe(newWatcherId());
  });
});

describe('transmissor (lado de quem conduz)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('manda o estado ao ligar e responde hello na hora', () => {
    const g = gravador();
    const tx = new MirrorTransmitter(g.canal(), () => estado());
    tx.start();
    expect(g.msgs).toHaveLength(1);
    expect(decodeMsg(g.msgs[0])?.kind).toBe('state');

    const outro = decodeMsg(g.msgs[0]); // só para provar que é o estado de verdade
    expect(outro && outro.kind === 'state' ? outro.state.doc : null).toEqual(EXAMPLES[0].doc);
  });

  it('poke coalesce: o último estado vence', () => {
    const enviados: string[] = [];
    let atual = estado({ zoom: 1 });
    const canal: MirrorChannel = {
      send: (r) => enviados.push(r),
      onMessage: () => {},
      close: () => {},
    };
    const tx = new MirrorTransmitter(canal, () => atual);
    tx.start();
    enviados.length = 0;

    for (const zoom of [1.5, 2, 2.5, 3]) {
      atual = estado({ zoom });
      tx.poke();
    }
    expect(enviados).toHaveLength(0); // ainda dentro da janela
    vi.advanceTimersByTime(95);
    expect(enviados).toHaveLength(1);
    const m = decodeMsg(enviados[0]);
    expect(m && m.kind === 'state' ? m.state.zoom : null).toBe(3); // o último
  });

  it('conta as telas que estão acompanhando (e para de contar quando some)', () => {
    const [canalMestre, canalEspelho] = pair();
    const contagens: number[] = [];
    const tx = new MirrorTransmitter(canalMestre, () => estado(), (n) => contagens.push(n));
    tx.start();
    const f = new MirrorFollower(canalEspelho, () => {});
    f.start();
    expect(contagens.at(-1)).toBe(1);

    f.stop(); // a tela do espelho fechou
    vi.advanceTimersByTime(6000); // batimento envelhece o hello (TTL 4,5 s)
    expect(contagens.at(-1)).toBe(0);
    tx.stop();
  });

  it('para manda bye e fecha o canal', () => {
    const g = gravador();
    let fechado = false;
    const canal: MirrorChannel = {
      send: (r) => g.msgs.push(r),
      onMessage: () => {},
      close: () => {
        fechado = true;
      },
    };
    const tx = new MirrorTransmitter(canal, () => estado());
    tx.start();
    tx.stop();
    expect(decodeMsg(g.msgs[g.msgs.length - 1])).toEqual({ kind: 'bye' });
    expect(fechado).toBe(true);
  });
});

describe('seguidor (lado do espelho)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pede o estado ao ligar e de tempos em tempos', () => {
    const g = gravador();
    const f = new MirrorFollower(g.canal(), () => {});
    f.start();
    expect(decodeMsg(g.msgs[0])).toMatchObject({ kind: 'hello' });
    vi.advanceTimersByTime(1501);
    expect(g.msgs).toHaveLength(2);
    f.stop();
  });

  it('espelho segue a tela que conduz, ponta a ponta', () => {
    const [canalMestre, canalEspelho] = pair();
    const recebidos: State[] = [];
    let atual = estado();

    const tx = new MirrorTransmitter(canalMestre, () => atual);
    const f = new MirrorFollower(canalEspelho, (m) => {
      if (m.kind === 'state') recebidos.push(m.state);
    });
    tx.start();
    f.start();

    expect(recebidos).toHaveLength(1);
    expect(recebidos[0].doc).toEqual(EXAMPLES[0].doc);

    atual = estado({ doc: EXAMPLES[1].doc, view: '3d', zoom: 2 });
    tx.poke();
    vi.advanceTimersByTime(95);

    expect(recebidos).toHaveLength(2);
    expect(recebidos[1].doc).toEqual(EXAMPLES[1].doc);
    expect(recebidos[1].view).toBe('3d');

    f.stop();
    tx.stop();
  });

  it('espelho que abre no meio já recebe tudo (hello responde na hora)', () => {
    const [canalMestre, canalEspelho] = pair();
    const tx = new MirrorTransmitter(canalMestre, () => estado({ doc: EXAMPLES[2].doc }));
    tx.start();
    const recebidos: State[] = [];
    const f = new MirrorFollower(canalEspelho, (m) => {
      if (m.kind === 'state') recebidos.push(m.state);
    });
    f.start();
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0].doc).toEqual(EXAMPLES[2].doc);
    tx.stop();
  });
});
