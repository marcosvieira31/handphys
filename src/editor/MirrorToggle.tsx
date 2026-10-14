import { useEffect, useMemo, useRef, useState } from 'react';
import { localChannel } from '../mirror/channel';
import type { State } from '../mirror/protocol';
import { mirrorUrl, newRoomCode, openRoom, SALA_LOG, type RoomChannel, type StatusSala } from '../mirror/peer';
import { MirrorTransmitter } from '../mirror/transmitter';
import { makeQr, qrPath } from './qr';
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
    flow: s.flow,
    challenge: s.challenge,
    questao: s.questao,
  };
};

/**
 * Painel do ESPPELHO — quem conduz publica a tela para os outros verem:
 *
 *  - **Espelhar**: transmite na MESMA máquina (BroadcastChannel) — o projetor
 *    ligado no PC do professor, sem internet e sem instalar nada;
 *  - **Sala na rede**: abre uma sala com código curto; quem está em outro
 *    aparelho da rede da escola entra pelo QR e acompanha ao vivo (WebRTC —
 *    os dados andam de aparelho a aparelho, só o pareamento passa pela net).
 *
 * Os dois canais juntos: uma aba da projeção e um celular recebem o mesmo
 * estado ao mesmo tempo, pelo mesmo protocolo.
 */
