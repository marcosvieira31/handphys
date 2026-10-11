import { useEffect, useRef, useState } from 'react';
import type { Reading } from '../core/netlist';
import { useEditor } from './store';
import type { LabView } from '../scene/buildScene';

/**
 * Vista 3D do MESMO documento do esquemático: o three.js entra por import
 * dinâmico (fora do bundle inicial) e a cena espelha o store a cada mudança.
 * Nesta fatia (2a) a interação é orbitar com o mouse; editar continua no 2D.
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
      setReady(true);
      const s = useEditor.getState();
      view.update(s.doc, reading);
    })();
    return () => {
      alive = false;
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
