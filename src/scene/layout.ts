import type { CircuitDoc, CompKind, Reading } from '../core/netlist';
import { wireRoute } from '../core/netlist';

/**
 * Grade 2D => mundo 3D, sem three.js (puro e testável no Vitest).
 * Uma célula = 1 unidade; o quadro 30x30 fica centrado na origem, deitado no
 * plano XZ (x = leste, z = sul: visto de cima é igual ao esquemático).
 */
export const WORLD = 30;

/** Altura dos fios e terminais sobre a bancada (corpos assentam em y=0). */
export const WIRE_Y = 0.25;

export function cellToWorld(x: number, y: number): [number, number] {
  return [x - (WORLD - 1) / 2, y - (WORLD - 1) / 2];
}

/**
 * Rotação da grade (horária na tela, como o `rotate` do SVG) => giro em Y.
 * Tela x vira mundo x, tela y vira mundo z: o giro horário visto de cima é
 * anti-horário em torno de +Y, daí o sinal negativo.
 */
export function rotToRotY(rot: 0 | 90 | 180 | 270): number {
  if (rot === 0) return 0;
  return ((-rot * Math.PI) / 180);
}

export interface CompNode {
  id: string;
  kind: CompKind;
  /** Centro no mundo (y=0 é a bancada). */
  wx: number;
  wz: number;
  rotY: number;
  value: number;
  closed: boolean;
  /** Brilho da lâmpada (0 apagada), vindo da simulação. */
  glow: number;
}

export interface WireNode {
  id: string;
  /** Traçado ortogonal elevado (y=WIRE_Y), pronto para tubo/varal. */
  points: [number, number, number][];
  /** Cor pela tensão do nó (mesma escala do 2D). */
  color: string;
}

export interface SceneLayout {
  comps: CompNode[];
  wires: WireNode[];
  /** Posição das lâmpadas acesas (a luz pontual compartilhada vai na mais forte). */
  lit: [number, number, number][];
}

/**
 * Documento + leitura => descrição da cena, sem dependência de render.
 * O `buildScene` (three.js) só materializa estes nós.
 */
export function layoutScene(
  doc: CircuitDoc,
  reading: Reading,
  colorFor: (volts: number, maxVolts: number) => string,
): SceneLayout {
  const comps: CompNode[] = doc.comps.map((c) => {
    const [wx, wz] = cellToWorld(c.x, c.y);
    return {
      id: c.id,
      kind: c.kind,
      wx,
      wz,
      rotY: rotToRotY(c.rot),
      value: c.value,
      closed: c.closed ?? false,
      glow: reading.comps.find((r) => r.id === c.id)?.glow ?? 0,
    };
  });

  const wires: WireNode[] = doc.wires.map((w) => {
    const net = reading.netAt(w.from);
    const volts = net ? (reading.nodes.find((n) => n.net === net)?.volts ?? 0) : 0;
    const points = wireRoute(doc, w).map((p) => {
      const [wx, wz] = cellToWorld(p.x, p.y);
      return [wx, WIRE_Y, wz] as [number, number, number];
    });
    return { id: w.id, points, color: colorFor(volts, reading.maxVolts) };
  });

  const lit = comps
    .filter((c) => c.kind === 'lamp' && c.glow > 0)
    .sort((a, b) => b.glow - a.glow)
    .map((c) => [c.wx, 1.2, c.wz] as [number, number, number]);

  return { comps, wires, lit };
}
