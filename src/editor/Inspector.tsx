import { useState } from 'react';
import { KIND_HINT, KIND_LABEL } from '../core/kinds';
import type { Placed, Reading } from '../core/netlist';
import { QUESTAO_MAX } from '../mirror/protocol';
import { CHALLENGES, challengeById, evaluateChallenge } from './challenges';
import { HandsPanel } from './HandsPanel';
import { KIND_ICON, IcoAlerta, IcoAlvo, IcoLapis, IcoMedir, IcoNo, IcoOk, IcoPergunta } from './icons';
import { Kirchhoff } from './Kirchhoff';
import { Rc } from './Rc';
import { formatAmps, formatValue } from './symbol';
import { useEditor } from './store';

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
 * PAINEL DE MEDIÇÕES — o lado de leitura da bancada: o que o circuito está
 * fazendo AGORA, na mesma hora em que o aluno mexe.
 *
 * Cada assunto é um cartão com ícone, título em letra de gente e uma linha
 * dizendo para que serve; o nome de prova (1ª/2ª lei de Kirchhoff, τ) fica no
 * selo, ao lado do título, para o aluno reencontrar o termo na prova. O painel
 * e a projeção leem o MESMO `reading` — o que está aqui é o que a turma vê.
 *
 * `aberto` só importa no celular (gaveta de baixo, botão "Medições"); no
 * desktop o painel é coluna e sempre está à vista.
 */
export function Inspector({ reading, aberto = true }: { reading: Reading; aberto?: boolean }) {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const canUndo = useEditor((s) => s.past.length > 0);
  const challengeId = useEditor((s) => s.challenge);
  const setChallenge = useEditor((s) => s.setChallenge);
  const questao = useEditor((s) => s.questao);
  const setQuestao = useEditor((s) => s.setQuestao);
  const { rotate, removeSelected, setValue, toggleSwitch, undo } = useEditor();
  const selected = selection?.kind === 'comp' ? doc.comps.find((c) => c.id === selection.id) : null;
  const ch = challengeById(challengeId);
  const statuso = ch ? evaluateChallenge(ch, doc, reading) : null;

  // o teto da barrinha: a maior tensão da bancada. Sem isso (tudo em 0 V) a
  // barra fica vazia em vez de dividir por zero.
  const teto = reading.maxVolts > 0 ? reading.maxVolts : 0;

  return (
    <aside className={aberto ? 'inspector aberto' : 'inspector'}>
      <div className="insp-top">
        <div className="insp-titulo">
          <IcoMedir size={22} />
          <h2>Medições</h2>
        </div>
        <button type="button" className="ghost" data-hand="desfazer" onClick={undo} disabled={!canUndo}>
          Desfazer
        </button>
      </div>
      <p className="insp-sub">O que o circuito está fazendo agora. Mexa no quadro e os números mudam na hora.</p>

      <section className="card questao">
        <h3>
          <IcoPergunta size={18} className="quente" />
          Questão da aula
        </h3>
        <input
          type="text"
          className="questao-in"
          data-hand="questao"
          placeholder="ex.: Quanto mede a corrente em r2?"
          value={questao}
          maxLength={QUESTAO_MAX}
          onChange={(e) => setQuestao(e.target.value)}
        />
        <p className="card-sub">
          Vai em letra grande na projeção (espelho). Vazia, a projeção mostra a tarefa escolhida abaixo.
        </p>
      </section>

      <section className={statuso?.ok ? 'card challenge ok' : 'card challenge'}>
        <h3>
          <IcoAlvo size={18} className="quente" />
          Tarefa
          {statuso?.ok ? <IcoOk size={18} className="quente" /> : null}
        </h3>
        <div className="challenge-pick">
          {CHALLENGES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={c.id === challengeId ? 'ghost active' : 'ghost'}
              data-hand={`challenge:${c.id}`}
              title={c.enunciado}
              aria-pressed={c.id === challengeId}
              onClick={() => setChallenge(c.id === challengeId ? null : c.id)}
            >
              {c.titulo}
            </button>
          ))}
        </div>
        {ch && statuso ? (
          <>
            <p className="enunciado">{ch.enunciado}</p>
            <p className={statuso.ok ? 'veredito ok' : 'veredito'}>
              {statuso.ok ? 'Circuito aprovado ✓' : statuso.dica}
            </p>
          </>
        ) : (
          <p className="card-sub">Escolha uma tarefa: a conferência é automática e ao vivo.</p>
        )}
      </section>

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
            Nada montado ainda. Puxe um componente do trilho da esquerda para o quadro — as
            leituras aparecem aqui na hora.
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
            <strong>V</strong> é a tensão entre os terminais da peça; <strong>I</strong> é a
            corrente que passa por ela.
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
            Quanto vale cada ponto do circuito, comparado com o Terra (o zero). A barrinha
            mostra a proporção de um para o outro.
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
                  <span className="no-v">{n.volts.toFixed(2)} V</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Kirchhoff reading={reading} />

      <Rc doc={doc} />

      {selected && (
        <section className="card">
          <h3>
            <IcoLapis size={18} />
            Editar <code>{selected.id}</code>
            <span className="selo">{KIND_LABEL[selected.kind]}</span>
          </h3>
          <p className="card-sub">{KIND_HINT[selected.kind]}</p>
          {selected.kind !== 'ground' && (
            <NumberField comp={selected} onCommit={(v) => setValue(selected.id, v)} />
          )}
          {selected.kind === 'switch' && (
            <label className="field row">
              <input
                type="checkbox"
                data-hand="switch-toggle"
                checked={!!selected.closed}
                onChange={() => toggleSwitch(selected.id)}
              />
              <span>Fechada (conduz)</span>
            </label>
          )}
          <div className="actions">
            {selected.kind !== 'ground' && (
              <button type="button" data-hand="insp-rotate" onClick={() => rotate(selected.id)}>
                Girar 90°
              </button>
            )}
            <button type="button" className="ghost" data-hand="insp-delete" onClick={removeSelected}>
              Excluir
            </button>
          </div>
          <p className="hint">
            {selected.kind === 'switch' ? 'Clique na chave (sem arrastar) abre/fecha · ' : null}
            Arraste o componente para mover · <kbd>R</kbd> gira · <kbd>Delete</kbd> exclui
          </p>
        </section>
      )}

      <HandsPanel />
    </aside>
  );
}
