import { useEditor } from './store';
import { centerOf } from './zoomMath';
import type { Pt } from '../core/netlist';

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
  /** Giro da bancada pela rotação das mãos (só a bancada 3D gira). */
  rollBy(rad: number): void;
  /** A câmera herda o enquadramento do quadro 2D (o enquadramento é único). */
  frameTo(center: Pt, zoom: number): void;
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

/**
 * Giro da bancada pela ROTAÇÃO das mãos (gesto das duas mãos): a bancada 3D
 * orbita o eixo vertical (o "eixo Z" que o professor gira, fora do plano do
 * quadro 2D); o esquemático é diagrama e não gira — lá este caminho é no-op.
 * Mesma rota dupla do zoom e do pan.
 */
export function applyRoll(rad: number): void {
  const st = useEditor.getState();
  if (st.view === '3d' && target3d) target3d.rollBy(rad);
}

/**
 * Entrou a bancada 3D: a câmera herda o enquadramento do quadro 2D (centro do
 * viewBox + zoom) e guarda só os ângulos da órbita. Enquadramento ÚNICO nas
 * duas direções: o que o professor olhava em 2D é o que ele vê em 3D — e a
 * volta ao 2D enxerga de onde a câmera ficou olhando, sem reposicionar nada.
 */
export function applyFrameFrom2D(): void {
  const st = useEditor.getState();
  if (st.view === '3d' && target3d) target3d.frameTo(centerOf({ zoom: st.zoom, pan: st.pan }), st.zoom);
}

/** Volta ao enquadro inicial (o quadro inteiro / a câmera de chegada). */
export function applyZoomReset(): void {
  const st = useEditor.getState();
  if (st.view === '3d' && target3d) target3d.resetView();
  else st.resetView();
}
