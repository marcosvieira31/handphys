import type { CompKind } from '../core/netlist';
import { formatValue, Symbol } from './symbol';
import { useEditor } from './store';
import { applyZoom, applyZoomReset } from './zoom';

const ITEMS: { kind: CompKind; label: string; hint: string; value?: number }[] = [
  { kind: 'vsource', label: 'Fonte', hint: '9 V', value: 9 },
  { kind: 'resistor', label: 'Resistor', hint: '100 Ω', value: 100 },
  { kind: 'lamp', label: 'Lâmpada', hint: '20 Ω', value: 20 },
  { kind: 'capacitor', label: 'Capacitor', hint: '1 µF', value: 1e-6 },
  { kind: 'switch', label: 'Chave', hint: 'aberta' },
  { kind: 'ground', label: 'Terra', hint: 'referência 0 V' },
];

/**
 * Dock — as ferramentas DENTRO da bancada, na faixa embaixo do quadro.
 *
 * Com as mãos o alcance confortável é o CENTRO da tela (é o que a câmera
 * enxerga bem): paleta e vistas moravam nos cantos, e pegar um resistor lá
 * de cima para trazê-lo ao quadro virava uma viagem de braço estendido.
 * Aqui pegar e posicionar é o mesmo movimento — e o mouse continua servindo
 * pelos MESMOS alvos ([data-hand] = a pinça clica como um clique).
 */
export function Dock() {
  const placing = useEditor((s) => s.placing);
  const wiring = useEditor((s) => s.wiring);
  const view = useEditor((s) => s.view);
  const zoom = useEditor((s) => s.zoom);
  const arm = useEditor((s) => s.arm);
  const armWire = useEditor((s) => s.armWire);
  const setView = useEditor((s) => s.setView);

  return (
    <footer className="dock" role="group" aria-label="Ferramentas da bancada">
      <ul className="dock-items">
        {ITEMS.map((it) => (
          <li key={it.kind}>
            <button
              type="button"
              className={placing === it.kind ? 'dock-item active' : 'dock-item'}
              onClick={() => arm(placing === it.kind ? null : it.kind)}
              data-hand={`kind:${it.kind}`}
              title={`${it.label} ${it.hint} — clique e depois no quadro para posicionar`}
            >
              <svg viewBox="-24 -24 48 48" width={26} height={26} aria-hidden>
                <Symbol
                  comp={{
                    id: 'preview',
                    kind: it.kind,
                    x: 0,
                    y: 0,
                    rot: 0,
                    value: it.value ?? 0,
                  }}
                />
              </svg>
              <strong>{it.label}</strong>
              <em>
                {it.kind === 'switch' ? it.hint : formatValue(it.kind, it.value ?? 0) || it.hint}
              </em>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className={wiring ? 'dock-item active' : 'dock-item'}
            onClick={() => armWire(!wiring)}
            data-hand="wire"
            title="Modo fio: clique num terminal e depois noutro (tecla F)"
          >
            <svg viewBox="-24 -24 48 48" width={26} height={26} aria-hidden>
              <line
                x1={-13}
                y1={11}
                x2={13}
                y2={-11}
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
              <circle cx={-13} cy={11} r={5} fill="currentColor" />
              <circle cx={13} cy={-11} r={5} fill="currentColor" />
            </svg>
            <strong>Conectar</strong>
            <em>fio · tecla F</em>
          </button>
        </li>
      </ul>

      <span className="dock-sep" aria-hidden="true" />

      <span className="seg" role="group" aria-label="Vista">
        <button
          type="button"
          className={view === '2d' ? 'ghost active' : 'ghost'}
          onClick={() => setView('2d')}
          title="Esquemático 2D (tecla V)"
          data-hand="view:2d"
        >
          2D
        </button>
        <button
          type="button"
          className={view === '3d' ? 'ghost active' : 'ghost'}
          onClick={() => setView('3d')}
          title="Bancada 3D (tecla V)"
          data-hand="view:3d"
        >
          3D
        </button>
      </span>

      <span className="dock-sep" aria-hidden="true" />

      <span className="dock-zoom" role="group" aria-label="Zoom">
        <button
          type="button"
          className="ghost"
          data-hand="zoom:out"
          aria-label="Reduzir o zoom"
          title="Reduzir (−)"
          onClick={() => applyZoom(1 / 1.25)}
        >
          −
        </button>
        <button
          type="button"
          className="ghost zoom-pct"
          data-hand="zoom:reset"
          aria-label={view === '2d' ? 'Caber o quadro inteiro' : 'Enquadrar a bancada'}
          title="Caber tudo / enquadrar de novo (0)"
          onClick={applyZoomReset}
        >
          {view === '2d' ? `${Math.round(zoom * 100)}%` : 'enquadrar'}
        </button>
        <button
          type="button"
          className="ghost"
          data-hand="zoom:in"
          aria-label="Ampliar o zoom"
          title="Ampliar (+)"
          onClick={() => applyZoom(1.25)}
        >
          +
        </button>
      </span>
    </footer>
  );
}
