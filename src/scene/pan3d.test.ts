import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  boardToWorld,
  distForZoom,
  HOME_DIST,
  panCameraBy,
  rollCameraBy,
  worldToBoard,
  zoomForDist,
} from './buildScene';

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

describe('rollCameraBy (giro da bancada pela rotação das mãos)', () => {
  /** Câmera inclinada como a bancada de verdade (o enquadro de chegada). */
  function rigTilt() {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
    camera.position.set(13, 17, 23);
    const target = new THREE.Vector3(0, 0, 1);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    return { camera, target };
  }

  it('orbita o eixo VERTICAL pelo alvo: altura (y), distância e alvo intactos', () => {
    const { camera, target } = rigTilt();
    const dist = camera.position.distanceTo(target);
    rollCameraBy(camera, target, Math.PI / 2);
    expect(camera.position.y).toBeCloseTo(17, 10); // altura não muda (eixo vertical!)
    expect(camera.position.x).toBeCloseTo(22, 10); // (x,z)=(13,22) girado 90° => (22,-13)
    expect(camera.position.z).toBeCloseTo(-12, 10); // alvo em z=1: -13+1
    expect(camera.position.distanceTo(target)).toBeCloseTo(dist, 10);
    expect(target.x).toBe(0); // alvo parado
    expect(target.y).toBe(0);
    expect(target.z).toBe(1);
  });

  it('rad > 0 orbita anti-horário por cima (vista de cima): a mão horária leva o conteúdo', () => {
    const { camera, target } = rigTilt();
    // azimute no plano da bancada (XZ) do deslocamento câmera→alvo
    const azimuth = () => Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
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

describe('enquadramento único 2D↔3D (mapeamento quadro ↔ bancada)', () => {
  it('centro do quadro = centro da bancada; extremos batem na borda da mesa', () => {
    expect(boardToWorld({ x: 240, y: 240 })).toEqual([0, 0]);
    expect(boardToWorld({ x: 0, y: 0 })).toEqual([-15, -15]);
    expect(boardToWorld({ x: 480, y: 480 })).toEqual([15, 15]);
  });

  it('worldToBoard é o inverso exato (ida e volta sem deriva)', () => {
    for (const b of [
      { x: 240, y: 240 },
      { x: 80, y: 320 },
      { x: 0, y: 480 },
      { x: 123.4, y: 456.7 },
    ]) {
      const [wx, wz] = boardToWorld(b);
      const back = worldToBoard(wx, wz);
      expect(back.x).toBeCloseTo(b.x, 10);
      expect(back.y).toBeCloseTo(b.y, 10);
    }
  });

  it('zoom 1 = a distância de chegada (bancada inteira); ida e volta sem deriva', () => {
    expect(zoomForDist(HOME_DIST)).toBe(1);
    for (const z of [1, 1.5, 2, 3.5]) {
      expect(zoomForDist(distForZoom(z))).toBeCloseTo(z, 10);
    }
  });

  it('zoom 2D preso em [1,4]: distâncias extremas da câmera não reinterpretem a vista', () => {
    expect(zoomForDist(80)).toBe(1); // mais longe que a chegada => "cabe tudo"
    expect(zoomForDist(2)).toBe(4); // perto demais => o teto do quadro
    expect(distForZoom(4)).toBeLessThan(8); // o teto da 2D equivale a bem perto
  });
});
