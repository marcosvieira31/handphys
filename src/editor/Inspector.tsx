import { useEffect, useState } from 'react';
import { KIND_HINT, KIND_LABEL } from '../core/kinds';
import type { CompReading, Placed, Reading, Wire } from '../core/netlist';
import { QUESTAO_MAX } from '../mirror/protocol';
import { CHALLENGES, challengeById, evaluateChallenge } from './challenges';
import { HandsPanel } from './HandsPanel';
import {
  KIND_ICON,
  IcoAlerta,
  IcoAlvo,
  IcoFio,
  IcoLapis,
  IcoMao,
  IcoMedir,
  IcoNo,
  IcoOk,
  IcoPergunta,
} from './icons';
import { Kirchhoff } from './Kirchhoff';
import { Rc } from './Rc';
import { formatAmps, formatValue, formatVolts } from './symbol';
import { useEditor } from './store';
import { PRESETS, UNIDADE, lerValor, textoValor } from './valores';

/** Rótulo curto de nó, para caber no painel ("N3"). */
const net = (n: string | null) => (n === null ? '—' : n);

/* ------------------------------------------------------------------------ */
/* Valor da peça: texto com prefixo (4,7k · 100µ) + os valores de prateleira */
/* ------------------------------------------------------------------------ */

function ValorDaPeca({ comp }: { comp: Placed }) {
  const setValue = useEditor((s) => s.setValue);
  const unidade = UNIDADE[comp.kind];
  const [texto, setTexto] = useState(() => textoValor(comp.value));
  const [erro, setErro] = useState(false);
  // a peça mudou por fora (preset, desfazer, outra peça): o campo acompanha
  useEffect(() => {
    setTexto(textoValor(comp.value));
    setErro(false);
  }, [comp.id, comp.value]);

  const confirmar = () => {
    const v = lerValor(texto);
    if (v === null) {
      setErro(true);
      return;
    }
    setErro(false);
    setValue(comp.id, v);
  };

  return (
    <div className="valor">
      <label className="valor-campo">
        <span>Valor</span>
        <span className={erro ? 'valor-in erro' : 'valor-in'}>
          <input
            type="text"
            inputMode="decimal"
            spellCheck={false}
            autoComplete="off"
            value={texto}
            aria-invalid={erro}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={confirmar}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setTexto(textoValor(comp.value));
                setErro(false);
              }
            }}
          />
          <em>{unidade}</em>
        </span>
      </label>
      {erro && (
        <p className="valor-erro">
          Não entendi esse número. Exemplos: <code>220</code>, <code>4,7k</code>, <code>100µ</code>.
        </p>
      )}
      <div className="presets" role="group" aria-label="Valores comuns">
        {PRESETS[comp.kind].map((v) => (
          <button
            key={v}
            type="button"
            className={Math.abs(v - comp.value) < v * 1e-9 ? 'ghost active' : 'ghost'}
            data-hand={`valor:${v}`}
            aria-pressed={Math.abs(v - comp.value) < v * 1e-9}
            onClick={() => setValue(comp.id, v)}
          >
            {formatValue(comp.kind, v)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* O que está selecionado: sempre no TOPO do painel (antes ficava no fim,    */
/* depois de Kirchhoff e do RC — o aluno clicava na peça e nada aparecia)    */
/* ------------------------------------------------------------------------ */

function PecaSelecionada({ comp, rd }: { comp: Placed; rd: CompReading | undefined }) {
  const { rotate, removeSelected, toggleSwitch, select } = useEditor();
  const Ico = KIND_ICON[comp.kind];
  const ligada = !!rd?.netB || comp.kind === 'ground';
  return (
    <section className="card sel" aria-label={`Peça selecionada ${comp.id}`}>
      <div className="sel-top">
        <span className="sel-ico">
          <Ico size={22} />
        </span>
        <span className="sel-nome">
          <strong>
            {KIND_LABEL[comp.kind]} <code>{comp.id}</code>
          </strong>
          <small>{KIND_HINT[comp.kind]}</small>
        </span>
        <button
          type="button"
          className="ghost sel-x"
          aria-label="Tirar a seleção"
          title="Tirar a seleção (Esc)"
          data-hand="sel-fechar"
          onClick={() => select(null)}
        >
          ×
        </button>
      </div>

      {comp.kind === 'switch' ? (
        <button
          type="button"
          className={comp.closed ? 'chave-btn fechada' : 'chave-btn'}
          data-hand="switch-toggle"
          aria-pressed={!!comp.closed}
          onClick={() => toggleSwitch(comp.id)}
        >
          {comp.closed ? 'Fechada — conduz. Toque para abrir' : 'Aberta — não conduz. Toque para fechar'}
        </button>
      ) : comp.kind === 'ground' ? (
        <p className="card-sub">Todo ponto ligado aqui vale 0 V: é a régua das outras tensões.</p>
      ) : (
        <div className="sel-leitura">
          <div>
            <span>Tensão</span>
            <strong>{ligada && rd ? formatVolts(rd.volts) : '—'}</strong>
          </div>
          <div>
            <span>Corrente</span>
            <strong>{ligada && rd ? formatAmps(rd.amps) : '—'}</strong>
          </div>
        </div>
      )}
      {!ligada && comp.kind !== 'ground' && (
        <p className="card-sub">Ainda solta: ligue os dois terminais com fios para medir.</p>
      )}

      {comp.kind !== 'ground' && comp.kind !== 'switch' && <ValorDaPeca comp={comp} />}

      <div className="actions">
        {comp.kind !== 'ground' && (
          <button type="button" className="ghost" data-hand="insp-rotate" onClick={() => rotate(comp.id)}>
            Girar 90° <kbd>R</kbd>
          </button>
        )}
        <button type="button" className="ghost perigo" data-hand="insp-delete" onClick={removeSelected}>
          Excluir <kbd>Del</kbd>
        </button>
      </div>
    </section>
  );
}

function FioSelecionado({ wire, reading }: { wire: Wire; reading: Reading }) {
  const { removeSelected, select } = useEditor();
  const n = reading.netAt(wire.from);
  const v = n ? reading.nodes.find((x) => x.net === n)?.volts : undefined;
  return (
    <section className="card sel" aria-label="Fio selecionado">
      <div className="sel-top">
        <span className="sel-ico">
          <IcoFio size={22} />
        </span>
        <span className="sel-nome">
          <strong>
            Fio <code>{wire.id}</code>
          </strong>
          <small>um fio ideal: as duas pontas ficam na mesma tensão</small>
        </span>
        <button
          type="button"
          className="ghost sel-x"
          aria-label="Tirar a seleção"
          data-hand="sel-fechar"
          onClick={() => select(null)}
        >
          ×
        </button>
      </div>
      {n && v !== undefined && (
        <div className="sel-leitura">
          <div>
            <span>Nó</span>
            <strong>{n}</strong>
          </div>
          <div>
            <span>Tensão</span>
            <strong>{formatVolts(v)}</strong>
          </div>
        </div>
      )}
      <div className="actions">
        <button type="button" className="ghost perigo" data-hand="insp-delete" onClick={removeSelected}>
          Excluir fio <kbd>Del</kbd>
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Abas                                                                      */
/* ------------------------------------------------------------------------ */

type Aba = 'medir' | 'tarefas' | 'maos' | 'professor';
const ABAS: { id: Aba; nome: string; Ico: typeof IcoMedir }[] = [
  { id: 'medir', nome: 'Medir', Ico: IcoMedir },
  { id: 'tarefas', nome: 'Tarefas', Ico: IcoAlvo },
  { id: 'maos', nome: 'Mãos', Ico: IcoMao },
  { id: 'professor', nome: 'Professor', Ico: IcoPergunta },
];
const CHAVE_ABA = 'handphys.aba';

function abaGuardada(): Aba {
  try {
    const v = localStorage.getItem(CHAVE_ABA);
    if (ABAS.some((a) => a.id === v)) return v as Aba;
  } catch {
    /* armazenamento bloqueado: segue o padrão */
  }
  return 'medir';
}

function Medir({ reading }: { reading: Reading }) {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const teto = reading.maxVolts > 0 ? reading.maxVolts : 0;

  return (
    <>
      {reading.error && (
        <p className="notice error">
          <IcoAlerta size={16} />
          <span>{reading.error}</span>
        </p>
      )}
      {reading.diagnostics.length > 0 && (
        <ul className="notice warn">
          {reading.diagnostics.map((d) => (
            <li key={d}>
              <IcoAlerta size={16} />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}

      {reading.empty && (
        <p className="vazio">
          <IcoMedir size={18} />
          <span>
            Nada montado ainda. Abra um <strong>exemplo</strong> na barra de cima ou pegue uma peça no
            trilho da esquerda — as leituras aparecem aqui na hora.
          </span>
        </p>
      )}

      {reading.comps.length > 0 && (
        <section className="card">
          <h3>
            <IcoMedir size={18} />
            Leituras
          </h3>
          <p className="card-sub">
            <strong>V</strong> é a tensão entre os terminais da peça; <strong>I</strong> é a corrente
            que passa por ela. Clique numa linha para achar a peça no quadro.
          </p>
          <table className="readings">
            <thead>
              <tr>
                <th>Peça</th>
                <th>V</th>
                <th>I</th>
                <th>Nós</th>
              </tr>
            </thead>
            <tbody>
              {reading.comps.map((r) => {
                const comp = doc.comps.find((c) => c.id === r.id);
                const sel = selection?.kind === 'comp' && selection.id === r.id;
                const Ico = KIND_ICON[r.kind];
                return (
                  <tr
                    key={r.id}
                    className={sel ? 'selected' : undefined}
                    data-hand={`linha:${r.id}`}
                    onClick={() => useEditor.getState().select({ kind: 'comp', id: r.id })}
                  >
                    <td>
                      <span className="comp">
                        <Ico size={16} />
                        <span className="comp-nome">
                          <span>
                            <code>{r.id}</code> {KIND_LABEL[r.kind]}
                          </span>
                          <small>{comp ? formatValue(r.kind, comp.value) : '—'}</small>
                        </span>
                      </span>
                    </td>
                    <td className="num">{formatVolts(r.volts)}</td>
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
        </section>
      )}

      {reading.nodes.length > 1 && (
        <section className="card">
          <h3>
            <IcoNo size={18} />
            Tensão em cada nó
            <span className="selo">nó</span>
          </h3>
          <p className="card-sub">
            Quanto vale cada ponto do circuito, comparado com o Terra (o zero). A barrinha mostra a
            proporção de um para o outro.
          </p>
          <ul className="nodes">
            {reading.nodes.map((n) => {
              const pct = teto > 0 ? Math.min(100, (Math.abs(n.volts) / teto) * 100) : 0;
              return (
                <li key={n.net}>
                  <span className="no-nome">{n.net}</span>
                  <span className="no-bar">
                    <i className={n.volts < 0 ? 'neg' : undefined} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="no-v">{formatVolts(n.volts)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Kirchhoff reading={reading} />

      <Rc doc={doc} />
    </>
  );
}

function Tarefas() {
  const challengeId = useEditor((s) => s.challenge);
  const setChallenge = useEditor((s) => s.setChallenge);
  const feitos = useEditor((s) => s.feitos);
  return (
    <section className="card">
      <h3>
        <IcoAlvo size={18} className="quente" />
        Tarefas
        <span className="selo">
          {feitos.length} de {CHALLENGES.length}
        </span>
      </h3>
      <p className="card-sub">
        Escolha uma: a conferência é automática e ao vivo. Enquanto você monta, a dica do próximo passo
        aparece no topo do painel.
      </p>
      <span className="progresso" aria-hidden>
        <i style={{ width: `${(feitos.length / CHALLENGES.length) * 100}%` }} />
      </span>
      <ol className="tarefas">
        {CHALLENGES.map((c) => {
          const ativa = c.id === challengeId;
          const feita = feitos.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`tarefa${ativa ? ' active' : ''}${feita ? ' feita' : ''}`}
                data-hand={`challenge:${c.id}`}
                aria-pressed={ativa}
                onClick={() => setChallenge(ativa ? null : c.id)}
              >
                <span className="tarefa-marca" aria-hidden>
                  {feita ? <IcoOk size={18} /> : null}
                </span>
                <span className="tarefa-txt">
                  <strong>{c.titulo}</strong>
                  <small>{c.enunciado}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Professor() {
  const questao = useEditor((s) => s.questao);
  const setQuestao = useEditor((s) => s.setQuestao);
  return (
    <section className="card questao">
      <h3>
        <IcoPergunta size={18} className="quente" />
        Questão da aula
      </h3>
      <textarea
        className="questao-in"
        data-hand="questao"
        rows={3}
        placeholder="ex.: Quanto mede a corrente em r2?"
        value={questao}
        maxLength={QUESTAO_MAX}
        onChange={(e) => setQuestao(e.target.value)}
      />
      <p className="card-sub">
        Aparece em letra grande na projeção (botão <strong>Espelhar</strong> na barra). Vazia, a
        projeção mostra a tarefa escolhida. {questao.length}/{QUESTAO_MAX}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Tarefa ativa: o veredito SEMPRE à vista, em qualquer aba                  */
/* ------------------------------------------------------------------------ */

function TarefaAtiva({ reading, irPara }: { reading: Reading; irPara: () => void }) {
  const doc = useEditor((s) => s.doc);
  const challengeId = useEditor((s) => s.challenge);
  const setChallenge = useEditor((s) => s.setChallenge);
  const marcarFeito = useEditor((s) => s.marcarFeito);
  const ch = challengeById(challengeId);
  const st = ch ? evaluateChallenge(ch, doc, reading) : null;
  useEffect(() => {
    if (ch && st?.ok) marcarFeito(ch.id);
  }, [ch, st?.ok, marcarFeito]);
  if (!ch || !st) return null;
  return (
    <section className={st.ok ? 'card ativa ok' : 'card ativa'} aria-live="polite">
      <div className="ativa-top">
        <IcoAlvo size={18} className="quente" />
        <button type="button" className="link" data-hand="tarefa-lista" onClick={irPara}>
          {ch.titulo}
        </button>
        <button
          type="button"
          className="ghost sel-x"
          aria-label="Fechar a tarefa"
          title="Fechar a tarefa"
          data-hand="tarefa-fechar"
          onClick={() => setChallenge(null)}
        >
          ×
        </button>
      </div>
      <p className="enunciado">{ch.enunciado}</p>
      <p className={st.ok ? 'veredito ok' : 'veredito'}>
        {st.ok ? (
          <>
            <IcoOk size={16} /> Conseguiu! Circuito aprovado.
          </>
        ) : (
          <>
            <span className="veredito-rot">Próximo passo:</span> {st.dica}
          </>
        )}
      </p>
    </section>
  );
}

/**
 * PAINEL — o lado de leitura da bancada.
 *
 * De cima para baixo, na ordem em que o aluno precisa:
 *   1. a peça/fio SELECIONADO (o que acabou de tocar: leitura e valor);
 *   2. a TAREFA ativa com o veredito (sempre à vista, em qualquer aba);
 *   3. as abas: Medir (tabelas e estações), Tarefas (a lista com progresso),
 *      Mãos (webcam) e Professor (a questão da projeção).
 * Antes era uma coluna só de oito cartões, com a peça selecionada no FIM — a
 * leitura do que se acabou de clicar ficava abaixo de Kirchhoff e do RC.
 *
 * `aberto` só importa no celular (gaveta de baixo, botão "Painel").
 */
export function Inspector({ reading, aberto = true }: { reading: Reading; aberto?: boolean }) {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const canUndo = useEditor((s) => s.past.length > 0);
  const undo = useEditor((s) => s.undo);
  const challengeId = useEditor((s) => s.challenge);
  const chAtivo = challengeById(challengeId);
  const challengeOk = chAtivo ? evaluateChallenge(chAtivo, doc, reading).ok : null;
  const [aba, setAbaRaw] = useState<Aba>(abaGuardada);
  const setAba = (a: Aba) => {
    setAbaRaw(a);
    try {
      localStorage.setItem(CHAVE_ABA, a);
    } catch {
      /* sem armazenamento: só não lembra */
    }
  };

  const comp = selection?.kind === 'comp' ? doc.comps.find((c) => c.id === selection.id) : undefined;
  const wire = selection?.kind === 'wire' ? doc.wires.find((w) => w.id === selection.id) : undefined;

  return (
    <aside className={aberto ? 'inspector aberto' : 'inspector'}>
      <div className="insp-top">
        <div className="insp-titulo">
          <IcoLapis size={20} />
          <h2>Painel</h2>
        </div>
        <button type="button" className="ghost" data-hand="desfazer" onClick={undo} disabled={!canUndo}>
          Desfazer
        </button>
      </div>

      {comp && <PecaSelecionada comp={comp} rd={reading.comps.find((r) => r.id === comp.id)} />}
      {wire && <FioSelecionado wire={wire} reading={reading} />}
      <TarefaAtiva reading={reading} irPara={() => setAba('tarefas')} />

      <nav className="abas" role="tablist" aria-label="Seções do painel">
        {ABAS.map(({ id, nome, Ico }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            className={aba === id ? 'aba active' : 'aba'}
            data-hand={`aba:${id}`}
            onClick={() => setAba(id)}
          >
            <Ico size={16} />
            {nome}
            {id === 'tarefas' && challengeOk === true && <i className="aba-ponto ok" />}
            {id === 'tarefas' && challengeOk === false && <i className="aba-ponto" />}
          </button>
        ))}
      </nav>

      <div role="tabpanel" className="aba-corpo">
        {aba === 'medir' && <Medir reading={reading} />}
        {aba === 'tarefas' && <Tarefas />}
        {aba === 'maos' && <HandsPanel />}
        {aba === 'professor' && <Professor />}
      </div>
    </aside>
  );
}
