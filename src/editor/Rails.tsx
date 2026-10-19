import { KIND_LABEL } from '../core/kinds';
import type { CompKind } from '../core/netlist';
import type { WheelEvent as ReactWheelEvent } from 'react';
import { useAr, definirAr } from './ar';
import { IcoCamera } from './icons';
import { formatValue, Symbol } from './symbol';
import { useEditor } from './store';
import { applyZoom, applyZoomReset } from './zoom';

/** Os itens do trilho: o TIPO e o valor com que a peça nasce. O nome de cada
 *  uma e o que ela faz vêm de `core/kinds` — a mesma fonte dos painéis. */
const ITEMS: { kind: CompKind; hint: string; value?: number }[] = [
  { kind: 'vsource', hint: '9 V', value: 9 },
  { kind: 'resistor', hint: '100 Ω', value: 100 },
  { kind: 'lamp', hint: '20 Ω', value: 20 },
  { kind: 'capacitor', hint: '1 µF', value: 1e-6 },
  { kind: 'switch', hint: 'aberta' },
  { kind: 'ground', hint: 'referência 0 V' },
];

/**
 * Roda do mouse sobre a FAIXA horizontal do trilho (bancada estreita): o eixo Y
 * vira rolagem lateral. Trackpad já manda delta X nativo (e o navegador cuida
 * dele), então só a roda dominante no Y é traduzida; `deltaMode` 1/2 (linhas e
 * páginas, roda antiga) volta para pixels. Fora da faixa o trilho é coluna e não
 * rola — aí isto devolve 0 e nada muda.
 */
export const deslocDaRoda = (deltaY: number, deltaX: number, deltaMode = 0): number => {
  if (Math.abs(deltaY) <= Math.abs(deltaX)) return 0;
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 100 : deltaY;
  return px;
};

/** Repassa a roda para o TRILHO da esquerda: mover a roda rola a faixa na hora. */
const roda = (e: ReactWheelEvent<HTMLElement>) => {
  const d = deslocDaRoda(e.deltaY, e.deltaX, e.deltaMode);
  if (d) e.currentTarget.scrollLeft += d;
};

/**
 * Trilhos — as ferramentas ao LADO do quadro (componentes à esquerda, vista e
 * zoom à direita). Em bancada ESTREITA (container < 600 px) eles viram faixas
 * horizontais: itens em cima, vista embaixo, com scroll lateral.
 *
 * Com as mãos o limite INFERIOR da câmera é o mais perto: descer o braço abaixo
 * da borda de enxerga da webcam perde o rastreio justamente onde o item está —
 * por isso o padrão é coluna ao lado do quadro, na horizontal, onde a câmera
 * rende. Na bancada estreita quem comanda é o DEDO (celular/janela miúda), não
 * a webcam: ali a faixa de ~70 px cabe em qualquer altura de tela e o quadro
 * fica com a sobra. O mouse continua servindo pelos MESMOS alvos ([data-hand] =
 * a pinça clica como um clique).
 */

/** Esquerda: a lixeira no TOPO + os componentes + Conectar (armar → pinçar no quadro posicionar). */
export function ItemsRail() {
  const placing = useEditor((s) => s.placing);
  const wiring = useEditor((s) => s.wiring);
  // algo na mão (componente agarrado, item em arraste ou fio puxado): a lixeira
  // "acende" convidando a soltar por lá
  const holding = useEditor((s) => !!(s.grip || s.carry || s.draft));
  const arm = useEditor((s) => s.arm);
  const armWire = useEditor((s) => s.armWire);
  const trash = useEditor((s) => s.trash);

  return (
    <aside className="rail rail-items" role="group" aria-label="Lixeira, componentes e fio" onWheel={roda}>
      <button
        type="button"
        className={holding ? 'rail-item rail-trash holding' : 'rail-item rail-trash'}
        onClick={trash}
        data-hand="trash"
        title="Lixeira: solte aqui o item que está na mão, ou clique com ele selecionado (Ctrl+Z desfaz)"
      >
        <svg viewBox="-24 -24 48 48" width={26} height={26} aria-hidden>
          <line x1={-13} y1={-13} x2={13} y2={-13} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          <path d="M-4 -19 H4" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          <path
            d="M-11 -7 L-8.5 14 H8.5 L11 -7"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <line x1={-3.5} y1={-1} x2={-3.5} y2={8} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          <line x1={3.5} y1={-1} x2={3.5} y2={8} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
        <strong>Lixeira</strong>
        <em>apagar</em>
      </button>
      {ITEMS.map((it) => (
        <button
          key={it.kind}
          type="button"
          className={placing === it.kind ? 'rail-item active' : 'rail-item'}
          onClick={() => arm(placing === it.kind ? null : it.kind)}
          data-hand={`kind:${it.kind}`}
          title={`${KIND_LABEL[it.kind]} ${it.hint} — clique e depois no quadro para posicionar`}
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
          <strong>{KIND_LABEL[it.kind]}</strong>
          <em>{it.kind === 'switch' ? it.hint : formatValue(it.kind, it.value ?? 0) || it.hint}</em>
        </button>
      ))}
      <button
        type="button"
        className={wiring ? 'rail-item active' : 'rail-item'}
        onClick={() => armWire(!wiring)}
        data-hand="wire"
        title="Modo fio: clique num terminal e depois noutro (tecla F)"
      >
        <svg viewBox="-24 -24 48 48" width={26} height={26} aria-hidden>
          <line x1={-13} y1={11} x2={13} y2={-11} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={-13} cy={11} r={5} fill="currentColor" />
          <circle cx={13} cy={-11} r={5} fill="currentColor" />
        </svg>
        <strong>Conectar</strong>
        <em>fio · F</em>
      </button>
    </aside>
  );
}

