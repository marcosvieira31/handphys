import { useEffect, useState } from 'react';
import { readCircuit, type CompKind } from '../core/netlist';
import { challengeById, evaluateChallenge } from '../editor/challenges';
import { formatAmps, formatValue } from '../editor/symbol';
import { Schematic } from '../editor/Schematic';
import { useEditor } from '../editor/store';
import { localChannel } from './channel';
import { MirrorFollower } from './follower';
import type { Msg } from './protocol';
import { joinRoom, roomFromSearch, SALA_LOG, type RoomChannel, type StatusSala } from './peer';

const KIND_LABEL: Record<CompKind, string> = {
  vsource: 'Fonte',
  resistor: 'Resistor',
  capacitor: 'Capacitor',
  lamp: 'Lâmpada',
  switch: 'Chave',
  ground: 'Terra',
};

const STATUS: Record<'esperando' | 'ao-vivo' | 'parado', string> = {
  esperando: 'esperando a tela que monta…',
  'ao-vivo': 'ao vivo',
  parado: 'a tela que monta parou',
};

const REDE: Record<StatusSala, string> = {
  abrindo: 'abrindo…',
  procurando: 'procurando a sala…',
  conectado: 'conectado',
  erro: 'sem rede — só espelho desta máquina',
};

/** Sala pedida na URL (`mirror.html?sala=K7QW3`, o QR do professor). */
const CODIGO = typeof location === 'undefined' ? null : roomFromSearch(location.search);

/**
 * Tela de OBSERVAÇÃO: a mesma imagem de quem conduz, ampliada e sem nada
 * editável — é o que vai na projeção da sala. Recebe o estado pelo espelho
 * (`follower.ts`, local ou da rede) e aplica no MESMO store do editor, com
 * `modal` ligado: aí o Schematic reusa inteiro e fica inert (nada de toque,
 * roda ou clique mexendo no circuito do colega).
 *
 * Se ninguém estiver transmitindo, ela ainda mostra o circuito do link `?c=`
 * que trouxer a página (o mesmo QR do "Compartilhar").
 */
export function Espelho() {
  const doc = useEditor((s) => s.doc);
  const view = useEditor((s) => s.view);
  const placing = useEditor((s) => s.placing);
  const zoom = useEditor((s) => s.zoom);
  const challengeId = useEditor((s) => s.challenge);
  const [status, setStatus] = useState<'esperando' | 'ao-vivo' | 'parado'>('esperando');
  const [statusRede, setStatusRede] = useState<StatusSala | null>(null);
  const reading = readCircuit(doc);
  // O mesmo `check` da tela que monta: mesma tarefa e o MESMO veredito aqui,
  // recalculado em cima do próprio doc — não viaja pelo fio, então não há como
  // a projeção discordar da bancada.
  const ch = challengeById(challengeId);
  const statuso = ch ? evaluateChallenge(ch, doc, reading) : null;

  // Gancho de depuração (só em dev): a automação lê o estado da sala e o log
  // de eventos — em aula ninguém tem o console aberto.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __ed?: Record<string, unknown> };
    w.__ed = { ...(w.__ed ?? {}), sala: statusRede, log: SALA_LOG };
  }, [statusRede]);

  useEffect(() => {
    useEditor.getState().setModal(true); // observar: nunca mexer
    let morto = false;
    let visto = Date.now();
    let canalRede: RoomChannel | null = null;

    const aplicar = (m: Msg) => {
      if (m.kind === 'state') {
        const s = m.state;
        useEditor.setState({
          doc: s.doc,
          view: s.view,
          zoom: s.zoom,
          pan: s.pan,
          selection: s.sel,
          placing: s.placing,
          colorByVoltage: s.colorByVoltage,
          flow: s.flow,
          challenge: s.challenge,
        });
        visto = Date.now();
        setStatus('ao-vivo');
      } else if (m.kind === 'bye') {
        setStatus('parado');
      }
    };

    // rota 1 — mesma máquina (sempre ligada, funciona offline)
    const segLocal = new MirrorFollower(localChannel(), aplicar);
    segLocal.start();

    // rota 2 — rede da escola, quando a página veio com ?sala=
    if (CODIGO) {
      joinRoom(CODIGO, (s) => {
        if (!morto) setStatusRede(s);
      })
        .then((canal) => {
          if (morto) {
            canal.close();
            return;
          }
          canalRede = canal;
          new MirrorFollower(canal, aplicar).start();
        })
        .catch(() => {
          if (!morto) setStatusRede('erro');
        });
    }

    // sem batimento há 4 s, deixa de dizer "ao vivo" (o professor fechou a aba)
    const vigia = window.setInterval(() => {
      if (Date.now() - visto > 4000) setStatus((s) => (s === 'ao-vivo' ? 'esperando' : s));
    }, 1000);

    return () => {
      morto = true;
      window.clearInterval(vigia);
      segLocal.stop();
      canalRede?.close();
    };
  }, []);

  return (
    <div className="espelho">
      <header className="espelho-top">
        <span className={`dot ${status}`} aria-hidden="true" />
        <span className="espelho-status">{STATUS[status]}</span>
        {status === 'ao-vivo' && view === '3d' && (
          <span className="chip warn">quem monta está na vista 3D — aqui vai o quadro 2D</span>
        )}
        {placing && <span className="chip">montando: {KIND_LABEL[placing]}</span>}
        {CODIGO && (
          <span
            className={statusRede === 'conectado' ? 'chip' : 'chip warn'}
            title={`sala ${CODIGO} · ${REDE[statusRede ?? 'procurando']}`}
          >
            {statusRede === 'conectado' ? `sala ${CODIGO}` : REDE[statusRede ?? 'procurando']}
          </span>
        )}
        <span className="espelho-fill" />
        <span className="espelho-cont">
          {doc.comps.length} componentes · {doc.wires.length} fios · {Math.round(zoom * 100)}%
        </span>
      </header>

      <main className="espelho-board">
        <Schematic reading={reading} />
      </main>

      <footer className="espelho-read">
        {ch && statuso && (
          <div className={statuso.ok ? 'espelho-desafio ok' : 'espelho-desafio'}>
            <strong>Desafio: {ch.titulo}</strong>
            <span className="espelho-desafio-enun">{ch.enunciado}</span>
            <span className="espelho-desafio-ver">
              {statuso.ok ? 'conseguiu ✓' : statuso.dica}
            </span>
          </div>
        )}
        {reading.error ? (
          <p className="notice error">{reading.error}</p>
        ) : reading.comps.length === 0 ? (
          <p className="hint">Aguardando o primeiro componente…</p>
        ) : (
          <table className="readings big">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Valor</th>
                <th>V</th>
                <th>I</th>
              </tr>
            </thead>
            <tbody>
              {reading.comps.map((r) => {
                const comp = doc.comps.find((c) => c.id === r.id);
                return (
                  <tr key={r.id}>
                    <td>
                      <code>{r.id}</code> {KIND_LABEL[r.kind]}
                    </td>
                    <td>{comp ? formatValue(r.kind, comp.value) : '—'}</td>
                    <td className="num">{r.volts.toFixed(2)}</td>
                    <td className="num">{formatAmps(r.amps)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </footer>
    </div>
  );
}
