import { useEffect, useRef } from 'react';
import { clientToCell, overHandButton } from './coords';
import { handFrame, radiusForSize, tipMid } from './handDraw';
import { hands } from '../hands/controller';

const CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/** Raio (px) da mão desenhada ao redor do cursor, com a mão a ~40 cm da câmera. */
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
        if (overHandButton(c.x, c.y)) return null; // sobre o botão: ele que clica
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

      // Esqueleto ancorado num ponto MATERIAL da mão: na mão da mira, a própria
      // mira (travada na palma, portanto não desliza quando os dedos fecham);
      // nas outras, o ponto médio das pontas. O TAMANHO acompanha a mão: mais
      // perto da câmera, maior — é a profundidade que sobra sem sensor de depth.
      ctx.lineCap = 'round';
      for (const hand of frame.hands) {
        const pts = hand.pts;
        if (!pts.length) continue;
        const ref = hand.cursor && c ? c : tipMid(pts);
        const f = handFrame(pts, ref, W, H, radiusForSize(hand.size, HAND_RADIUS_PX));
        if (!f) continue;
        // fora do seletor de uma mão => apagada (o professor vê que está ali,
        // mas que não comanda nada)
        ctx.strokeStyle = !hand.used
          ? 'rgba(139,148,158,0.38)'
          : hand.pinched
            ? '#3fb950'
            : 'rgba(88,166,255,0.85)';
        ctx.lineWidth = hand.used ? 2 : 1.5;
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
