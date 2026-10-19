import { describe, expect, it } from 'vitest';
import { pinchRatio2D, pinchRatio3D, restricoesMaos } from './tracker';

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
