import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { panCameraBy } from './buildScene';

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
