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
  const arm = useEditor((s) => s.arm);

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
      <p className="hint">
        Clique num pontinho e depois noutro — ou arraste de um até o outro. Soltar perto já
        conecta (imã); soltar no vazio cancela. <kbd>Esc</kbd> solta o fio da mão.
      </p>
    </aside>
  );
}
