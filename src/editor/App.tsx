import { useEffect } from 'react';
import { readCircuit } from '../core/netlist';
import { EXAMPLES } from './examples';
import { HandsLayer } from './HandsLayer';
import { Inspector } from './Inspector';
import { Palette } from './Palette';
import { Schematic } from './Schematic';
import { SceneView } from './SceneView';
import { useEditor } from './store';
import { applyZoom, applyZoomReset } from './zoom';

export function App() {
  const doc = useEditor((s) => s.doc);
  const colorByVoltage = useEditor((s) => s.colorByVoltage);
  const view = useEditor((s) => s.view);
  const zoom = useEditor((s) => s.zoom);
  const { clear, load, setColorByVoltage, undo, rotate, removeSelected, setView } = useEditor();
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
      else if (e.key.toLowerCase() === 'v') setView(st.view === '2d' ? '3d' : '2d');
      else if (e.key === '+' || e.key === '=') applyZoom(1.25);
      else if (e.key === '-') applyZoom(1 / 1.25);
      else if (e.key === '0') applyZoomReset();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rotate, removeSelected, undo, setView]);

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
              data-hand="view:2d"
            >
              2D
            </button>
            <button
              type="button"
              className={view === '3d' ? 'ghost active' : 'ghost'}
              onClick={() => setView('3d')}
              title="Bancada 3D (tecla V)"
              data-hand="view:3d"
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
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.name}
              type="button"
              className="ghost"
              onClick={() => load(ex.doc)}
              data-hand={`example:${i}`}
            >
              {ex.name}
            </button>
          ))}
          <button type="button" className="ghost" onClick={clear} data-hand="clear">
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
          <div className="zoom-bar" role="group" aria-label="Zoom">
            <button
              type="button"
              className="ghost"
              data-hand="zoom:out"
              aria-label="Reduzir o zoom"
              title="Reduzir (−)"
              onClick={() => applyZoom(1 / 1.25)}
            >
              −
            </button>
            <button
              type="button"
              className="ghost zoom-pct"
              data-hand="zoom:reset"
              aria-label={view === '2d' ? 'Caber o quadro inteiro' : 'Enquadrar a bancada'}
              title="Caber tudo / enquadrar de novo (0)"
              onClick={applyZoomReset}
            >
              {view === '2d' ? `${Math.round(zoom * 100)}%` : 'enquadrar'}
            </button>
            <button
              type="button"
              className="ghost"
              data-hand="zoom:in"
              aria-label="Ampliar o zoom"
              title="Ampliar (+)"
              onClick={() => applyZoom(1.25)}
            >
              +
            </button>
          </div>
        </main>
        <Inspector reading={reading} />
      </div>
      <HandsLayer />
    </div>
  );
}
