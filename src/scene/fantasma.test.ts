import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildComp, marcaFantasma } from './buildScene';
import { ghostNode } from './layout';

/** Materiais de todas as malhas do grupo (um por peça: `mat()` não compartilha). */
function materiais(g: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = [];
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) out.push(mesh.material as THREE.MeshStandardMaterial);
  });
  return out;
}

describe('fantasma do item armado (a prévia que acompanha a mira)', () => {
  it('vira véu translúcido que não escreve no z-buffer, tingido de azul', () => {
    const g = new THREE.Group();
    g.add(buildComp(ghostNode('resistor', { x: 10, y: 10 })));
    marcaFantasma(g);

    const mats = materiais(g);
    expect(mats.length).toBeGreaterThan(0);
    for (const m of mats) {
      expect(m.transparent).toBe(true);
      expect(m.opacity).toBeCloseTo(0.45, 12);
      expect(m.depthWrite).toBe(false);
      expect(m.emissive.getHex()).toBe(0x58a6ff);
    }
  });

  it('não encosta na peça de VERDADE: cada uma nasce com os próprios materiais', () => {
    // `mat()` cria um material novo a cada peça — é isso que deixa tingir a
    // prévia sem apagar (nem clarear) o componente que já está na bancada.
    const real = buildComp(ghostNode('vsource', { x: 4, y: 4 }));
    const previa = new THREE.Group();
    previa.add(buildComp(ghostNode('vsource', { x: 4, y: 4 })));
    marcaFantasma(previa);

    for (const m of materiais(real)) {
      expect(m.transparent).toBe(false);
      expect(m.opacity).toBe(1);
      expect(m.depthWrite).toBe(true);
    }
  });
});
