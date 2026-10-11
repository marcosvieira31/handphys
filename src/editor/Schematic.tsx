import { useRef, useState } from 'react';
import type { Reading } from '../core/netlist';
import {
  nearestTerminal,
  samePt,
  terminalCount,
  terminalPos,
  wireRoute,
  type Pt,
  type Wire,
} from '../core/netlist';
import { CELL, GRAB_DIST, GRID, SNAP_DIST, WIRE_GRAB, clientToCell } from './coords';
import { formatValue, labelPos, Symbol } from './symbol';
import { voltageColor } from './colors';
import { useEditor } from './store';

export function Schematic({ reading }: { reading: Reading }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const doc = useEditor((s) => s.doc);
  const placing = useEditor((s) => s.placing);
  const selection = useEditor((s) => s.selection);
  const draft = useEditor((s) => s.draft);
  const wiring = useEditor((s) => s.wiring);
  const colorByVoltage = useEditor((s) => s.colorByVoltage);
  const [hoverCell, setHoverCell] = useState<Pt | null>(null);

  const toCell = (clientX: number, clientY: number): Pt => clientToCell(svgRef.current, clientX, clientY);

  const capture = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    if (st.draft || st.grip) (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    useEditor.getState().pressAt(toCell(e.clientX, e.clientY));
    capture(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const cell = toCell(e.clientX, e.clientY);
    setHoverCell(cell);
    useEditor.getState().moveAt(cell);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    useEditor.getState().releaseAt(toCell(e.clientX, e.clientY));
  };

  const onPointerLeave = () => {
    setHoverCell(null);
    const st = useEditor.getState();
    if (!st.draft) st.releaseGrip();
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
  // Alvo do imã (igual ao do store): o anel dele acende para mostrar onde vai grudar.
  const snap = draft
    ? (() => {
        const hit = nearestTerminal(doc, draft.cursor, SNAP_DIST);
        return hit && !samePt(hit.pos, draft.from) ? hit.pos : null;
      })()
    : null;
  let draftLine: React.ReactNode = null;
  if (draft) {
    const preview: Wire = { id: '__draft', from: draft.from, to: snap ?? draft.cursor };
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

  // enquanto o fio está "na mão", todos os terminais acendem: é onde pode soltar.
  // No MODO FIO os anéis ficam acesos o tempo todo (dá para mirar antes de clicar).
  const showTargets = draft !== null || wiring;
  let targets: React.ReactNode = null;
  if (showTargets) {
    const hoverGrab =
      wiring && !draft && hoverCell ? nearestTerminal(doc, hoverCell, WIRE_GRAB) : null;
    const rings: React.ReactNode[] = [];
    for (const c of doc.comps) {
      const n = terminalCount(c.kind);
      for (let i = 0; i < n; i++) {
        const pos = terminalPos(c, i as 0 | 1);
        if (draft && samePt(pos, draft.from)) continue;
        const isSnap =
          (snap !== null && samePt(pos, snap)) ||
          (hoverGrab !== null && samePt(pos, hoverGrab.pos));
        rings.push(
          <circle
            key={`${c.id}t${i}`}
            cx={pos.x * CELL}
            cy={pos.y * CELL}
            r={isSnap ? 9 : 6.5}
            fill="none"
            stroke={isSnap ? '#58a6ff' : '#8b949e'}
            strokeWidth={isSnap ? 2.5 : 1.5}
            strokeDasharray={isSnap ? undefined : '3 2'}
            opacity={isSnap ? 1 : 0.75}
          />,
        );
      }
    }
    targets = <g pointerEvents="none">{rings}</g>;
  }

  const ghost = placing && hoverCell ? (
    <g transform={`translate(${hoverCell.x * CELL} ${hoverCell.y * CELL})`} className="ghost">
      <Symbol comp={{ id: 'ghost', kind: placing, x: 0, y: 0, rot: 0, value: 0 }} />
    </g>
  ) : null;

  // mira sobre terminal: o cursor avisa que dali sai fio (no modo fio, sempre mira)
  const hoverTerm =
    !placing && hoverCell ? nearestTerminal(doc, hoverCell, wiring ? WIRE_GRAB : GRAB_DIST) : null;

  return (
    <svg
      ref={svgRef}
      className={`schematic${placing ? ' placing' : ''}`}
      viewBox={`0 0 ${GRID * CELL} ${GRID * CELL}`}
      style={hoverTerm || draft || wiring ? { cursor: 'crosshair' } : undefined}
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
      {targets}
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
