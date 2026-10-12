import { useEffect, useState } from 'react';
import { readCircuit, type CompKind } from '../core/netlist';
import { formatAmps, formatValue } from '../editor/symbol';
import { Schematic } from '../editor/Schematic';
import { useEditor } from '../editor/store';
import { localChannel } from './channel';
import { MirrorFollower } from './follower';

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

/**
 * Tela de OBSERVAÇÃO: a mesma imagem de quem conduz, ampliada e sem nada
 * editável — é o que vai na projeção da sala. Recebe o estado pelo espelho
 * (`mirror.ts`) e aplica no MESMO store do editor, com `modal` ligado: aí o
 * Schematic reusa inteiro e fica inert (nada de toque, roda ou clique mexendo
 * no circuito do colega).
 *
 * Se ninguém estiver transmitindo, ela ainda mostra o circuito do link `?c=`
 * que trouxer a página (o mesmo QR do "Compartilhar").
 */
export function Espelho() {
  const doc = useEditor((s) => s.doc);
  const view = useEditor((s) => s.view);
  const placing = useEditor((s) => s.placing);
  const zoom = useEditor((s) => s.zoom);
  const [status, setStatus] = useState<'esperando' | 'ao-vivo' | 'parado'>('esperando');
  const reading = readCircuit(doc);

  useEffect(() => {
    useEditor.getState().setModal(true); // observar: nunca mexer
    const canal = localChannel();
    let visto = Date.now();

    const seg = new MirrorFollower(canal, (m) => {
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
        });
        visto = Date.now();
        setStatus('ao-vivo');
      } else if (m.kind === 'bye') {
        setStatus('parado');
      }
    });
    seg.start();

    // sem batimento há 4 s, deixa de dizer "ao vivo" (o professor fechou a aba)
    const vigia = window.setInterval(() => {
      if (Date.now() - visto > 4000) setStatus((s) => (s === 'ao-vivo' ? 'esperando' : s));
    }, 1000);

    return () => {
      window.clearInterval(vigia);
      seg.stop();
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
        <span className="espelho-fill" />
        <span className="espelho-cont">
          {doc.comps.length} componentes · {doc.wires.length} fios · {Math.round(zoom * 100)}%
        </span>
      </header>

      <main className="espelho-board">
        <Schematic reading={reading} />
      </main>

      <footer className="espelho-read">
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
