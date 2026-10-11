import { useState } from 'react';
import type { CompKind, Placed, Reading } from '../core/netlist';
import { formatAmps, formatValue } from './symbol';
import { useEditor } from './store';

const KIND_LABEL: Record<CompKind, string> = {
  vsource: 'Fonte',
  resistor: 'Resistor',
  capacitor: 'Capacitor',
  lamp: 'Lâmpada',
  switch: 'Chave',
  ground: 'Terra',
};

/** Rótulo curto de nó, para caber no painel ("N3"). */
const net = (n: string | null) => (n === null ? '—' : n);

function NumberField({ comp, onCommit }: { comp: Placed; onCommit: (v: number) => void }) {
  const unit = comp.kind === 'vsource' ? 'V' : comp.kind === 'capacitor' ? 'F' : 'Ω';
  const [text, setText] = useState(String(comp.value));
  return (
    <label className="field">
      <span>Valor ({unit})</span>
      <input
        type="number"
        min={0}
        step="any"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(Number(text))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

/**
 * Painel de medição: leituras V/I/R do solver, ao vivo. É o coração da estação
 * "Lei de Ohm" — o aluno mexe no resistor e vê a corrente mudar na hora.
 */
export function Inspector({ reading }: { reading: Reading }) {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const canUndo = useEditor((s) => s.past.length > 0);
  const { rotate, removeSelected, setValue, toggleSwitch, undo } = useEditor();
  const selected = selection?.kind === 'comp' ? doc.comps.find((c) => c.id === selection.id) : null;

  return (
    <aside className="inspector">
      <header>
        <h2>Medições</h2>
        <button type="button" className="ghost" onClick={undo} disabled={!canUndo}>
          Desfazer
        </button>
      </header>

      {reading.error && <p className="notice error">{reading.error}</p>}
      {reading.diagnostics.length > 0 && (
        <ul className="notice warn">
          {reading.diagnostics.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {reading.empty && <p className="hint">Monte um circuito para ver as leituras aqui.</p>}

      {reading.comps.length > 0 && (
        <table className="readings">
          <thead>
            <tr>
              <th>Componente</th>
              <th>Valor</th>
              <th>V</th>
              <th>I</th>
              <th>Nós</th>
            </tr>
          </thead>
          <tbody>
            {reading.comps.map((r) => {
              const comp = doc.comps.find((c) => c.id === r.id);
              const sel = selection?.kind === 'comp' && selection.id === r.id;
              return (
                <tr
                  key={r.id}
                  className={sel ? 'selected' : undefined}
                  onClick={() => useEditor.getState().select({ kind: 'comp', id: r.id })}
                >
                  <td>
                    <code>{r.id}</code> {KIND_LABEL[r.kind]}
                  </td>
                  <td>{comp ? formatValue(r.kind, comp.value) : '—'}</td>
                  <td className="num">{r.volts.toFixed(2)}</td>
                  <td className="num">{formatAmps(r.amps)}</td>
                  <td className="nets">
                    {net(r.netA)}
                    {r.netB ? ` → ${net(r.netB)}` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {reading.nodes.length > 1 && (
        <section>
          <h3>Tensão dos nós</h3>
          <ul className="nodes">
            {reading.nodes.map((n) => (
              <li key={n.net}>
                <code>{n.net}</code>
                <span className="num">{n.volts.toFixed(2)} V</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <section className="editor-box">
          <h3>
            Editar <code>{selected.id}</code> ({KIND_LABEL[selected.kind]})
          </h3>
          {selected.kind !== 'ground' && (
            <NumberField comp={selected} onCommit={(v) => setValue(selected.id, v)} />
          )}
          {selected.kind === 'switch' && (
            <label className="field row">
              <input
                type="checkbox"
                checked={!!selected.closed}
                onChange={() => toggleSwitch(selected.id)}
              />
              <span>Fechada (conduz)</span>
            </label>
          )}
          <div className="actions">
            {selected.kind !== 'ground' && (
              <button type="button" onClick={() => rotate(selected.id)}>
                Girar 90°
              </button>
            )}
            <button type="button" className="ghost" onClick={removeSelected}>
              Excluir
            </button>
          </div>
          <p className="hint">
            Arraste o componente para mover · <kbd>R</kbd> gira · <kbd>Delete</kbd> exclui
          </p>
        </section>
      )}
    </aside>
  );
}
