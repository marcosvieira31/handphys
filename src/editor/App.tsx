import { useEffect } from 'react';
import { readCircuit } from '../core/netlist';
import { challengeById, evaluateChallenge } from './challenges';
import { EXAMPLES } from './examples';
import { HandsLayer } from './HandsLayer';
import { Inspector } from './Inspector';
import { ItemsRail, ViewRail } from './Rails';
import { MirrorToggle } from './MirrorToggle';
import { Schematic } from './Schematic';
import { SceneView } from './SceneView';
import { ShareDialog } from './ShareDialog';
import { downloadCsv, downloadJson, type DesafioRel } from './report';
import { useEditor } from './store';
import { applyZoom, applyZoomReset } from './zoom';

/** `ok`/`bad` = a página abriu com `?c=` (circuito no link) — bom ou podre. */
export function App({ shared = 'none' }: { shared?: 'none' | 'ok' | 'bad' }) {
  const doc = useEditor((s) => s.doc);
  const view = useEditor((s) => s.view);
  const challengeId = useEditor((s) => s.challenge);
  const { clear, load, undo, rotate, removeSelected, setView } = useEditor();
  const reading = readCircuit(doc);
  // Veredito do desafio no relatório JSON: recalculado AQUI, do mesmo jeito que
  // no painel e no espelho (o `check` é puro) — o arquivo registra a tarefa.
  const ch = challengeById(challengeId);
  const statuso = ch ? evaluateChallenge(ch, doc, reading) : null;
  const desafioRel: DesafioRel | null =
    ch && statuso
      ? { id: ch.id, titulo: ch.titulo, ok: statuso.ok, dica: statuso.ok ? null : statuso.dica }
      : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const st = useEditor.getState();
      const sel = st.selection;
      if (e.key === 'Escape') st.arm(null);
      else if (st.modal) return; // diálogo em cima: tecla não mexe na cena
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
          <ShareDialog />
          <MirrorToggle />
          <button
            type="button"
            className="ghost"
            onClick={() => downloadCsv(doc, reading)}
            disabled={!doc.comps.length}
            title="Baixar o circuito como CSV (abre no Excel/LibreOffice)"
            data-hand="csv"
          >
            CSV
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => downloadJson(doc, reading, desafioRel)}
            disabled={!doc.comps.length}
            title="Baixar o relatório JSON (montagem + leituras + veredito do desafio)"
            data-hand="json"
          >
            JSON
          </button>
          <button type="button" className="ghost" onClick={clear} data-hand="clear">
            Limpar
          </button>
          {shared !== 'none' && (
            <span
              className={shared === 'ok' ? 'chip' : 'chip warn'}
              title={
                shared === 'ok'
                  ? 'Este circuito veio do link aberto — edite à vontade.'
                  : 'O endereço traz ?c= mas não decifrou nenhum circuito.'
              }
            >
              {shared === 'ok' ? 'vindo do link' : 'link inválido'}
            </span>
          )}
        </nav>
      </header>
      <div className="body">
        <main className="canvas">
          <div className="canvas-view">
            {view === '2d' ? (
              <Schematic reading={reading} />
            ) : (
              <SceneView key="scene3d" reading={reading} />
            )}
            {/* trilhos DENTRO da bancada: pegar e carregar é um gesto só */}
            <ItemsRail />
            <ViewRail />
          </div>
        </main>
        <Inspector reading={reading} />
      </div>
      <HandsLayer />
    </div>
  );
}
