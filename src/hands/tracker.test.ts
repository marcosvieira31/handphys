import { describe, expect, it } from 'vitest';
import { pinchRatio2D, pinchRatio3D } from './tracker';

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
