import { useEffect, useRef } from 'react';
import { clientToCell } from './coords';
import { handFrame } from './handDraw';
import { hands } from '../hands/controller';

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
 * Camada das mãos (Fase 2b): desenha só o esqueleto + mira (nunca o vídeo).
 * A interação é por GESTO: a pinça aperta/move/solta — no quadro 2D, na bancada
 * 3D e também nos botões marcados com [data-hand] (a pinça "clica" neles).
 * A seleção por FIXAÇÃO (3 s) é exclusiva do Cardboard (olhar), onde não há mão.
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

    let raf = 0;
    let dead = false;
    let wasPinched = false;
    const draw = () => {
      if (dead) return;
      raf = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (!hands.active) {
        if (canvas.width !== 1) {
          canvas.width = 1;
          canvas.height = 1;
        }
        wasPinched = false;
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

      // GESTO nas funções: no instante em que a pinça FECHA sobre um botão
      // marcado com [data-hand], ele é acionado — como um clique.
      if (c?.active && !wasPinched) {
        const el = document.elementFromPoint(c.x * W, c.y * H) as HTMLElement | null;
        const host = el?.closest('[data-hand]') as HTMLElement | null;
        host?.click();
      }
      wasPinched = c?.active ?? false;

      // Esqueleto a uma escala fixa, ancorado no PONTO DA PINÇA (ponta do
      // polegar 4 + ponta do indicador 8) — que é exatamente onde a mira fica.
      // Ancorar no centroide, como antes, fazia o ponto nascer sempre no meio
      // da mão desenhada, longe dos dedos (ver handDraw.test.ts).
      ctx.lineCap = 'round';
      for (const hand of frame.hands) {
        const pts = hand.pts;
        if (!pts.length) continue;
        const f = handFrame(pts, c, W, H, HAND_RADIUS_PX);
        if (!f) continue;
        ctx.strokeStyle = hand.pinched ? '#3fb950' : 'rgba(88,166,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const [a, b] of CONNECTIONS) {
          const pa = f.project(pts[a]);
          const pb = f.project(pts[b]);
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
        }
        ctx.stroke();
      }

      // mira: verde preenchida quando a pinça está fechada (agarrando)
      if (c) {
        const p = toClient(c.x, c.y);
        // halo escuro para a mira não sumir por cima das linhas do esqueleto
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(8,10,14,0.75)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        if (c.active) {
          ctx.fillStyle = '#3fb950';
          ctx.fill();
        } else {
          ctx.strokeStyle = '#58a6ff';
          ctx.lineWidth = 2.5;
          ctx.stroke();
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
