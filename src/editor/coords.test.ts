import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLIQUE_TOLERANCIA, foiClique } from './coords';

describe('clique ou arraste (na bancada 3D o arraste ORBITA)', () => {
  it('aperta e solta no mesmo lugar é clique', () => {
    expect(foiClique({ x: 100, y: 200 }, { x: 100, y: 200 })).toBe(true);
  });

  it('tremida do dedo dentro da tolerância ainda é clique', () => {
    expect(foiClique({ x: 100, y: 200 }, { x: 103, y: 201 })).toBe(true);
    expect(foiClique({ x: 100, y: 200 }, { x: 100, y: 200 - CLIQUE_TOLERANCIA })).toBe(true);
  });

  it('passou da tolerância em qualquer eixo: arrastou, é órbita', () => {
    expect(foiClique({ x: 100, y: 200 }, { x: 100 + CLIQUE_TOLERANCIA + 1, y: 200 })).toBe(false);
    expect(foiClique({ x: 100, y: 200 }, { x: 100, y: 200 + CLIQUE_TOLERANCIA + 1 })).toBe(false);
  });

  it('mede na DIAGONAL: 4 px em cada eixo já são 5,7 de arraste', () => {
    expect(foiClique({ x: 0, y: 0 }, { x: 4, y: 4 })).toBe(false);
  });
});

describe('o clique da bancada 3D é o MESMO do quadro 2D', () => {
  const fonte = readFileSync(new URL('./SceneView.tsx', import.meta.url), 'utf8');

  it('fala com o store pelas mesmas ações: aperta e solta no mesmo lugar', () => {
    // Posicionar o item armado, selecionar e abrir a chave são decisões do
    // store (`pressAt`/`releaseAt`): a bancada 3D não reimplementa nenhuma.
    expect(fonte).toMatch(/\.pressAt\(/);
    expect(fonte).toMatch(/\.releaseAt\(/);
  });

  it('nunca chama `moveAt`: arrastar peça no 3D continua sendo da pinça', () => {
    // No 3D o ponteiro que aperta e anda está girando a câmera — quem carrega
    // componente pelo aperto é só o controller das mãos (slot `3d`).
    expect(fonte).not.toMatch(/\bmoveAt\b/);
  });
});
