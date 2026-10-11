import { useEffect, useState } from 'react';
import { readCircuit } from '../core/netlist';
import { EXAMPLES } from './examples';
import { HandsLayer } from './HandsLayer';
import { Inspector } from './Inspector';
import { Palette } from './Palette';
import { Schematic } from './Schematic';
import { SceneView } from './SceneView';
import { useEditor } from './store';

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
          <HandsLayer />
        </main>
        <Inspector reading={reading} />
      </div>
    </div>
  );
}