export function MirrorToggle() {
  const [on, setOn] = useState(false);
  const [cartao, setCartao] = useState(false);
  const [cont, setCont] = useState({ local: 0, rede: 0 });
  const [sala, setSala] = useState<{ code: string; status: StatusSala } | null>(null);
  const redeCanal = useRef<RoomChannel | null>(null);
  const redeTx = useRef<MirrorTransmitter | null>(null);
  const setModal = useEditor((s) => s.setModal);

  // transmissão local (a rota que funciona sempre)
  useEffect(() => {
    if (!on) return;
    const tx = new MirrorTransmitter(localChannel(), readState, (n) =>
      setCont((c) => ({ ...c, local: n })),
    );
    tx.start();
    const para = useEditor.subscribe(() => {
      tx.poke();
      redeTx.current?.poke();
    });
    return () => {
      para();
      tx.stop();
    };
  }, [on]);

  // o cartão tapa a cena: a pinça não pode arrastar componente atrás dele
  useEffect(() => {
    setModal(cartao);
    return () => setModal(false);
  }, [cartao, setModal]);

  useEffect(
    () => () => {
      redeTx.current?.stop();
      redeCanal.current?.close();
    },
    [],
  );

  const abrirSala = async () => {
    setOn(true);
    const codigo = newRoomCode();
    setSala({ code: codigo, status: 'abrindo' });
    try {
      const canal = await openRoom(codigo, (n) => setCont((c) => ({ ...c, rede: n })));
      const tx = new MirrorTransmitter(canal, readState);
      tx.start();
      redeTx.current = tx;
      redeCanal.current = canal;
      setSala({ code: canal.code, status: 'conectado' });
    } catch (e) {
      redeTx.current = null;
      redeCanal.current = null;
      setSala((s) => (s ? { ...s, status: 'erro' } : null));
      setCont((c) => ({ ...c, rede: 0 }));
      console.warn('não abri a sala na rede:', e);
    }
  };

  const encerrarSala = () => {
    redeTx.current?.stop();
    redeTx.current = null;
    redeCanal.current?.close();
    redeCanal.current = null;
    setSala(null);
    setCont((c) => ({ ...c, rede: 0 }));
  };

  const abrirEspelho = () => {
    window.open(new URL('mirror.html', location.href).href, 'handphys-espelho');
  };

  // gancho de depuração (só em dev): a automação lê a sala e o log sem console
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __ed?: Record<string, unknown> };
    w.__ed = { ...(w.__ed ?? {}), sala: sala?.status ?? null, log: SALA_LOG };
  }, [sala]);

  const url = useMemo(() => (sala ? mirrorUrl(sala.code) : ''), [sala]);
  const qr = useMemo(() => (url ? makeQr(url) : null), [url]);
  const telas = cont.local + cont.rede;

  return (
    <>
      <button
        type="button"
        className={on ? 'ghost active' : 'ghost'}
        data-hand="mirror"
        aria-pressed={on}
        title="Transmitir esta tela para a tela de observação (na mesma máquina ou na rede da escola)"
        onClick={() => {
          const novo = !on;
          setOn(novo);
          if (novo) setCartao(true);
          if (!novo) encerrarSala();
        }}
      >
        {on ? `Espelhando${telas > 0 ? ` · ${telas} tela${telas > 1 ? 's' : ''}` : ''}` : 'Espelhar'}
      </button>

      {on && (
        <button
          type="button"
          data-hand="mirror:open"
          title="Abrir a tela de observação numa janela nova (F11 na projeção)"
          onClick={abrirEspelho}
        >
          Abrir espelho
        </button>
      )}

      {on && (
        <button
          type="button"
          className={cartao ? 'ghost active' : 'ghost'}
          data-hand="mirror:room"
          aria-expanded={cartao}
          title="Abrir uma sala para outros aparelhos da rede entrarem"
          onClick={() => setCartao(!cartao)}
        >
          {sala ? `Sala ${sala.code}` : 'Sala na rede'}
        </button>
      )}

      {on && cartao && (
        <div className="share-mask" onClick={() => setCartao(false)}>
          <div
            className="share-card"
            role="dialog"
            aria-modal="true"
            aria-label="Espelho na rede da escola"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Espelho na rede da escola</h2>

            {sala?.status === 'abrindo' ? (
              <p className="hint">abrindo a sala…</p>
            ) : qr ? (
              <div className="share-qr">
                <svg
                  viewBox={`0 0 ${qr.getModuleCount() + 8} ${qr.getModuleCount() + 8}`}
                  role="img"
                  aria-label={`QR da sala ${sala?.code ?? ''}`}
                  shapeRendering="crispEdges"
                >
                  <rect width="100%" height="100%" fill="#fff" />
                  <g transform="translate(4 4)" fill="#111">
                    <path d={qrPath(qr)} />
                  </g>
                </svg>
              </div>
            ) : sala?.status === 'erro' ? (
              <p className="notice error">
                Não abri a sala (sem rede ou servidor de pareamento fora). O espelho na mesma
                máquina continua valendo.
              </p>
            ) : (
              <p className="hint">
                A sala ainda não está aberta — abra para gerar o QR que os outros aparelhos
                escaneiam.
              </p>
            )}

            {sala && <p className="share-code">{sala.code}</p>}

            <p className="hint">
              Quem está em outro aparelho da mesma rede escaneia o QR (ou digita o código em{' '}
              <code>mirror.html?sala=…</code>) e vê esta tela ao vivo. Os dados andam de aparelho a
              aparelho — só o pareamento passa pela internet.
            </p>

            <div className="actions">
              {sala && sala.status !== 'abrindo' ? (
                <button type="button" data-hand="mirror:room-close" onClick={encerrarSala}>
                  Encerrar sala
                </button>
              ) : (
                <button
                  type="button"
                  data-hand="mirror:room-open"
                  disabled={sala?.status === 'abrindo'}
                  onClick={abrirSala}
                >
                  {sala?.status === 'erro' ? 'Tentar de novo' : 'Abrir sala'}
                </button>
              )}
              <button
                type="button"
                className="ghost"
                data-hand="mirror:close"
                onClick={() => setCartao(false)}
              >
                Fechar
              </button>
            </div>

            <p className="hint">
              {telas} tela{telas === 1 ? '' : 's'} acompanhando
              {cont.local > 0 ? ` · ${cont.local} nesta máquina` : ''}
              {cont.rede > 0 ? ` · ${cont.rede} na rede` : ''}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
