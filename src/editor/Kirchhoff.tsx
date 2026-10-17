import { KCL_TOL, fechaConta, malhas, porNo } from '../core/kirchhoff';
import { KIND_LABEL } from '../core/kinds';
import type { Reading } from '../core/netlist';
import { IcoMalha, IcoNo } from './icons';
import { formatAmps } from './symbol';

/** Tensão no formato da tabela de leituras (toFixed(2), mesmo ponto). */
const fmtV = (v: number) => `${v.toFixed(2)} V`;

/** 0 V de verdade (folga de float): parado não sobe nem cai — como o ramo de 0 mA. */
const parado = (v: number) => Math.abs(v) <= KCL_TOL;

/**
 * ESTAÇÃO DE KIRCHHOFF — as DUAS leis, a mesma no painel de quem monta e na
 * projeção da sala (as duas rodam sobre o MESMO reading, então não têm como
 * discordar; nada novo vai pelo fio do espelho).
 *
 * 1ª lei: cada nó com seus ramos e o sentido RELATIVO ÀQUELE nó, e a conta
 * `Σ(entram) − Σ(saem)`.
 * 2ª lei: cada malha independente com o percurso (`GND → … → GND`), a
 * variação de tensão de trecho em trecho (sobe/cai) e o `Σ` da volta.
 *
 * As duas somas são zero POR CONSTRUÇÃO — é o solver que impõe as leis para
 * achar o circuito. O valor da estação é o aluno LER e conferir, com a
 * corrente animada do fio ali do lado.
 */
export function Kirchhoff({ reading }: { reading: Reading }) {
  const nos = porNo(reading);
  const voltas = malhas(reading);
  if (!nos.length && !voltas.length) return null;

  return (
    <>
      {nos.length > 0 && (
        <section className="card kirchhoff">
          <h3>
            <IcoNo size={18} />
            Corrente no nó
            <span className="selo">1ª lei de Kirchhoff</span>
          </h3>
          <p className="card-sub">
            Num mesmo ponto do circuito, tudo o que chega também sai. Somando o que entra e
            tirando o que sai, a conta fecha em zero.
          </p>
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
          <p className="card-sub">Σ = (o que entra) − (o que sai): a 1ª lei pede zero.</p>
        </section>
      )}

      {voltas.length > 0 && (
        <section className="card kirchhoff">
          <h3>
            <IcoMalha size={18} />
            Tensão na volta
            <span className="selo">2ª lei de Kirchhoff</span>
          </h3>
          <p className="card-sub">
            Dando uma volta completa pelo circuito, a tensão que sobe é igual à que cai: a
            soma de tudo fecha em zero.
          </p>
          <ol className="malhas">
            {voltas.map((m, i) => (
              <li key={m.passos.map((p) => p.id).join('+')} className="malha">
                <div className="malha-topo">
                  <span>
                    Volta {i + 1} · {m.passos.length}{' '}
                    {m.passos.length === 1 ? 'elemento' : 'elementos'}
                  </span>
                  <span className={fechaConta(m.soma) ? 'soma ok' : 'soma ruim'}>
                    Σ {fmtV(m.soma)}
                  </span>
                </div>
                <p className="percurso">
                  {[m.passos[0].de, ...m.passos.map((p) => p.para)].map((n, k) => (
                    <span key={`${n}-${k}`}>
                      {k > 0 && ' → '}
                      <code>{n}</code>
                    </span>
                  ))}
                </p>
                <ul className="passos">
                  {m.passos.map((p, k) => (
                    <li key={`${p.id}-${k}`}>
                      <span className="passo-quem">
                        <code>{p.id}</code> {KIND_LABEL[p.kind]}
                      </span>
                      <span className={`dv ${parado(p.dv) ? 'parado' : p.dv > 0 ? 'sobe' : 'cai'}`}>
                        {parado(p.dv)
                          ? fmtV(p.dv)
                          : `${p.dv > 0 ? '+' : '−'}${fmtV(Math.abs(p.dv))} ${p.dv > 0 ? 'sobe' : 'cai'}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className="card-sub">Σ ao redor da volta = 0: a 2ª lei pede zero.</p>
        </section>
      )}
    </>
  );
}