/** Direita: vista 2D/3D, AR de bolso, cores por tensão e zoom (− / % / +), empilhados. */
export function ViewRail() {
  const view = useEditor((s) => s.view);
  const zoom = useEditor((s) => s.zoom);
  const colorByVoltage = useEditor((s) => s.colorByVoltage);
  const flow = useEditor((s) => s.flow);
  const setView = useEditor((s) => s.setView);
  const setColorByVoltage = useEditor((s) => s.setColorByVoltage);
  const setFlow = useEditor((s) => s.setFlow);
  const ar = useAr();
  // O AR só VALE na bancada 3D (é o canvas dela que fica transparente): sair
  // para o 2D não desliga a chave, mas a câmera fecha junto com a camada — por
  // isso o botão "acende" só quando o fundo de câmera está de fato na tela.
  const arAtivo = ar && view === '3d';

  return (
    <aside className="rail rail-view" role="group" aria-label="Vista, cores e zoom" onWheel={roda}>
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

      <button
        type="button"
        className={arAtivo ? 'rail-item active' : 'rail-item'}
        onClick={() => {
          if (arAtivo) definirAr(false);
          else {
            setView('3d'); // o fundo de câmera mora no canvas da bancada 3D
            definirAr(true);
          }
        }}
        data-hand="ar"
        title="AR de bolso: a câmera vira o fundo e o circuito aparece na sua mesa (o navegador pede a permissão da câmera). Vale só na bancada 3D."
      >
        <IcoCamera size={26} />
        <strong>AR</strong>
        <em>na sua mesa</em>
      </button>

      <button
        type="button"
        className={colorByVoltage ? 'rail-item active' : 'rail-item'}
        onClick={() => setColorByVoltage(!colorByVoltage)}
        data-hand="colors"
        title="Cores por tensão: pinta cada nó pelo potencial"
      >
        <svg viewBox="-24 -24 48 48" width={26} height={26} aria-hidden>
          <circle cx={-10} cy={0} r={7} fill="currentColor" opacity={0.95} />
          <circle cx={2} cy={0} r={7} fill="currentColor" opacity={0.55} />
          <circle cx={14} cy={0} r={7} fill="currentColor" opacity={0.28} />
        </svg>
        <strong>Cores</strong>
        <em>por tensão</em>
      </button>

      <button
        type="button"
        className={flow ? 'rail-item active' : 'rail-item'}
        onClick={() => setFlow(!flow)}
        data-hand="flow"
        title="Corrente elétrica: gotas em movimento nos fios, mais rápidas quanto maior a corrente"
      >
        <svg viewBox="-24 -24 48 48" width={26} height={26} aria-hidden>
          <g stroke="currentColor" strokeWidth={3} strokeLinecap="round">
            <line x1={-15} y1={-9} x2={-1} y2={-9} />
            <line x1={-7} y1={0} x2={9} y2={0} />
            <line x1={-13} y1={9} x2={3} y2={9} />
          </g>
        </svg>
        <strong>Corrente</strong>
        <em>nos fios</em>
      </button>

      <span className="rail-zoom" role="group" aria-label="Zoom">
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
    </aside>
  );
}
