import { useEffect, useState } from 'react';
import { localChannel } from '../mirror/channel';
import type { State } from '../mirror/protocol';
import { MirrorTransmitter } from '../mirror/transmitter';
import { useEditor } from './store';

const readState = (): State => {
  const s = useEditor.getState();
  return {
    doc: s.doc,
    view: s.view,
    zoom: s.zoom,
    pan: s.pan,
    sel: s.selection,
    placing: s.placing,
    colorByVoltage: s.colorByVoltage,
  };
};

/**
 * Botão do ESPPELHO: enquanto estiver ligado, esta tela CONDUZ e as telas de
 * observação (`mirror.html`, na projeção ou na aba do colega) acompanham a
 * mesma imagem ao vivo. "Abrir espelho" janela a tela grande (F11 e o
 * projetor está pronto).
 */
export function MirrorToggle() {
  const [on, setOn] = useState(false);
  const [telas, setTelas] = useState(0);

  useEffect(() => {
    if (!on) return;
    const canal = localChannel();
    const tx = new MirrorTransmitter(canal, readState, setTelas);
    tx.start();
    const acompanha = useEditor.subscribe(() => tx.poke());
    return () => {
      acompanha();
      tx.stop();
    };
  }, [on]);

  const abrir = () => {
    window.open(new URL('mirror.html', location.href).href, 'handphys-espelho');
  };

  return (
    <>
      <button
        type="button"
        className={on ? 'ghost active' : 'ghost'}
        data-hand="mirror"
        aria-pressed={on}
        title="Transmitir esta tela para a tela de observação (mesma máquina, sem internet)"
        onClick={() => setOn(!on)}
      >
        {on ? `Espelhando${telas > 0 ? ` · ${telas} tela${telas > 1 ? 's' : ''}` : ''}` : 'Espelhar'}
      </button>
      {on && (
        <button
          type="button"
          className="ghost"
          data-hand="mirror:open"
          title="Abrir a tela de observação numa janela nova (F11 na projeção)"
          onClick={abrir}
        >
          Abrir espelho
        </button>
      )}
    </>
  );
}
