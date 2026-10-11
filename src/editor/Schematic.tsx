import { useCallback, useRef, useState } from 'react';
import type { Reading } from '../core/netlist';
import { compAt, terminalsAt, wireRoute, type Pt, type Wire } from '../core/netlist';
import { formatValue, labelPos, Symbol } from './symbol';
import { useEditor } from './store';

const CELL = 16;
const GRID = 30; // células 0..29, como no store

const NEUTRAL = [125, 133, 144]; // cinza do fio sem tensão
const mix = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);

/** Tensão de um nó => cor do fio (0 V = cinza, positivo esquenta p/ vermelho, negativo azul). */
function voltageColor(volts: number, maxVolts: number): string {
  if (maxVolts <= 0) return '#7d8590';
  const t = Math.max(-1, Math.min(1, volts / maxVolts));
  if (t >= 0) return `rgb(${mix(NEUTRAL[0], 227, t)}, ${mix(NEUTRAL[1], 69, t)}, ${mix(NEUTRAL[2], 25, t)})`;
  const k = -t;
  return `rgb(${mix(NEUTRAL[0], 60, k)}, ${mix(NEUTRAL[1], 130, k)}, ${mix(NEUTRAL[2], 235, k)})`;
}

/** Menor distância do ponto a um segmento, em células. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  const dx = p.x - (a.x + t * vx);
  const dy = p.y - (a.y + t * vy);
  return Math.hypot(dx, dy);
}

export function Schematic({ reading }: { reading: Reading }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const doc = useEditor((s) => s.doc);
  const placing = useEditor((s) => s.placing);
  const selection = useEditor((s) => s.selection);
  const draft = useEditor((s) => s.draft);
  const colorByVoltage = useEditor((s) => s.colorByVoltage);
  const { place, select, startDraft, moveDraft, endDraft, moveComp } = useEditor();
  const [hoverCell, setHoverCell] = useState<Pt | null>(null);
  const dragOrigin = useRef<{ id: string; dx: number; dy: number } | null>(null);

  /** Cliente => célula da grade (clamp na borda, sem sair do quadro). */
  const toCell = useCallback((e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * GRID;
    const y = ((e.clientY - r.top) / r.height) * GRID;
    return {
      x: Math.max(0, Math.min(GRID - 1, Math.round(x))),
      y: Math.max(0, Math.min(GRID - 1, Math.round(y))),
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const cell = toCell(e);
    if (placing) {
      place(placing, cell);
      return;
    }
    // 1) terminal? => começa um fio (mesma semântica que a pinça usará)
    const term = terminalsAt(doc, cell)[0];
    if (term) {
      startDraft(cell);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    // 2) componente? => seleciona e prepara arraste
    const comp = compAt(doc, cell);
    if (comp) {
      select({ kind: 'comp', id: comp.id });
      dragOrigin.current = { id: comp.id, dx: comp.x - cell.x, dy: comp.y - cell.y };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    // 3) fio? => seleciona (o fio tem traçado com dobras: testa cada trecho)
    const wire = doc.wires.find((w) => {
      const pts = wireRoute(doc, w);
      for (let i = 1; i < pts.length; i++) if (distToSegment(cell, pts[i - 1], pts[i]) < 0.35) return true;
      return false;
    });
    select(wire ? { kind: 'wire', id: wire.id } : null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const cell = toCell(e);
    setHoverCell(cell);
    if (draft) {
      moveDraft(cell);
      return;
    }
    if (dragOrigin.current) {
      const { id, dx, dy } = dragOrigin.current;
      moveComp(id, cell.x + dx, cell.y + dy);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const cell = toCell(e);
    if (draft) endDraft(cell);
    dragOrigin.current = null;
  };

  const onPointerLeave = () => {
    setHoverCell(null);
    if (!draft) dragOrigin.current = null;
  };

  const wires = doc.wires.map((w) => {
    const net = reading.netAt(w.from);
    const v = net ? (reading.nodes.find((n) => n.net === net)?.volts ?? 0) : 0;
    const sel = selection?.kind === 'wire' && selection.id === w.id;
    const pts = wireRoute(doc, w);
    const d = pts.map((p) => `${p.x * CELL},${p.y * CELL}`).join(' ');
    const stroke = sel ? '#58a6ff' : colorByVoltage ? voltageColor(v, reading.maxVolts) : '#7d8590';
    return (
      <g key={w.id} className={sel ? 'wire selected' : 'wire'}>
        {/* caminho largo invisível: facilita o clique sem afinar o traço */}
        <polyline points={d} fill="none" stroke="transparent" strokeWidth={9} />
        <polyline
          points={d}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  });

  const comps = doc.comps.map((c) => (
    <Symbol
      key={c.id}
      comp={c}
      glow={reading.comps.find((r) => r.id === c.id)?.glow ?? 0}
      active={selection?.kind === 'comp' && selection.id === c.id}
    />
  ));

  // fio em arraste: origem -> destino, com o destino "encaixado" no terminal.
  // Rota pelo mesmo algoritmo do fio definitivo (uma dobra só) => o preview é o resultado.
  let draftLine: React.ReactNode = null;
  if (draft) {
    const preview: Wire = { id: '__draft', from: draft.from, to: draft.cursor };
    const pts = wireRoute({ comps: doc.comps, wires: [...doc.wires, preview] }, preview);
    draftLine = (
      <polyline
        points={pts.map((p) => `${p.x * CELL},${p.y * CELL}`).join(' ')}
        fill="none"
        stroke="#58a6ff"
        strokeWidth={2.5}
        strokeDasharray="4 3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  const ghost = placing && hoverCell ? (
    <g transform={`translate(${hoverCell.x * CELL} ${hoverCell.y * CELL})`} className="ghost">
      <Symbol comp={{ id: 'ghost', kind: placing, x: 0, y: 0, rot: 0, value: 0 }} />
    </g>
  ) : null;

  return (
    <svg
      ref={svgRef}
      className={`schematic${placing ? ' placing' : ''}`}
      viewBox={`0 0 ${GRID * CELL} ${GRID * CELL}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <pattern id="grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" stroke="#1c2128" strokeWidth={0.6} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      {wires}
      {draftLine}
      {comps}
      {ghost}

      {/* etiquetas dos valores, por cima do traço mas fora do caminho do mouse */}
      {doc.comps.map((c) => {
        const label = formatValue(c.kind, c.value);
        if (!label) return null;
        const pos = labelPos(c, CELL);
        return (
          <text key={`l${c.id}`} x={pos.x} y={pos.y} className="label" textAnchor={pos.anchor}>
            {label}
          </text>
        );
      })}
    </svg>
  );
}
