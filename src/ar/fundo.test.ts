import { describe, expect, it, vi } from 'vitest';
import {
  abrirFundo,
  fecharFundo,
  fonteDeFundo,
  mensagemDeErroCamera,
  restricoesFundo,
  type FonteFundo,
} from './fundo';

/** Um stream de mentira: só as faixas, que é o que o `fecharFundo` toca. */
function streamFalso(n = 2) {
  const faixas = Array.from({ length: n }, () => ({ stop: vi.fn() }));
  return {
    stream: { getTracks: () => faixas } as unknown as MediaStream,
    faixas,
  };
}

/** Um <video> de mentira: o `abrirFundo` só escreve `srcObject`/`muted` e dá play. */
function videoFalso() {
  const play = vi.fn(async () => {});
  return { el: { srcObject: null, muted: false, play } as unknown as HTMLVideoElement, play };
}

describe('AR de bolso: de onde vem o vídeo do fundo', () => {
  it('com as mãos ligadas, o fundo é o stream do rastreio (não abre câmera nenhuma)', () => {
    const { stream } = streamFalso();
    expect(fonteDeFundo(stream)).toBe('maos');
  });

  it('sem as mãos, o fundo abre a própria câmera', () => {
    expect(fonteDeFundo(null)).toBe('propria');
  });

  it('a câmera própria é pedida como traseira e em 16:9, sem exigir nada', () => {
    const r = restricoesFundo();
    const video = r.video as MediaTrackConstraints;
    expect(video.facingMode).toEqual({ ideal: 'environment' }); // `ideal`: o PC não tem traseira
    expect(video.width).toEqual({ ideal: 1280 });
    expect(video.height).toEqual({ ideal: 720 });
    expect(r.audio).toBe(false); // microfone nunca
  });

  it('reusa as mãos SEM pedir câmera: uma webcam só, zero permissão a mais', async () => {
    const { stream } = streamFalso();
    const pedir = vi.fn();
    const { el, play } = videoFalso();
    const fundo = await abrirFundo(el, stream, pedir);
    expect(pedir).not.toHaveBeenCalled();
    expect(fundo).toEqual({ stream, fonte: 'maos' });
    expect(el.srcObject).toBe(stream);
    expect(el.muted).toBe(true);
    expect(play).toHaveBeenCalled();
  });

  it('sem as mãos, pede a câmera com as restrições do fundo e mostra no vídeo', async () => {
    const { stream } = streamFalso();
    const pedir = vi.fn(async () => stream);
    const { el } = videoFalso();
    const fundo = await abrirFundo(el, null, pedir);
    expect(pedir).toHaveBeenCalledWith(restricoesFundo());
    expect(fundo).toEqual({ stream, fonte: 'propria' });
    expect(el.srcObject).toBe(stream);
  });

  it('fechar só desliga a câmera PRÓPRIA: o stream das mãos continua na mira', () => {
    const propria = streamFalso();
    fecharFundo({ stream: propria.stream, fonte: 'propria' });
    expect(propria.faixas.every((f) => f.stop.mock.calls.length === 1)).toBe(true);

    const maos = streamFalso();
    fecharFundo({ stream: maos.stream, fonte: 'maos' });
    expect(maos.faixas.some((f) => f.stop.mock.calls.length > 0)).toBe(false);
  });

  it('fechar sem nada ligado não explode (sair do AR antes de a câmera responder)', () => {
    expect(() => fecharFundo(null)).not.toThrow();
  });

  it('cada falha de câmera tem a sua frase, e nenhuma é o nome cru do erro', () => {
    const nomes = ['NotAllowedError', 'SecurityError', 'NotFoundError', 'NotReadableError'];
    const frases = nomes.map(mensagemDeErroCamera);
    expect(new Set(frases).size).toBeGreaterThan(1);
    expect(mensagemDeErroCamera('NotAllowedError')).toMatch(/permita o acesso/i);
    expect(mensagemDeErroCamera('NotFoundError')).toMatch(/nenhuma câmera/i);
    expect(mensagemDeErroCamera('NotReadableError')).toMatch(/ocupada/i);
    expect(mensagemDeErroCamera('SecurityError')).toBe(mensagemDeErroCamera('NotAllowedError'));
    for (const nome of [...nomes, 'WhoKnowsError']) {
      const frase = mensagemDeErroCamera(nome);
      expect(frase.length).toBeGreaterThan(10);
      expect(frase).not.toContain('Error');
    }
  });
});

describe('AR de bolso: o tipo da fonte é um conjunto fechado', () => {
  it('só existem duas origens possíveis para o fundo', () => {
    const fontes: FonteFundo[] = ['maos', 'propria'];
    expect(new Set(fontes).size).toBe(2);
  });
});
