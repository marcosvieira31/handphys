import type { CompKind } from '../core/netlist';
import { formatValue, Symbol } from './symbol';
import { useEditor } from './store';

const ITEMS: { kind: CompKind; label: string; hint: string; value?: number }[] = [
  { kind: 'vsource', label: 'Fonte', hint: '9 V', value: 9 },
  { kind: 'resistor', label: 'Resistor', hint: '100 Ω', value: 100 },
  { kind: 'lamp', label: 'Lâmpada', hint: '20 Ω', value: 20 },
  { kind: 'capacitor', label: 'Capacitor', hint: '1 µF', value: 1e-6 },
  { kind: 'switch', label: 'Chave', hint: 'aberta' },
  { kind: 'ground', label: 'Terra', hint: 'referência 0 V' },
];

/**
 * Paleta: clicou, armou; clicou no quadro, posicinou. O MESMO alvo de clique
 * servirá à pinça da Fase 2 — por isso a semântica mora no store, não aqui.
 */
export function Palette() {
  const placing = useEditor((s) => s.placing);
  const wiring = useEditor((s) => s.wiring);
  const arm = useEditor((s) => s.arm);
  const armWire = useEditor((s) => s.armWire);

  return (
    <aside className="palette">
      <h2>Componentes</h2>
      <p className="hint">Clique e depois clique no quadro para posicionar.</p>
      <ul>
        {ITEMS.map((it) => (
          <li key={it.kind}>
            <button
              type="button"
              className={placing === it.kind ? 'palette-item active' : 'palette-item'}
              onClick={() => arm(placing === it.kind ? null : it.kind)}
              data-hand={`kind:${it.kind}`}
            >
              <svg viewBox="-24 -24 48 48" width={34} height={34} aria-hidden>
                <Symbol
                  comp={{
                    id: 'preview',
                    kind: it.kind,
                    x: 0,
                    y: 0,
                    rot: it.kind === 'ground' ? 0 : 0,
                    value: it.value ?? 0,
                  }}
                />
              </svg>
              <span className="meta">
                <strong>{it.label}</strong>
                <em>{it.kind === 'switch' ? it.hint : formatValue(it.kind, it.value ?? 0) || it.hint}</em>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <h2>Fio</h2>
      <ul>
        <li>
          <button
            type="button"
            className={wiring ? 'palette-item active' : 'palette-item'}
            onClick={() => armWire(!wiring)}
            data-hand="wire"
          >
            <svg viewBox="-24 -24 48 48" width={34} height={34} aria-hidden>
              <line x1={-13} y1={11} x2={13} y2={-11} stroke="#c9d1d9" strokeWidth={2.5} strokeLinecap="round" />
              <circle cx={-13} cy={11} r={5} fill="#8b949e" />
              <circle cx={13} cy={-11} r={5} fill="#8b949e" />
            </svg>
            <span className="meta">
              <strong>Conectar</strong>
              <em>modo fio · tecla F</em>
            </span>
          </button>
        </li>
      </ul>
      <p className="hint">
        No modo fio os terminais ficam acesos: clique num pontinho e depois noutro (a mira é
        generosa, errar não perde o fio). <kbd>Esc</kbd> sai do modo. Com as mãos ligadas, a
        pinça faz o mesmo gesto e também clica nos botões desta paleta.
      </p>
    </aside>
  );
}
