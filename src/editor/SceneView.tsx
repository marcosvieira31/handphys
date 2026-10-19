import { useEffect, useRef, useState } from 'react';
import type { Pt, Reading } from '../core/netlist';
import { hands } from '../hands/controller';
import { ArLayer } from './ArLayer';
import { useAr } from './ar';
import { foiClique, overHandButton } from './coords';
import { useEditor } from './store';
import { applyFrameFrom2D, bindZoomTarget } from './zoom';
import type { LabView } from '../scene/buildScene';

/**
 * Vista 3D do MESMO documento do esquemático: o three.js entra por import
 * dinâmico (fora do bundle inicial) e a cena espelha o store a cada mudança.
 * O ARRASTE do ponteiro orbita a bancada; o CLIQUE (aperta e solta no mesmo
 * lugar) faz o mesmo que o clique do quadro 2D — posiciona o item armado,
 * seleciona, abre a chave. A pinça da webcam mira no plano da bancada (raycast)
 * e usa as MESMAS ações do store (aperta/move/solta) — funciona igual ao 2D.
 * O fantasma do item armado acompanha a mira (o ponteiro E a pinça).
 * O enquadramento é ÚNICO das duas vistas: ao montar a câmera herda centro e
 * zoom do quadro 2D, e a cada movimento ela escreve de volta (setFraming) —
 * alternar 2D↔3D nunca reposiciona o que o professor estava olhando.
 *
 * AR de bolso (a chave do trilho): o canvas fica transparente e o vídeo da
 * câmera entra atrás (a camada `ArLayer`) — a bancada escura sai e o circuito
 * aparece na mesa de verdade. Sair da vista 3D fecha a câmera por construção:
 * a camada desmonta junto.
 */
export function SceneView({ reading }: { reading: Reading }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<LabView | null>(null);
  const [ready, setReady] = useState(false);
  const ar = useAr();
  const doc = useEditor((s) => s.doc);
  const flow = useEditor((s) => s.flow); // gotas de corrente nos fios 3D
  // Mira do ponteiro (a célula sob o mouse/dedo) e onde ele apertou. Ficam em
  // refs de propósito: o fantasma é pintado direto na cena, sem re-render.
  const mira = useRef<Pt | null>(null);
  const apertou = useRef<{ x: number; y: number } | null>(null);

  /** Cliente => célula da bancada sob o ponteiro (a MESMA mira da pinça). */
  const celulaDoPonteiro = (clientX: number, clientY: number): Pt | null => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return null;
    return viewRef.current?.cellAt((clientX - r.left) / r.width, (clientY - r.top) / r.height) ?? null;
  };

  /**
   * Pinta o fantasma do item armado: a peça sob a mira — a do ponteiro ou, se
   * a pinça estiver carregando (`carry`), a dela. Nasceu armado, sumiu ao
   * soltar. Ler o store na hora (e não por props) é o que deixa isto fora do
   * ciclo do React: o ponteiro anda a cada quadro.
   */
  const pintaFantasma = () => {
    const view = viewRef.current;
    if (!view) return;
    const s = useEditor.getState();
    view.setGhost(s.placing, s.placing ? (s.carry ?? mira.current) : null);
  };

  useEffect(() => {
    let alive = true;
    let pararDeOlhar: (() => void) | null = null;
    (async () => {
      const { createLabView } = await import('../scene/buildScene');
      if (!alive || !canvasRef.current) return;
      const view = createLabView(canvasRef.current, (center, zoom) =>
        // a câmera anda => escreve o enquadramento de volta no quadro 2D
        useEditor.getState().setFraming(center, zoom),
      );
      viewRef.current = view;
      bindZoomTarget(view); // botões/gestos de zoom passam a mexer a câmera
      applyFrameFrom2D(); // e a câmera herda o enquadramento do quadro 2D
      view.setAr(ar); // a chave pode já estar ligada quando a cena monta
      setReady(true);
      const s = useEditor.getState();
      view.update(s.doc, reading, s.flow);
      // o fantasma segue o ITEM ARMADO (o trilho é fora do canvas: quem arma é
      // um clique lá, e nem ponteiro nem pinça precisam se mexer para ele nascer)
      pintaFantasma();
      pararDeOlhar = useEditor.subscribe(pintaFantasma);
      // mira da pinça no 3D: cursor JÁ na tela (fração da JANELA) => célula sob o dedo
      hands.bindSlot('3d', (p) => {
        const r = canvasRef.current?.getBoundingClientRect();
        if (!r || r.width <= 0 || r.height <= 0) return null;
        const cx = p.x * window.innerWidth;
        const cy = p.y * window.innerHeight;
        if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
        if (overHandButton(cx, cy)) return null; // sobre o botão: ele que clica
        return view.cellAt((cx - r.left) / r.width, (cy - r.top) / r.height);
      });
      if (import.meta.env.DEV) {
        (window as unknown as { __lab?: unknown }).__lab = view;
      }
    })();
    return () => {
      alive = false;
      pararDeOlhar?.();
      hands.unbindSlot('3d');
      bindZoomTarget(null);
      viewRef.current?.dispose();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.update(doc, reading, flow);
  });

  // a cena é a MESMA: muda o fundo (transparente ou não), o tampo e a sombra
  useEffect(() => {
    viewRef.current?.setAr(ar);
  }, [ar]);

  /**
   * CLIQUE na bancada 3D (mouse ou dedo): nada de `pressAt` no apertar — quem
   * aperta e arrasta está GIRANDO a câmera (a órbita), e no celular o dedo que
   * arrasta faz isso o tempo todo; arrastar peça continua sendo da pinça. Só o
   * aperto PARADO vale como clique, e ele vale com as MESMAS ações do quadro
   * 2D: apertar e soltar no mesmo lugar (posiciona o item armado, seleciona,
   * abre a chave) — um clique, um resultado.
   */
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    apertou.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const inicio = apertou.current;
    apertou.current = null;
    if (!inicio || !foiClique(inicio, { x: e.clientX, y: e.clientY })) {
      return; // arrastou: foi órbita, não clique
    }
    const cell = celulaDoPonteiro(e.clientX, e.clientY);
    if (!cell) return; // soltou fora do quadro
    const st = useEditor.getState();
    st.pressAt(cell);
    st.releaseAt(cell);
  };

  /** O fantasma acompanha o ponteiro — só com item armado: é a prévia dele. */
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!useEditor.getState().placing) return;
    mira.current = celulaDoPonteiro(e.clientX, e.clientY);
    pintaFantasma();
  };

  const onPointerLeave = () => {
    mira.current = null; // a mira saiu do quadro: o fantasma some com ela
    pintaFantasma();
  };

  /** Toque interrompido (gesto do sistema, dedo que sai da tela): nada pendente. */
  const onPointerCancel = () => {
    apertou.current = null;
    onPointerLeave();
  };

  return (
    <div className={ar ? 'scene-wrap ar' : 'scene-wrap'}>
      {ar && <ArLayer />}
      <canvas
        ref={canvasRef}
        className="scene3d"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerCancel={onPointerCancel}
      />
      {!ready && <p className="scene-loading">montando a bancada 3D…</p>}
    </div>
  );
}
