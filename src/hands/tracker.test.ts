import { afterEach, describe, expect, it, vi } from 'vitest';
import { HandTracker, pinchRatio2D, pinchRatio3D, restricoesMaos } from './tracker';

const hand = (t: [number, number][], m: [number, number][]) => {
  const pts = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  pts[0] = { x: 0.5, y: 0.9, z: 0 }; // punho
  pts[9] = { x: 0.5, y: 0.5, z: 0 }; // base do médio (tamanho da mão = 0,4)
  pts[4] = { x: t[0][0], y: t[0][1], z: 0 }; // ponta do polegar
  pts[8] = { x: m[0][0], y: m[0][1], z: 0 }; // ponta do indicador
  return pts;
};

describe('razão de pinça', () => {
  it('normaliza pela mão (independe da distância da câmera)', () => {
    // dedos a 0,04 um do outro, mão de 0,4 => 0,1 (pinça fechada)
    expect(pinchRatio2D(hand([[0.5, 0.5]], [[0.54, 0.5]]))).toBeCloseTo(0.1, 6);
    // dedos a 0,34 => 0,85 (aberta)
    expect(pinchRatio2D(hand([[0.33, 0.5]], [[0.67, 0.5]]))).toBeCloseTo(0.85, 6);
  });

  it('versão 3D usa profundidade', () => {
    const pts = hand([[0.5, 0.5]], [[0.54, 0.5]]);
    pts[4].z = 0.03;
    const r = pinchRatio3D(pts);
    expect(r).toBeCloseTo(Math.hypot(0.04, 0.03) / 0.4, 6);
  });
});

describe('câmera das mãos (frontal sem AR, de trás com AR)', () => {
  it('pede a câmera certa para cada caso', () => {
    expect(restricoesMaos(false).video).toMatchObject({ facingMode: { ideal: 'user' } });
    expect(restricoesMaos(true).video).toMatchObject({ facingMode: { ideal: 'environment' } });
  });

  it('nunca usa `exact`: um PC de webcam única cai na que existe', () => {
    // `exact` num aparelho sem a câmera pedida é a diferença entre "usa a que
    // tem" e "não liga a câmera nenhuma" — e a aula não pode parar por isso
    expect(JSON.stringify([restricoesMaos(false), restricoesMaos(true)])).not.toMatch(/exact/);
  });

  it('a de trás (que também é o FUNDO do AR) pede resolução de vídeo, não de rastreio', () => {
    // o fundo do AR ocupa a tela inteira: 640x480 fica serrilhado atrás do
    // circuito, e o modelo redimensiona o quadro de qualquer jeito
    expect(restricoesMaos(true).video).toMatchObject({
      width: { ideal: 1280 },
      height: { ideal: 720 },
    });
    expect(restricoesMaos(false).video).toMatchObject({
      width: { ideal: 640 },
      height: { ideal: 480 },
    });
  });

  it('nunca pede áudio: a câmera é das mãos, não da sala', () => {
    expect(restricoesMaos(false).audio).toBe(false);
    expect(restricoesMaos(true).audio).toBe(false);
  });
});

/** Vídeo de mentira: só o que a troca de câmera toca. */
function fakeVideo() {
  return {
    srcObject: null as MediaStream | null,
    muted: false,
    play: () => Promise.resolve(),
  } as unknown as HTMLVideoElement;
}

/** Stream de mentira com faixas que anotam quando foram paradas. */
function fakeStream(nome: string, log: string[]): MediaStream {
  return {
    getTracks: () => [{ stop: () => log.push(`stop:${nome}`), kind: 'video' }],
  } as unknown as MediaStream;
}

/** Um tracker JÁ ligado (o modelo e o laço de quadros não entram nesta costura). */
function trackerLigado(video: HTMLVideoElement, atual: MediaStream) {
  const t = new HandTracker();
  const interno = t as unknown as { video: unknown; stream: unknown; stopped: boolean };
  interno.video = video;
  interno.stream = atual;
  interno.stopped = false;
  return t;
}

describe('troca de câmera (frontal ⇄ de trás) sem derrubar a sessão', () => {
  afterEach(() => vi.unstubAllGlobals());

  const comCamera = (getUserMedia: (r: MediaStreamConstraints) => Promise<MediaStream>) => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  };

  it('um `stop()` no meio da largada faz a largada DESISTIR (não ressuscita a câmera)', async () => {
    let solta!: (s: MediaStream) => void;
    const pendente = new Promise<MediaStream>((r) => {
      solta = r;
    });
    comCamera(() => pendente);
    const t = new HandTracker();
    // modelo já pronto: a largada vai direto para a câmera (o de verdade baixa
    // wasm/modelo, que não existem em teste)
    (t as unknown as { landmarker: unknown }).landmarker = {};
    const video = fakeVideo();

    const largada = t.start(video, { onFrame: () => {} }, false);
    t.stop(); // troca de vista / saída do AR antes de a câmera responder
    const log: string[] = [];
    solta(fakeStream('nova', log));
    await expect(largada).rejects.toThrow(/cancelada/);
    expect(t.running).toBe(false);
    expect(t.getStream()).toBeNull();
    // e a câmera que chegou depois do cancelamento não fica ABERTA: o aparelho
    // só libera a próxima quando esta for fechada
    expect(log).toEqual(['stop:nova']);
  });

  it('a câmera nova é aberta ANTES de soltar a antiga (nada de ficar sem mira)', async () => {
    const log: string[] = [];
    const nova = fakeStream('nova', log);
    const antiga = fakeStream('antiga', log);
    comCamera(async (r) => {
      expect((r.video as MediaTrackConstraints).facingMode).toEqual({ ideal: 'environment' });
      // enquanto a NOVA é pedida a antiga ainda está viva
      expect(log).toEqual([]);
      return nova;
    });
    const video = fakeVideo();
    const t = trackerLigado(video, antiga);

    await t.trocarCamera(video, true);
    expect((video as unknown as { srcObject: MediaStream }).srcObject).toBe(nova);
    expect(log).toEqual(['stop:antiga']);
    expect(t.getStream()).toBe(nova);
  });

  it('celular ocupado: solta a antiga e tenta de novo (a aula continua)', async () => {
    const log: string[] = [];
    const nova = fakeStream('nova', log);
    const antiga = fakeStream('antiga', log);
    let pedidos = 0;
    comCamera(async () => {
      pedidos += 1;
      if (pedidos === 1) throw Object.assign(new Error('ocupada'), { name: 'NotReadableError' });
      return nova;
    });
    const video = fakeVideo();
    const t = trackerLigado(video, antiga);

    await t.trocarCamera(video, false);
    expect(pedidos).toBe(2);
    // a antiga foi solta para liberar a câmera (é o que o aparelho exige)
    expect(log).toEqual(['stop:antiga']);
    expect(t.getStream()).toBe(nova);
    expect(t.running).toBe(true);
  });

  it('sem câmera nenhuma o tracker se dá por PARADO em vez de fingir mira', async () => {
    const antiga = fakeStream('antiga', []);
    comCamera(async () => {
      throw Object.assign(new Error('ocupada'), { name: 'NotReadableError' });
    });
    const video = fakeVideo();
    const t = trackerLigado(video, antiga);

    await expect(t.trocarCamera(video, true)).rejects.toThrow('ocupada');
    expect(t.running).toBe(false);
    expect(t.getStream()).toBeNull();
  });
});
