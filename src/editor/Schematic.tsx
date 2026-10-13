import { useEffect, useMemo, useRef, useState } from 'react';
import type { Reading } from '../core/netlist';
import { computeFlow, flowDuration } from '../core/flow';
import {
  nearestTerminal,
  samePt,
  terminalCount,
  terminalPos,
  wireRoute,
  type Pt,
  type Wire,
} from '../core/netlist';
import {
  CELL,
  GRAB_DIST,
  SNAP_DIST,
  WIRE_GRAB,
  clientToBoard,
  clientToCell,
  overTrash,
} from './coords';
import { formatValue, labelPos, Symbol } from './symbol';
import { voltageColor } from './colors';
import { useEditor } from './store';
import { viewBoxOf } from './zoomMath';

export function Schematic({ reading }: { reading: Reading }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const doc = useEditor((s) => s.doc);
  const placing = useEditor((s) => s.placing);
  const selection = useEditor((s) => s.selection);
  const draft = useEditor((s) => s.draft);
  const wiring = useEditor((s) => s.wiring);
  const carry = useEditor((s) => s.carry); // célula em que o item armado está sendo carregado
  const colorByVoltage = useEditor((s) => s.colorByVoltage);
  const flow = useEditor((s) => s.flow); // corrente animada nos fios (pode desligar)
  const zoom = useEditor((s) => s.zoom);
  const pan = useEditor((s) => s.pan);
  /** Corrente por trecho de fio: só quando a animação está ligada. */
  const flowMap = useMemo(
    () => (flow ? computeFlow(doc, reading) : null),
    [flow, doc, reading],
  );
  const [hoverCell, setHoverCell] = useState<Pt | null>(null);
  /** Pontos de dedo ativos e o estado do gesto de pinça no toque (zoom + pan). */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; x: number; y: number } | null>(null);
  /** Dedos que andaram desde a última conta: os dois têm de andar, senão a
   *  distância medida é a de um dedo andado e o outro parado (zoom fantasma). */
  const pinchFresh = useRef(new Set<number>());
  /** true = esta gesta de toque virou zoom (não pode virar clique ao soltar). */
  const pinchMode = useRef(false);

  const toCell = (clientX: number, clientY: number): Pt => clientToCell(svgRef.current, clientX, clientY);

  const capture = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    // item armado também captura: sem isso, soltar em cima da lixeira chega no
    // BOTÃO (não no svg) e o arraste morre no caminho.
    if (st.draft || st.grip || st.placing) (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  /** Dois dedos sobre o quadro => zoom pelo afastamento + pan pelo arraste.
   *  Cada dedo chega num evento; só CONTAMOS quando os dois andaram — medir no
   *  meio do caminho dá uma distância de um dedo andado e outro parado, e o
   *  zoom disparava sozinho ao arrastar os dedos. */
  const onTouchPinch = (movedId: number) => {
    const ids = [...pointers.current.keys()];
    if (ids.length !== 2) return;
    const fresh = pinchFresh.current;
    fresh.add(movedId);
    if (!ids.every((id) => fresh.has(id))) return; // falta um dedo andar
    fresh.clear();
    const a = pointers.current.get(ids[0])!;
    const b = pointers.current.get(ids[1])!;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const prev = pinch.current;
    pinch.current = { d, x, y };
    const el = svgRef.current;
    if (!prev || !el || prev.d < 8 || d < 8) return;
    const st = useEditor.getState();
    // acha a âncora ANTES de mexer na vista: o ponto do quadro sob os dedos
    const anchor = clientToBoard(el, prev.x, prev.y);
    st.zoomBy(d / prev.d, anchor);
    const r = el.getBoundingClientRect();
    st.panBy(x - prev.x, y - prev.y, r.width);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size > 1) {
      // chegou o segundo dedo: vira GESTO — desengata o que estivesse na mão
      const st = useEditor.getState();
      st.cancelDraft();
      st.releaseGrip();
      pinch.current = null;
      pinchFresh.current.clear();
      pinchMode.current = true;
      onTouchPinch(e.pointerId);
      return;
    }
    useEditor.getState().pressAt(toCell(e.clientX, e.clientY));
    capture(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      onTouchPinch(e.pointerId);
      return;
    }
    const cell = toCell(e.clientX, e.clientY);
    setHoverCell(cell);
    useEditor.getState().moveAt(cell);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const eraGesture = pinchMode.current;
    pointers.current.delete(e.pointerId);
    pinchFresh.current.clear();
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) pinchMode.current = false;
    if (eraGesture) return; // o gesto já soltou draft/grip; não vira clique
    const st = useEditor.getState();
    // soltou EM CIMA da lixeira = jogou o que estava na mão fora; caso contrário
    // solta normal (termina o fio, larga o componente, posiciona o armado).
    if (overTrash(e.clientX, e.clientY)) st.trash();
    else st.releaseAt(toCell(e.clientX, e.clientY));
  };

  const dropPointers = () => {
    pointers.current.clear();
    pinch.current = null;
    pinchFresh.current.clear();
    pinchMode.current = false;
  };

  const onPointerLeave = () => {
    setHoverCell(null);
    const st = useEditor.getState();
    if (!st.draft) st.releaseGrip();
    dropPointers();
  };

  // Roda do mouse (e o zoom do trackpad, que chega como ctrl+wheel): amplia
  // EMBAIXO DO CURSOR. Listener nativo não-passivo: o React registra wheel como
  // passivo e o preventDefault viraria aviso no console.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.cancelable) return;
      e.preventDefault();
      const anchor = clientToBoard(el, e.clientX, e.clientY);
      useEditor.getState().zoomBy(e.deltaY < 0 ? 1.13 : 1 / 1.13, anchor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

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
        {/* corrente: gotas em movimento por trecho (velocidade ∝ intensidade;
            sentido = sinal da corrente; o CSS cuida da animação) */}
        {(flowMap?.get(w.id) ?? []).map((part, i) => (
          <polyline
            key={i}
            className="wire-flow"
            points={part.pts.map((p) => `${p.x * CELL},${p.y * CELL}`).join(' ')}
            style={{
              animationDuration: `${flowDuration(part.amps)}s`,
              animationDirection: part.amps < 0 ? 'reverse' : 'normal',
            }}
          />
        ))}
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

  // fantasma do item armado: em cima da célula em que está sendo CARREGADO
  // (pinça/mouse com aperto) e, sem aperto, sobre a célula em que o mouse paira.
  const ghostCell = carry ?? hoverCell;
  const ghost = placing && ghostCell ? (
    <g transform={`translate(${ghostCell.x * CELL} ${ghostCell.y * CELL})`} className="ghost">
      <Symbol comp={{ id: 'ghost', kind: placing, x: 0, y: 0, rot: 0, value: 0 }} />
    </g>
  ) : null;

  // mira sobre terminal: o cursor avisa que dali sai fio (no modo fio, sempre mira)
  const hoverTerm =
    !placing && hoverCell ? nearestTerminal(doc, hoverCell, wiring ? WIRE_GRAB : GRAB_DIST) : null;

  const vb = viewBoxOf({ zoom, pan });

  return (
    <svg
      ref={svgRef}
      className={`schematic${placing ? ' placing' : ''}`}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      style={hoverTerm || draft || wiring ? { cursor: 'crosshair' } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={dropPointers}
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
