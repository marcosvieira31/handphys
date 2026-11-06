import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CircuitDoc } from '../core/netlist';
import { dicaDoMomento } from './dicas';
import { readCircuit } from '../core/netlist';
import { challengeById, evaluateChallenge } from './challenges';
import { EXAMPLES } from './examples';
import { HandsLayer } from './HandsLayer';
import { IcoBaixar, IcoBancada, IcoLixeira, IcoMedir } from './icons';
import { Inspector } from './Inspector';
import { ItemsRail, ViewRail } from './Rails';
import { MirrorToggle } from './MirrorToggle';
import { Schematic } from './Schematic';
import { SceneView } from './SceneView';
import { ShareDialog } from './ShareDialog';
import { downloadCsv, downloadJson, type DesafioRel } from './report';
import { useEditor } from './store';
import { ThemeToggle } from './ThemeToggle';
import { applyFrameFrom2D, applyZoom, applyZoomReset } from './zoom';

/**
 * Menu da barra: `<details>` nativo (a pinça clica no summary como clique) que
 * FECHA ao escolher e ao clicar fora — o nativo ficava aberto por cima da
 * bancada depois de escolher, cobrindo o circuito recém-aberto.
 */
function Menu({
  rotulo,
  hand,
  title,
  children,
}: {
  rotulo: ReactNode;
  hand: string;
  title: string;
  children: (fechar: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const fechar = () => {
    if (ref.current) ref.current.open = false;
  };
  useEffect(() => {
    const fora = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) fechar();
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, []);
  return (
    <details className="menu" ref={ref}>
      <summary data-hand={hand} title={title}>
        {rotulo}
      </summary>
      <div className="menu-body">{children(fechar)}</div>
    </details>
  );
}

/** Abre um circuito pronto e, na bancada 3D, leva a câmera ao novo enquadro. */
function abrir(doc: CircuitDoc) {
  useEditor.getState().load(doc);
  applyFrameFrom2D();
}

/** Aparelho sem mouse (celular/tablet): as dicas falam de toque, não de tecla. */
const TOQUE = typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches === true;

/**
 * O que fazer AGORA, numa frase sobre o quadro (ver `dicas.ts`), e — com o
 * quadro vazio — o convite para começar por um exemplo ou por uma peça.
 */
function GuiaDoQuadro() {
  const doc = useEditor((s) => s.doc);
  const placing = useEditor((s) => s.placing);
  const wiring = useEditor((s) => s.wiring);
  const draft = useEditor((s) => s.draft);
  const grip = useEditor((s) => s.grip);
  const selection = useEditor((s) => s.selection);
  const dica = dicaDoMomento({ doc, placing, wiring, draft, grip, selection, toque: TOQUE });
  const vazio = !doc.comps.length && !placing && !wiring;
  return (
    <>
      {dica && (
        <p className={`dica ${dica.tom}`} role="status" aria-live="polite">
          {dica.texto}
        </p>
      )}
      {vazio && (
        <div className="convite">
          <IcoBancada size={30} />
          <h2>Comece a montar</h2>
          <p>
            Toque numa peça do trilho e depois no quadro. Para ligar, arraste de uma bolinha
            (terminal) até outra.
          </p>
          <p className="convite-ou">ou abra um circuito pronto:</p>
          <div className="convite-ex">
            {EXAMPLES.map((ex, i) => (
              <button key={ex.name} type="button" data-hand={`convite:${i}`} onClick={() => abrir(ex.doc)}>
                {ex.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** `ok`/`bad` = a página abriu com `?c=` (circuito no link) — bom ou podre. */
export function App({ shared = 'none' }: { shared?: 'none' | 'ok' | 'bad' }) {
  const doc = useEditor((s) => s.doc);
  const view = useEditor((s) => s.view);
  const challengeId = useEditor((s) => s.challenge);
  const { clear, undo, rotate, removeSelected, setView } = useEditor();
  const reading = readCircuit(doc);
  // Veredito do desafio no relatório JSON: recalculado AQUI, do mesmo jeito que
  // no painel e no espelho (o `check` é puro) — o arquivo registra a tarefa.
  const ch = challengeById(challengeId);
  const statuso = ch ? evaluateChallenge(ch, doc, reading) : null;
  const desafioRel: DesafioRel | null =
    ch && statuso
      ? { id: ch.id, titulo: ch.titulo, ok: statuso.ok, dica: statuso.ok ? null : statuso.dica }
      : null;
  /**
   * Painel de medições aberto (desktop) ou fechado (celular — a bancada é a
   * estrela da tela pequena; o botão Painel sobe quando o aluno quer conferir
   * os números). A largura é lida UMA vez na chegada; depois o aluno decide.
   */
  const [painel, setPainel] = useState(() => !window.matchMedia('(max-width: 760px)').matches);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const st = useEditor.getState();
      const sel = st.selection;
      if (e.key === 'Escape') {
        // Esc = "larguei tudo": item armado, fio na mão, modo fio e seleção
        if (st.placing || st.carry) st.arm(null);
        else if (st.wiring || st.draft) st.armWire(false);
        else st.select(null);
      }
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
        <div className="marca">
          <IcoBancada size={20} />
          <h1>
            <strong>handphys</strong> bancada
          </h1>
        </div>
        <nav>
          <Menu rotulo="Exemplos ▾" hand="exemplos" title="Circuitos prontos para abrir">
            {(fechar) =>
              EXAMPLES.map((ex, i) => (
                <button
                  key={ex.name}
                  type="button"
                  className="ghost"
                  onClick={() => {
                    abrir(ex.doc);
                    fechar();
                  }}
                  data-hand={`example:${i}`}
                >
                  {ex.name}
                </button>
              ))
            }
          </Menu>
          <span className="sep" />
          <span className="grupo" aria-label="Projetar e compartilhar">
            <ShareDialog />
            <MirrorToggle />
          </span>
          {/* Exportar e limpar são coisas de PROFESSOR (fim da aula), não do
              gesto de montar: moram num menu para não empurrar a barra para
              uma terceira linha em janela pequena (o que já acontecia). */}
          <Menu rotulo="⋯ Mais" hand="mais" title="Exportar o circuito ou limpar o quadro">
            {(fechar) => (
              <>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  downloadCsv(doc, reading);
                  fechar();
                }}
                disabled={!doc.comps.length}
                title="Baixar o circuito como CSV (abre no Excel/LibreOffice)"
                data-hand="csv"
              >
                <IcoBaixar size={17} />
                Baixar CSV
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  downloadJson(doc, reading, desafioRel);
                  fechar();
                }}
                disabled={!doc.comps.length}
                title="Baixar o relatório JSON (montagem + leituras + veredito do desafio)"
                data-hand="json"
              >
                <IcoBaixar size={17} />
                Baixar JSON
              </button>
              <button type="button" className="ghost" onClick={() => {
                  clear();
                  fechar();
                }} data-hand="clear">
                <IcoLixeira size={17} />
                Limpar o quadro
              </button>
            </>
            )}
          </Menu>
          <ThemeToggle />
          <a href="#/ajuda" data-hand="sala" title="O que é o handphys e as telas da sala">
            Ajuda
          </a>
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
            <GuiaDoQuadro />
          </div>
        </main>
        <button
          type="button"
          className="painel-toggle"
          data-hand="painel"
          aria-expanded={painel}
          onClick={() => setPainel((p) => !p)}
        >
          <IcoMedir size={18} />
          {painel ? 'Fechar painel' : 'Painel'}
        </button>
        <Inspector reading={reading} aberto={painel} />
      </div>
      <HandsLayer />
    </div>
  );
}
