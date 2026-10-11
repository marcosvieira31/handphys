import { useEffect, useRef } from 'react';
import { EXAMPLES } from './examples';
import { clientToCell } from './coords';
import { boardHitAt, domHitAt, DwellActivator, labelOf, type DwellHit } from './dwellAct';
import { DwellController } from '../hands/dwell';
import { hands } from '../hands/controller';
import { useEditor } from './store';

const CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/** Raio (px) da mão desenhada ao redor do cursor, independente do tamanho da tela. */
const HAND_RADIUS_PX = 70;

/**
 * Ponteiro virtual das mãos (Fase 2b/2c): a mira acompanha a mão por TODA a
 * janela — dá para fixar num componente, num terminal, ou numa FUNÇÃO (paleta,
 * Conectar, exemplos, 2D/3D). Fixar 3 s ativa (anel cresce); a pinça continua
 * sendo o atalho direto. Sem vídeo na cena, só esqueleto + mira.
 */
export function HandsLayer() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!wrap || !canvas || !video) return;

    const getSvg = () =>
      (document.querySelector('svg.schematic') as SVGSVGElement | null) ?? null;

    // Cursor normalizado => ponto de cliente (janela inteira, já espelhado).
    const toClient = (nx: number, ny: number) => ({
      x: nx * window.innerWidth,
      y: ny * window.innerHeight,
    });

    hands.bindSlot(
      '2d',
      (p) => {
        const svg = getSvg();
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        const c = toClient(p.x, p.y);
        if (c.x < r.left || c.x > r.right || c.y < r.top || c.y > r.bottom) return null;
        return clientToCell(svg, c.x, c.y);
      },
      video,
    );

    const dwell = new DwellController(3000);
    const activator = new DwellActivator({
      arm: (k) => useEditor.getState().arm(k as never),
      armWire: (on) => useEditor.getState().armWire(on),
      loadExample: (i) => useEditor.getState().load(EXAMPLES[i].doc),
      clear: () => useEditor.getState().clear(),
      setView: (v) => useEditor.getState().setView(v),
      select: (kind, id) => useEditor.getState().select({ kind, id }),
      startDraft: (cell) => useEditor.getState().startDraft(cell),
      moveDraft: (cell) => useEditor.getState().moveDraft(cell),
      endDraft: (cell) => useEditor.getState().endDraft(cell),
    });

    /** O que está sob a mira agora: função (DOM) ou objeto do quadro. */
    const resolveHit = (c: { x: number; y: number }, cursor: { x: number; y: number }): DwellHit | null => {
      // 1) função: elemento marcado com [data-dwell] (paleta, Conectar, etc.)
      const el = document.elementFromPoint(c.x, c.y) as HTMLElement | null;
      const host = el?.closest('[data-dwell]') as HTMLElement | null;
      const dom = host?.dataset.dwell ? domHitAt(host.dataset.dwell) : null;
      if (dom) return dom;

      // 2) objeto do quadro (mesma célula que a pinça usaria)
      const cell = hands.resolveCell(cursor);
      if (!cell) return null;
      return boardHitAt(useEditor.getState().doc, cell);
    };

    let raf = 0;
    let dead = false;
    const draw = () => {
      if (dead) return;
      raf = requestAnimationFrame(draw);
      if (import.meta.env.DEV) {
        const w = window as unknown as { __handsTick?: number; __dwellProgress?: number };
        w.__handsTick = (w.__handsTick ?? 0) + 1;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (!hands.active) {
        // sem mãos: encolhe o canvas (não gasta banda de desenho à toa)
        if (canvas.width !== 1) {
          canvas.width = 1;
          canvas.height = 1;
        }
        dwell.reset();
        activator.reset();
        return;
      }
      const W = window.innerWidth;
      const H = window.innerHeight;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      ctx.clearRect(0, 0, W, H);

      const frame = hands.drawFrame();
      const c = frame.cursor;
      const now = performance.now();

      // alvo sob a mira + fixação (só com a mão aberta: pinça é atalho direto)
      let hit: DwellHit | null = null;
      if (c && !c.active) {
        hit = resolveHit(toClient(c.x, c.y), c);
        // fio em construção pela mira: a prévia acompanha o cursor
        if (activator.pendingFrom) {
          const cell = hands.resolveCell(c);
          if (cell) useEditor.getState().moveDraft(cell);
        }
      }
      const res = dwell.update(hit ? hit.id : null, now);
      if (import.meta.env.DEV) {
        (window as unknown as { __dwellProgress?: number }).__dwellProgress = res.progress;
      }
      if (res.fired && hit) activator.fire(hit);

      // esqueleto a uma escala fixa em volta do cursor (janela inteira)
      ctx.lineCap = 'round';
      for (const hand of frame.hands) {
        const pts = hand.pts;
        if (!pts.length) continue;
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        let maxR = 1;
        for (const p of pts) maxR = Math.max(maxR, Math.hypot((p.x - cx) * W, (p.y - cy) * H));
        const k = HAND_RADIUS_PX / maxR;
        const anchor = c ? toClient(c.x, c.y) : { x: cx * W, y: cy * H };
        const px = (p: { x: number; y: number }) => ({
          x: anchor.x + (p.x - cx) * W * k,
          y: anchor.y + (p.y - cy) * H * k,
        });
        ctx.strokeStyle = hand.pinched ? '#3fb950' : 'rgba(88,166,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const [a, b] of CONNECTIONS) {
          const pa = px(pts[a]);
          const pb = px(pts[b]);
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
        }
        ctx.stroke();
      }

      // mira + anel de fixação crescendo
      if (c) {
        const p = toClient(c.x, c.y);
        const base = 7;
        ctx.beginPath();
        ctx.arc(p.x, p.y, base, 0, Math.PI * 2);
        if (c.active) {
          ctx.fillStyle = '#3fb950';
          ctx.fill();
        } else {
          ctx.strokeStyle = '#58a6ff';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        if (res.progress > 0 && !res.fired) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 14 + res.progress * 16, -Math.PI / 2, -Math.PI / 2 + res.progress * Math.PI * 2);
          ctx.strokeStyle = '#e3b341';
          ctx.lineWidth = 3;
          ctx.stroke();
        } else if (res.fired) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
          ctx.strokeStyle = '#3fb950';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        // rótulo do alvo fixando
        if (hit && res.progress > 0 && !res.fired) {
          ctx.font = '12px system-ui';
          ctx.fillStyle = '#e3b341';
          ctx.textAlign = 'center';
          ctx.fillText(labelOf(hit), p.x, p.y + 46);
          ctx.textAlign = 'start';
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      hands.unbindSlot('2d');
    };
  }, []);

  return (
    <div ref={wrapRef} className="hands-layer" aria-hidden>
      <canvas ref={canvasRef} className="hands-canvas-window" />
      {/* processamento: invisível mas renderizado (rVFC precisa de quadros reais) */}
      <video ref={videoRef} className="hands-video" muted playsInline />
    </div>
  );
}
