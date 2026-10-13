import type { CircuitDoc } from '../core/netlist';

const LOOP = (y: number) => [
  { from: { x: 5, y }, to: { x: 9, y } },
  { from: { x: 11, y }, to: { x: 14, y } },
  { from: { x: 14, y }, to: { x: 14, y: y + 5 } },
  { from: { x: 14, y: y + 5 }, to: { x: 3, y: y + 5 } },
  { from: { x: 3, y: y + 5 }, to: { x: 3, y } },
];

/**
 * Circuitos prontos (usados no editor E no Cardboard): laço fechado
 * fonte → carga, com retorno por baixo (nunca por cima dos polos).
 * Todo exemplo aqui resolve sem erro — há teste que garante.
 */
export const EXAMPLES: { name: string; doc: CircuitDoc }[] = [
  {
    name: 'Lei de Ohm',
    doc: {
      comps: [
        { id: 'bat1', kind: 'vsource', x: 4, y: 3, rot: 0, value: 9 },
        { id: 'r1', kind: 'resistor', x: 10, y: 3, rot: 0, value: 100 },
      ],
      wires: LOOP(3).map((w, i) => ({ id: `w${i + 1}`, ...w })),
    },
  },
  {
    name: 'Divisor de tensão',
    doc: {
      comps: [
        { id: 'bat1', kind: 'vsource', x: 4, y: 2, rot: 0, value: 9 },
        { id: 'r1', kind: 'resistor', x: 12, y: 2, rot: 0, value: 100 },
        { id: 'r2', kind: 'resistor', x: 12, y: 7, rot: 0, value: 100 },
      ],
      wires: [
        { id: 'w1', from: { x: 5, y: 2 }, to: { x: 11, y: 2 } },
        { id: 'w2', from: { x: 13, y: 2 }, to: { x: 13, y: 7 } },
        { id: 'w3', from: { x: 11, y: 7 }, to: { x: 3, y: 7 } },
        { id: 'w4', from: { x: 3, y: 7 }, to: { x: 3, y: 2 } },
      ],
    },
  },
  {
    name: 'Paralelo',
    doc: {
      comps: [
        { id: 'bat1', kind: 'vsource', x: 4, y: 4, rot: 0, value: 9 },
        { id: 'r1', kind: 'resistor', x: 11, y: 2, rot: 0, value: 100 },
        { id: 'r2', kind: 'resistor', x: 11, y: 4, rot: 0, value: 100 },
        { id: 'r3', kind: 'resistor', x: 11, y: 6, rot: 0, value: 100 },
      ],
      // Escada (o desenho clássico do bancinho): o + alimenta um trilho à esquerda
      // que ramifica nas três entradas; um trilho à direita coleta as três saídas;
      // e o retorno contorna por baixo do banco até o − da fonte. Assim o caminho
      // de corrente fecha num laço legível, sem se embutir no trilho direito nem
      // passar pela fileira do meio (antes o retorno cortava entre r2 e r3).
      wires: [
        { id: 'w1', from: { x: 5, y: 4 }, to: { x: 8, y: 4 } },
        { id: 'w2', from: { x: 8, y: 4 }, to: { x: 8, y: 2 } },
        { id: 'w3', from: { x: 8, y: 4 }, to: { x: 8, y: 6 } },
        { id: 'w4', from: { x: 8, y: 2 }, to: { x: 10, y: 2 } },
        { id: 'w5', from: { x: 8, y: 4 }, to: { x: 10, y: 4 } },
        { id: 'w6', from: { x: 8, y: 6 }, to: { x: 10, y: 6 } },
        { id: 'w7', from: { x: 12, y: 2 }, to: { x: 15, y: 2 } },
        { id: 'w8', from: { x: 12, y: 4 }, to: { x: 15, y: 4 } },
        { id: 'w9', from: { x: 12, y: 6 }, to: { x: 15, y: 6 } },
        { id: 'w10', from: { x: 15, y: 2 }, to: { x: 15, y: 6 } },
        { id: 'w11', from: { x: 15, y: 6 }, to: { x: 15, y: 9 } },
        { id: 'w12', from: { x: 15, y: 9 }, to: { x: 3, y: 4 } },
      ],
    },
  },
];
