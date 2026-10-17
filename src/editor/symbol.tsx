import type { CompKind, Placed } from '../core/netlist';
import { useTema, type Tema } from './theme';

export interface SymbolProps {
  comp: Placed;
  /** Brilho da lâmpada (0..1,5), vindo da simulação. */
  glow?: number;
  /** Traço/terminais destacados (seleção ou TerminalButton ativo). */
  active?: boolean;
}

/** Meia-largura do corpo na grade: 1 = corpo + haste, 2 = corpo + terminal. */
const BODY = 1;

/**
 * As cores do DESENHO do quadro (o "papel" do esquemático), por tema: o tema
 * claro tem tabuleiro branco, então o interior das peças (que existe para o fio
 * não aparecer por dentro do símbolo) também é branco. O traço escurece, o
 * âmbar da chave fecha fica mais fechado — o desenho continua legível nos dois.
 */
export interface CoresQuadro {
  /** O interior das peças — é o "papel" do quadro. */
  body: string;
  /** O traço dos componentes. */
  stroke: string;
  /** Terminal/peça em foco. */
  accent: string;
  /** Chave fechada (a faca encostada). */
  hot: string;
  /** Lâmpada acesa. */
  glow: string;
  /** Terminal em repouso. */
  dot: string;
}

export const CORES_QUADRO: Record<Tema, CoresQuadro> = {
  escuro: {
    body: '#0d1117',
    stroke: '#c9d1d9',
    accent: '#58a6ff',
    hot: '#e3b341',
    glow: '#f2cc60',
    dot: '#8b949e',
  },
  claro: {
    body: '#ffffff',
    stroke: '#1f2937',
    accent: '#0969da',
    hot: '#b06a00',
    glow: '#e3b341',
    dot: '#6b7280',
  },
};

/**
 * Desenha um componente CENTRADO na origem, já rotacionado.
 * A geometria espelha terminalPos/terminalDir de ../core/netlist: o terminal 0
 * fica em x = -1 e o 1 em x = +1 (antes da rotação). Se um desenho sair do
 * lugar, o fio deixa de encostar — por isso os dois vivem no mesmo módulo.
 */
