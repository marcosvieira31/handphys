import { useEffect, useMemo, useState } from 'react';
import type { CircuitDoc } from '../core/netlist';
import { rcStation, TAU_FRACAO, type RcCurve } from '../core/rc';
import { formatAmps } from './symbol';
import { useEditor } from './store';

/**
 * ESTAÇÃO RC — o osciloscópio da bancada.
 *
 * Aparece no painel (e na projeção da sala, que reusa o mesmo componente)
 * quando há capacitor no circuito. A curva, o τ e os dois regimes vêm TODOS de
 * [`../core/rc.ts`](../core/rc.ts), que é função pura do documento: a projeção
 * recalcula os MESMOS números do MESMO doc, então não há como a tela grande
 * discordar da bancada — a mesma filosofia da estação de Kirchhoff.
 *
 * O seletor *Carregar / Descarregar* é a chave de duas posições da bancada de
 * verdade: uma posição liga a fonte ao ramo RC, a outra põe um fio no lugar
 * dela. Fechar a chave simples do circuito é o gesto de energizar; abrir não
 * descarrega nada (o capacitor fica como está), e a tela diz isso em vez de
 * inventar uma descarga que a montagem não tem.
 *
 * A varredura (o traço que cresce e a bolinha correndo na curva) é enfeite
 * LOCAL de cada tela: não vai pelo fio e não muda nenhum número. Ela reinicia
 * a cada mexida no circuito — que é o gesto do professor ("fecha a chave e
 * olha o que acontece") — e também pelo botão *Rodar de novo*. Quem pediu menos
 * movimento no sistema (`prefers-reduced-motion`) recebe a curva já pronta.
 */

/** Tempo na unidade da aula: s, ms, µs ou ns conforme a escala do τ. */
function seg(t: number): string {
  const a = Math.abs(t);
  const br = (n: number, casas: number) => n.toFixed(casas).replace('.', ',');
  if (a >= 1) return `${br(t, a >= 10 ? 0 : 1)} s`;
  if (a >= 1e-3) return `${br(t * 1e3, a * 1e3 >= 10 ? 0 : 1)} ms`;
  if (a >= 1e-6) return `${br(t * 1e6, 0)} µs`;
  return `${br(t * 1e9, 0)} ns`;
}

const volts = (v: number) => `${v.toFixed(2).replace('.', ',')} V`;

/** Duração da varredura na tela (s de relógio) — enfeite, não é o τ. */
const VARREDURA_S = 2.4;

/** Geometria do osciloscópio (viewBox do SVG). */
const W = 288;
const H = 132;
const PL = 42;
const PR = 10;
const PT = 12;
const PB = 20;

/** Tensão da curva no instante `t`, interpolada entre as amostras. */
function vEm(c: RcCurve, t: number): number {
  const n = c.t.length;
  if (t <= 0) return c.v[0];
  if (t >= c.window) return c.v[n - 1];
  const k = Math.min(n - 2, Math.floor((t / c.window) * (n - 1)));
  const a = c.t[k];
  const b = c.t[k + 1];
  const f = b > a ? (t - a) / (b - a) : 0;
  return c.v[k] + f * (c.v[k + 1] - c.v[k]);
}

/** Corrente da curva no instante `t`, interpolada entre as amostras. */
function iEm(c: RcCurve, t: number): number {
  const n = c.t.length;
  if (t <= 0) return c.i[0];
  if (t >= c.window) return c.i[n - 1];
  const k = Math.min(n - 2, Math.floor((t / c.window) * (n - 1)));
  const a = c.t[k];
  const b = c.t[k + 1];
  const f = b > a ? (t - a) / (b - a) : 0;
  return c.i[k] + f * (c.i[k + 1] - c.i[k]);
}

