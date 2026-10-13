import { useEditor } from './store';

/**
 * Um comando de zoom só para as DUAS vistas: no esquemático (2D) o botão/gesto
 * mexe o viewBox pela store; na bancada (3D) ele doliciona a câmera do three.js.
 * A cena 3D se registra aqui ao montar — sem isso (ou fora da vista 3D) o zoom
 * cai no quadro 2D, que é sempre um alvo válido.
 */
export interface ZoomTarget {
  dolly(factor: number): void;
  /** Arraste em px => desloca a câmera e o alvo juntos (bancada 3D). */
  panBy(dxPx: number, dyPx: number, viewportPx: number): void;
  resetView(): void;
}

let target3d: ZoomTarget | null = null;

/** SceneView registra (mount) e apaga (unmount) a cena 3D aqui. */
export function bindZoomTarget(t: ZoomTarget | null): void {
  target3d = t;
}

/** Amplia/afasta. `anchor` só vale no 2D (unidades do quadro; nulo = centro). */
export function applyZoom(factor: number, anchor?: { x: number; y: number } | null): void {
  const st = useEditor.getState();
  if (st.view === '3d' && target3d) target3d.dolly(factor);
  else st.zoomBy(factor, anchor ?? null);
}

/**
 * Arraste no vazio => desloca a vista SEM mexer em componente: no 2D corre o
 * quadro, na bancada 3D anda a câmera com o alvo. Mesmo caminho duplo do zoom
 * — o gesto (mouse e pinça das mãos) não precisa saber em que vista está.
 */
export function applyPan(dxPx: number, dyPx: number, viewportPx: number): void {
  const st = useEditor.getState();
  if (st.view === '3d' && target3d) target3d.panBy(dxPx, dyPx, viewportPx);
  else st.panBy(dxPx, dyPx, viewportPx);
}

/** Volta ao enquadro inicial (o quadro inteiro / a câmera de chegada). */
export function applyZoomReset(): void {
  const st = useEditor.getState();
  if (st.view === '3d' && target3d) target3d.resetView();
  else st.resetView();
}