export function Symbol({ comp, glow = 0, active = false }: SymbolProps) {
  const cores = CORES_QUADRO[useTema()];
  const stroke = active ? cores.accent : cores.stroke;
  const rot = comp.rot;
  const terminal = (i: 0 | 1) => (
    <circle
      key={`t${i}`}
      cx={(i === 0 ? -BODY : BODY) * 16}
      cy={0}
      r={active ? 5.5 : 4.5}
      fill={active ? cores.accent : cores.dot}
      className="terminal"
    />
  );

  return (
    <g transform={`translate(${comp.x * 16} ${comp.y * 16}) rotate(${rot})`} className="symbol">
      {/* hastes até os terminais, comuns a quase todos */}
      {comp.kind !== 'ground' && comp.kind !== 'vsource' && (
        <>
          <line x1={-BODY * 16} y1={0} x2={-10} y2={0} stroke={stroke} strokeWidth={2} />
          <line x1={10} y1={0} x2={BODY * 16} y2={0} stroke={stroke} strokeWidth={2} />
        </>
      )}

      {comp.kind === 'resistor' && (
        <rect x={-10} y={-5} width={20} height={10} rx={1.5} fill={cores.body} stroke={stroke} strokeWidth={2} />
      )}

      {comp.kind === 'capacitor' && (
        <>
          <line x1={-4} y1={-9} x2={-4} y2={9} stroke={stroke} strokeWidth={2.5} />
          <line x1={4} y1={-9} x2={4} y2={9} stroke={stroke} strokeWidth={2.5} />
        </>
      )}

      {comp.kind === 'lamp' && (
        <>
          {glow > 0 && <circle r={11 + glow * 3} fill={cores.glow} opacity={Math.min(0.55, glow * 0.4)} />}
          <circle r={9} fill={glow > 0 ? cores.glow : cores.body} stroke={stroke} strokeWidth={2} />
          <line x1={-6.4} y1={-6.4} x2={6.4} y2={6.4} stroke={cores.body} strokeWidth={2} />
          <line x1={-6.4} y1={6.4} x2={6.4} y2={-6.4} stroke={cores.body} strokeWidth={2} />
        </>
      )}

      {comp.kind === 'switch' && (
        <>
          <circle cx={-10} cy={0} r={2.5} fill={stroke} />
          <circle cx={10} cy={0} r={2.5} fill={stroke} />
          <line
            x1={-10}
            y1={0}
            x2={comp.closed ? 10 : 7}
            y2={comp.closed ? 0 : -11}
            stroke={comp.closed ? cores.hot : stroke}
            strokeWidth={2.5}
          />
        </>
      )}

      {comp.kind === 'vsource' && (
        <>
          {/* pilha DC: placa curta e grossa = negativa (terminal 0);
              placa longa e fina = positiva (terminal 1). Símbolo do livro didático. */}
          <line x1={-BODY * 16} y1={0} x2={-5} y2={0} stroke={stroke} strokeWidth={2} />
          <line x1={5} y1={0} x2={BODY * 16} y2={0} stroke={stroke} strokeWidth={2} />
          <line x1={-5} y1={-8} x2={-5} y2={8} stroke={stroke} strokeWidth={4.5} />
          <line x1={5} y1={-15} x2={5} y2={15} stroke={stroke} strokeWidth={2.5} />
          <text x={-12} y={-7} fill={stroke} fontSize={9} textAnchor="middle">−</text>
          <text x={12} y={-7} fill={stroke} fontSize={9} textAnchor="middle">+</text>
        </>
      )}

      {comp.kind === 'ground' && (
        <>
          <line x1={0} y1={0} x2={0} y2={8} stroke={stroke} strokeWidth={2} />
          <line x1={-11} y1={8} x2={11} y2={8} stroke={stroke} strokeWidth={2.5} />
          <line x1={-6.5} y1={13} x2={6.5} y2={13} stroke={stroke} strokeWidth={2.5} />
          <line x1={-2.5} y1={18} x2={2.5} y2={18} stroke={stroke} strokeWidth={2.5} />
        </>
      )}

      {comp.kind !== 'ground' && (
        <>
          {terminal(0)}
          {terminal(1)}
        </>
      )}
    </g>
  );
}

/** Onde botar a etiqueta do valor sem esbarrar no símbolo (abaixo, ou à direita na vertical). */
export function labelPos(c: Placed, cell: number): { x: number; y: number; anchor: 'start' | 'middle' } {
  const cx = c.x * cell;
  const cy = c.y * cell;
  if (c.rot === 90 || c.rot === 270) return { x: cx + cell * 0.8, y: cy + cell * 0.35, anchor: 'start' };
  return { x: cx, y: cy + cell * 1.0, anchor: 'middle' };
}

/** Valor legível para a etiqueta do símbolo (e para o painel). */
export function formatValue(kind: CompKind, value: number): string {
  switch (kind) {
    case 'vsource':
      return `${trim(value)} V`;
    case 'resistor':
    case 'lamp':
      return `${trim(value)} Ω`;
    case 'capacitor':
      return value >= 1e-3 ? `${trim(value * 1e3)} mF` : `${trim(value * 1e6)} µF`;
    default:
      return '';
  }
}

/** 9 → "9", 1e-6 → "1", 0.0001 → "0,1" (pt-BR, sem zeros sobrando). */
function trim(v: number): string {
  const s = Number(v.toPrecision(4));
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(s);
}

/** Corrente/leitura em unidade amigável (mA quando cabe). */
export function formatAmps(a: number): string {
  const abs = Math.abs(a);
  if (abs >= 1) return `${trim(a)} A`;
  return `${trim(a * 1e3)} mA`;
}
