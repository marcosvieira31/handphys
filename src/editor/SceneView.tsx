import { useEffect, useRef, useState } from 'react';
import type { Reading } from '../core/netlist';
import { hands } from '../hands/controller';
import { overHandButton } from './coords';
import { useEditor } from './store';
import { bindZoomTarget } from './zoom';
import type { LabView } from '../scene/buildScene';

/**
 * Vista 3D do MESMO documento do esquemático: o three.js entra por import
 * dinâmico (fora do bundle inicial) e a cena espelha o store a cada mudança.
 * Mouse orbita/edita; a pinça da webcam mira no plano da bancada (raycast) e
 * usa as MESMAS ações do store (aperta/move/solta) — funciona igual ao 2D.
 */
export function SceneView({ reading }: { reading: Reading }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<LabView | null>(null);
  const [ready, setReady] = useState(false);
  const doc = useEditor((s) => s.doc);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { createLabView } = await import('../scene/buildScene');
      if (!alive || !canvasRef.current) return;
      const view = createLabView(canvasRef.current);
      viewRef.current = view;
      bindZoomTarget(view); // botões/gestos de zoom passam a mexer a câmera
      setReady(true);
      const s = useEditor.getState();
      view.update(s.doc, reading);
      // mira da pinça no 3D: cursor espelhado (fração da JANELA) => célula sob o dedo
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
      hands.unbindSlot('3d');
      bindZoomTarget(null);
      viewRef.current?.dispose();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.update(doc, reading);
  });

  return (
    <div className="scene-wrap">
      <canvas ref={canvasRef} className="scene3d" />
      {!ready && <p className="scene-loading">montando a bancada 3D…</p>}
    </div>
  );
}
