const NEUTRAL = [125, 133, 144]; // cinza do fio sem tensão
const mix = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);

/**
 * Tensão de um nó => cor (0 V = cinza, positivo esquenta p/ vermelho, negativo azul).
 * Mesma escala na vista 2D e na 3D: a cor significa a mesma coisa nos dois lugares.
 */
export function voltageColor(volts: number, maxVolts: number): string {
  if (maxVolts <= 0) return '#7d8590';
  const t = Math.max(-1, Math.min(1, volts / maxVolts));
  if (t >= 0) return `rgb(${mix(NEUTRAL[0], 227, t)}, ${mix(NEUTRAL[1], 69, t)}, ${mix(NEUTRAL[2], 25, t)})`;
  const k = -t;
  return `rgb(${mix(NEUTRAL[0], 60, k)}, ${mix(NEUTRAL[1], 130, k)}, ${mix(NEUTRAL[2], 235, k)})`;
}
