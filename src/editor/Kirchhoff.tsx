import { fechaConta, porNo } from '../core/kirchhoff';
import type { CompKind, Reading } from '../core/netlist';
import { formatAmps } from './symbol';

const KIND_LABEL: Record<CompKind, string> = {
  vsource: 'Fonte',
  resistor: 'Resistor',
  capacitor: 'Capacitor',
  lamp: 'Lâmpada',
  switch: 'Chave',
  ground: 'Terra',
};

/**
 * Tabela da 1ª LEI DE KIRCHHOFF — a mesma no painel de quem monta e na
 * projeção da sala (as duas rodam `porNo` sobre o MESMO reading, então não
 * têm como discordar; nada novo vai pelo fio do espelho).
 *
 * Cada nó lista seus ramos com o sentido RELATIVO ÀQUELE nó e a conta
 * `Σ(entram) − Σ(saem)`, que é zero por construção — o valor da estação é o
 * aluno LER e conferir, com a corrente animada do fio ali do lado.
 */
export function Kirchhoff({ reading }: { reading: Reading }) {
  const nos = porNo(reading);
  if (!nos.length) return null;

  return (
    <section className="kirchhoff">
      <h3>Kirchhoff — corrente por nó</h3>
      <ul className="nos">
        {nos.map((n) => (
          <li key={n.net}>
            <div className="no-topo">
              <code>{n.net}</code>
              <span className={fechaConta(n.soma) ? 'soma ok' : 'soma ruim'}>
                entram {formatAmps(n.entram)} · saem {formatAmps(n.saem)} · Σ {formatAmps(n.soma)}
              </span>
            </div>
            <ul className="ramos">
              {n.ramos.map((r) => (
                <li key={r.id}>
                  <span className="ramo-quem">
                    <code>{r.id}</code> {KIND_LABEL[r.kind]}
                  </span>
                  <span className={`ramo-lado ${r.sentido ?? ''}`}>
                    {r.sentido ? `${r.sentido} ` : ''}
                    {formatAmps(r.amps)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="hint">
        Σ = o que entra menos o que sai: a 1ª lei de Kirchhoff pede zero.
      </p>
    </section>
  );
}
