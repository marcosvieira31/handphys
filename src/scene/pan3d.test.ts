import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { panCameraBy, rollCameraBy } from './buildScene';

/** Câmera olhando para a origem de frente (direita = +X, cima = +Y na tela). */
function rig(z: number) {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  camera.position.set(0, 0, z);
  const target = new THREE.Vector3(0, 0, 0);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return { camera, target };
}

describe('panCameraBy (bancada 3D)', () => {
  it('câmera e alvo andam JUNTOS: a órbita fica intacta', () => {
    const { camera, target } = rig(10);
    const antes = camera.position.clone().sub(target);
    panCameraBy(camera, target, 100, 0, 500);
    const k = (2 * Math.tan(Math.PI / 6) * 10) / 500; // fov 60° => tan(30°)
    expect(target.x).toBeCloseTo(-100 * k, 10);
    expect(camera.position.x).toBeCloseTo(-100 * k, 10);
    const depois = camera.position.clone().sub(target);
    expect(depois.x).toBeCloseTo(antes.x, 10);
    expect(depois.y).toBeCloseTo(antes.y, 10);
    expect(depois.z).toBeCloseTo(antes.z, 10);
  });

  it('conteúdo acompanha o dedo: p/ a direita a câmera vai p/ a esquerda, p/ baixo ela sobe', () => {
    const { camera, target } = rig(10);
    panCameraBy(camera, target, 50, 0, 500);
    expect(camera.position.x).toBeLessThan(0); // dedo p/ direita => câmera p/ esquerda
    const { camera: c2, target: t2 } = rig(10);
    panCameraBy(c2, t2, 0, 40, 500);
    expect(c2.position.y).toBeGreaterThan(0); // dedo p/ baixo => câmera sobe
    expect(t2.y).toBeGreaterThan(0);
  });

  it('bancada mais afastada desloca mais por px (mundo por px cresce com a distância)', () => {
    const perto = rig(10);
    const longe = rig(20);
    panCameraBy(perto.camera, perto.target, 100, 0, 500);
    panCameraBy(longe.camera, longe.target, 100, 0, 500);
    expect(Math.abs(longe.target.x)).toBeCloseTo(2 * Math.abs(perto.target.x), 8);
  });

  it('altura 0 ou negativa não divide por zero', () => {
    const { camera, target } = rig(10);
    expect(() => panCameraBy(camera, target, 10, 10, 0)).not.toThrow();
  });
});

describe('rollCameraBy (giro do eixo Z pela rotação das mãos)', () => {
  /** Câmera inclinada como a bancada de verdade (offset com X e Y na horizontal). */
  function rigTilt() {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
    camera.position.set(13, 17, 23);
    const target = new THREE.Vector3(0, 0, 1);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    return { camera, target };
  }

  it('gira a câmera ao redor do Z do mundo PASSANDO PELO ALVO (distância intacta)', () => {
    const { camera, target } = rigTilt();
    const dist = camera.position.distanceTo(target);
    rollCameraBy(camera, target, Math.PI / 2);
    expect(camera.position.z).toBeCloseTo(23, 10); // altura não muda
    expect(camera.position.x).toBeCloseTo(-17, 10); // (13,17) girado 90° => (-17,13)
    expect(camera.position.y).toBeCloseTo(13, 10);
    expect(camera.position.distanceTo(target)).toBeCloseTo(dist, 10);
    expect(target.x).toBe(0); // alvo parado
    expect(target.y).toBe(0);
    expect(target.z).toBe(1);
  });

  it('rad > 0 orbita anti-horário (regra da mão direita): a mão horária leva o conteúdo junto', () => {
    const { camera, target } = rigTilt();
    const azimuth = () =>
      Math.atan2(camera.position.y - target.y, camera.position.x - target.x);
    const a0 = azimuth();
    rollCameraBy(camera, target, 0.3);
    expect(azimuth()).toBeCloseTo(a0 + 0.3, 10);
  });

  it('giro e contra-giro devolvem a câmera ao enquadramento', () => {
    const { camera, target } = rigTilt();
    const antes = camera.position.clone();
    rollCameraBy(camera, target, 0.7);
    rollCameraBy(camera, target, -0.7);
    expect(camera.position.x).toBeCloseTo(antes.x, 10);
    expect(camera.position.y).toBeCloseTo(antes.y, 10);
    expect(camera.position.z).toBeCloseTo(antes.z, 10);
  });
});