function Osciloscopio({
  ativa,
  outra,
  prog,
}: {
  ativa: RcCurve;
  outra: RcCurve | null;
  prog: number;
}) {
  const janela = ativa.window;
  const curvas = outra ? [ativa, outra] : [ativa];
  const vLo = Math.min(...curvas.map((c) => Math.min(c.v0, c.vinf)), 0);
  const vHi = Math.max(...curvas.map((c) => Math.max(c.v0, c.vinf)), 0);
  const bruto = vHi - vLo;
  const folga = (bruto > 0 ? bruto : 1) * 0.08;
  const yMin = vLo - folga;
  const yMax = vHi + folga;

  const X = (t: number) => PL + (t / janela) * (W - PL - PR);
  const Y = (v: number) => PT + (1 - (v - yMin) / (yMax - yMin)) * (H - PT - PB);

  /** Polilinha de `c` até o instante `ate` (com a ponta interpolada no corte). */
  const traco = (c: RcCurve, ate: number): string => {
    const passo = Math.max(1, Math.ceil(c.t.length / 200));
    const pts: string[] = [];
    for (let k = 0; k < c.t.length; k += passo) {
      if (c.t[k] > ate) break;
      pts.push(`${X(c.t[k]).toFixed(1)},${Y(c.v[k]).toFixed(1)}`);
    }
    pts.push(`${X(ate).toFixed(1)},${Y(vEm(c, ate)).toFixed(1)}`);
    return pts.join(' ');
  };

  const tc = prog * janela;
  const vc = vEm(ativa, tc);
  const tau = ativa.tau;
  const alvo = ativa.v0 + TAU_FRACAO * (ativa.vinf - ativa.v0);
  const temNivel = Math.abs(ativa.vinf - ativa.v0) > 1e-12;

  return (
    <svg
      className="rc-scope"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Capacitor ${volts(ativa.v0)} até ${volts(ativa.vinf)}`}
    >
      <rect className="rc-bg" x={PL} y={PT} width={W - PL - PR} height={H - PT - PB} rx={4} />

      {/* o nível de 63,2%: onde o τ vai ser lido */}
      {temNivel && (
        <>
          <line className="rc-63" x1={PL} y1={Y(alvo)} x2={W - PR} y2={Y(alvo)} />
          <text className="rc-lab" x={PL - 4} y={Y(alvo) + 3.5} textAnchor="end">
            63%
          </text>
        </>
      )}

      {/* a outra ponta da experiência, apagada: o outro regime do mesmo circuito */}
      {outra && <polyline className="rc-curve other" points={traco(outra, janela)} />}
      {/* a curva do regime escolhido, acesa até onde a varredura chegou */}
      <polyline className="rc-curve active" points={traco(ativa, tc)} />

      {/* τ no eixo do tempo */}
      {temNivel && tau != null && tau > 0 && (
        <>
          <line className="rc-tau" x1={X(tau)} y1={PT} x2={X(tau)} y2={H - PB} />
          <text className="rc-lab tau" x={X(tau)} y={H - 6} textAnchor="middle">
            τ
          </text>
        </>
      )}

      {/* eixos */}
      <text className="rc-lab" x={PL - 4} y={PT + 8} textAnchor="end">
        {volts(Math.max(ativa.v0, ativa.vinf))}
      </text>
      <text className="rc-lab" x={PL} y={H - 6} textAnchor="middle">
        0
      </text>
      <text className="rc-lab" x={W - PR} y={H - 6} textAnchor="end">
        {seg(janela)}
      </text>

      {/* a bolinha da varredura */}
      <circle className="rc-cursor" cx={X(tc)} cy={Y(vc)} r={3.4} />
    </svg>
  );
}

/**
 * A seção do painel. `null` (nada na tela) quando não há capacitor — a estação
 * só existe onde ela ensina alguma coisa.
 */
export function Rc({ doc }: { doc: CircuitDoc }) {
  const selection = useEditor((s) => s.selection);
  const capSel = selection?.kind === 'comp' ? selection.id : null;
  // memoizado no documento: a busca do τ roda alguns milhares de passos de
  // solver e o painel re-renderiza a cada mexida de mouse — o doc é a chave.
  const st = useMemo(() => rcStation(doc, capSel), [doc, capSel]);

  const [regime, setRegime] = useState<'carga' | 'descarga'>('carga');
  const [prog, setProg] = useState(1);
  const [replay, setReplay] = useState(0);

  const capId = st?.capId;
  useEffect(() => {
    if (!capId) return;
    const reduz =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Aba escondida (projetor em segundo plano, automação): o requestAnimationFrame
    // fica parado esperando foco — melhor entregar a curva pronta que uma curva
    // de 2 pontos parada no zero.
    const escondida = typeof document !== 'undefined' && document.hidden;
    if (reduz || escondida) {
      setProg(1);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    setProg(0);
    const passo = (now: number) => {
      // o timestamp do rAF é o início do quadro e pode vir ANTES do t0 do
      // efeito (mesmo quadro): sem o piso, a varredura começa em tempo negativo
      const p = Math.min(1, Math.max(0, (now - t0) / (VARREDURA_S * 1000)));
      setProg(p);
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [doc, replay, capId, regime]);

  if (!st) return null;
  const ativa = regime === 'descarga' ? st.descarga : st.carga;
  const outra = regime === 'descarga' ? st.carga : st.descarga;
  const tc = prog * (ativa?.window ?? 0);

  return (
    <section className="rc">
      <h3>Estação RC — carga e descarga</h3>

      <div className="rc-modos" role="group" aria-label="Experiência">
        <button
          type="button"
          className={`ghost${regime === 'carga' ? ' active' : ''}`}
          data-hand="rc-carga"
          onClick={() => setRegime('carga')}
        >
          Carregar
        </button>
        <button
          type="button"
          className={`ghost${regime === 'descarga' ? ' active' : ''}`}
          data-hand="rc-descarga"
          onClick={() => setRegime('descarga')}
        >
          Descarregar
        </button>
      </div>

      {!st.temFonte ? (
        <p className="hint">
          Sem fonte não há carga para ver: o capacitor começa descarregado e nada o carrega. Ponha
          uma fonte (e um resistor no caminho) para a estação ter o que medir.
        </p>
      ) : !ativa ? (
        <p className="hint">
          Não deu para simular este capacitor: confira se o valor da capacitância é maior que zero
          e se ele está ligado a um caminho com resistor.
        </p>
      ) : (
        <>
          <Osciloscopio ativa={ativa} outra={outra} prog={prog} />
          <p className="rc-regime">
            {regime === 'carga' ? (
              <>
                com a <strong>fonte</strong> (chave fechada): <code>{st.capId}</code> vai de{' '}
                {volts(ativa.v0)} até {volts(ativa.vinf)}
              </>
            ) : (
              <>
                com a <strong>fonte virada em fio</strong> (2ª posição da chave):{' '}
                <code>{st.capId}</code> vai de {volts(ativa.v0)} até {volts(ativa.vinf)}
              </>
            )}
          </p>
          <ul className="rc-nums">
            <li>
              <span>τ medido</span>
              <code>{ativa.tau != null ? seg(ativa.tau) : '—'}</code>
            </li>
            <li>
              <span>V final</span>
              <code>{volts(ativa.vinf)}</code>
            </li>
            <li className="rc-agora">
              <span>na varredura</span>
              <code>
                {volts(vEm(ativa, tc))} · {formatAmps(iEm(ativa, tc))} em {seg(tc)}
              </code>
            </li>
          </ul>
          <p className="hint">
            τ é o tempo de <strong>63,2%</strong> do caminho (1 − e⁻¹). No RC de sempre carregar e
            descarregar dão o mesmo τ; aqui, cada regime tem o resistor que o capacitor enxerga no
            caminho.
            {st.temChave ? ' A chave do circuito é o gesto de energizar.' : ''}
          </p>
          <div className="rc-actions">
            <button
              type="button"
              className="ghost"
              data-hand="rc-replay"
              onClick={() => setReplay((r) => r + 1)}
            >
              Rodar de novo
            </button>
          </div>
        </>
      )}
    </section>
  );
}
