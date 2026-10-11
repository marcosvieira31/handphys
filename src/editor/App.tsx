import { useEffect, useState } from 'react';
import { readCircuit, type CircuitDoc } from '../core/netlist';
import { Inspector } from './Inspector';
import { Palette } from './Palette';
import { Schematic } from './Schematic';
import { SceneView } from './SceneView';
import { useEditor } from './store';

const LOOP = (y: number) => [
  { from: { x: 5, y }, to: { x: 9, y } },
  { from: { x: 11, y }, to: { x: 14, y } },
  { from: { x: 14, y }, to: { x: 14, y: y + 5 } },
  { from: { x: 14, y: y + 5 }, to: { x: 3, y: y + 5 } },
  { from: { x: 3, y: y + 5 }, to: { x: 3, y } },
];

/** Laço fechado fonte → carga, com retorno por baixo (nunca por cima dos pólos). */
const EXAMPLES: { name: string; doc: CircuitDoc }[] = [
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
      // banco em paralelo: trilho do meio (+) => topos, fundos => trilho direito => retorno.
      // (Sem o trilho esquerdo antigo: ele amarrava o + ao − e dava curto de verdade.)
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
        { id: 'w11', from: { x: 15, y: 4 }, to: { x: 3, y: 4 } },
      ],
    },
  },
];

export function App() {
  const doc = useEditor((s) => s.doc);
  const colorByVoltage = useEditor((s) => s.colorByVoltage);
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const { clear, load, setColorByVoltage, undo, rotate, removeSelected } = useEditor();
  const reading = readCircuit(doc);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const st = useEditor.getState();
      const sel = st.selection;
      if (e.key === 'Escape') st.arm(null);
      else if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
      else if (e.key.toLowerCase() === 'r' && sel?.kind === 'comp') rotate(sel.id);
      else if (e.key.toLowerCase() === 'f') st.armWire(!st.wiring);
      else if (e.key.toLowerCase() === 'v') setView((v) => (v === '2d' ? '3d' : '2d'));
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rotate, removeSelected, undo]);

  return (
    <div className="editor">
      <header className="topbar">
        <h1>handphys — editor de circuitos</h1>
        <nav>
          <a href="./">Voltar</a>
          <span className="seg" role="group" aria-label="Vista">
            <button
              type="button"
              className={view === '2d' ? 'ghost active' : 'ghost'}
              onClick={() => setView('2d')}
              title="Esquemático 2D (tecla V)"
            >
              2D
            </button>
            <button
              type="button"
              className={view === '3d' ? 'ghost active' : 'ghost'}
              onClick={() => setView('3d')}
              title="Bancada 3D (tecla V)"
            >
              3D
            </button>
          </span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={colorByVoltage}
              onChange={(e) => setColorByVoltage(e.target.checked)}
            />
            <span>Cores por tensão</span>
          </label>
          <span className="sep" />
          {EXAMPLES.map((ex) => (
            <button key={ex.name} type="button" className="ghost" onClick={() => load(ex.doc)}>
              {ex.name}
            </button>
          ))}
          <button type="button" className="ghost" onClick={clear}>
            Limpar
          </button>
        </nav>
      </header>
      <div className="body">
        <Palette />
        <main className="canvas">
          {view === '2d' ? (
            <Schematic reading={reading} />
          ) : (
            <SceneView key="scene3d" reading={reading} />
          )}
        </main>
        <Inspector reading={reading} />
      </div>
    </div>
  );
}
