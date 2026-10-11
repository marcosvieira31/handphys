import { useEffect, useRef } from 'react';
import { clientToCell } from './coords';
import { hands } from '../hands/controller';

const CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/**
 * Sobreposição das mãos: desenha SÓ o esqueleto + cursor de pinça sobre o
 * esquemático — nunca o vídeo (privacidade na projetora). Não intercepta o
 * mouse (pointer-events: none) e some no modo 3D (sem grade para mirar).
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
      (wrap.parentElement?.querySelector('svg.schematic') as SVGSVGElement | null) ?? null;
    // Alvo do desenho: o esquemático 2D ou a bancada 3D, o que estiver montado.
    const getTarget = () =>
      (wrap.parentElement?.querySelector('svg.schematic') ??
        wrap.parentElement?.querySelector('canvas.scene3d')) as HTMLElement | null;
    hands.bindSlot(
      '2d',
      (p) => {
        const svg = getSvg();
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        return clientToCell(svg, r.left + p.x * r.width, r.top + p.y * r.height);
      },
      video,
    );

    let raf = 0;
    let dead = false;
    const draw = () => {
      if (dead) return;
      raf = requestAnimationFrame(draw);
      const target = getTarget();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (!target || !hands.active) {
        if (canvas.width !== 1) {
          canvas.width = 1;
          canvas.height = 1;
        }
        ctx.clearRect(0, 0, 1, 1);
        return;
      }
      // cola o canvas exatamente sobre a vista (posição/tamanho a cada quadro)
      const box = wrap.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      canvas.style.left = `${r.left - box.left}px`;
      canvas.style.top = `${r.top - box.top}px`;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const frame = hands.drawFrame();
      ctx.clearRect(0, 0, w, h);
      // pontos já vêm espelhados do controller (como espelho): desenha direto
      ctx.lineCap = 'round';
      for (const hand of frame.hands) {
        ctx.strokeStyle = hand.pinched ? '#3fb950' : '#58a6ff';
        ctx.lineWidth = Math.max(2, w / 160);
        ctx.beginPath();
        for (const [a, b] of CONNECTIONS) {
          const pa = hand.pts[a];
          const pb = hand.pts[b];
          if (!pa || !pb) continue;
          ctx.moveTo(pa.x * w, pa.y * h);
          ctx.lineTo(pb.x * w, pb.y * h);
        }
        ctx.stroke();
        // linha da pinça polegar–indicador
        const t = hand.pts[4];
        const p = hand.pts[8];
        if (t && p) {
          ctx.strokeStyle = hand.pinched ? '#3fb950' : '#d29922';
          ctx.lineWidth = Math.max(3, w / 110);
          ctx.beginPath();
          ctx.moveTo(t.x * w, t.y * h);
          ctx.lineTo(p.x * w, p.y * h);
          ctx.stroke();
        }
      }
      // cursor (coordenadas já espelhadas: desenha direto)
      const c = frame.cursor;
      if (c) {
        const x = c.x * w;
        const y = c.y * h;
        const r0 = Math.max(6, w / 45);
        ctx.beginPath();
        ctx.arc(x, y, r0, 0, Math.PI * 2);
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
      <canvas ref={canvasRef} className="hands-canvas" />
      {/* processamento: invisível mas renderizado (rVFC precisa de quadros reais) */}
      <video ref={videoRef} className="hands-video" muted playsInline />
    </div>
  );
}
