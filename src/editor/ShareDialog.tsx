import { useEffect, useMemo, useRef, useState } from 'react';
import { makeQr, qrPath } from './qr';
import { shareLinks, type Destino } from './share';
import { useEditor } from './store';

/**
 * Compartilhar: o circuito vira link (+ QR) para a turma abrir sem montar de
 * novo. Enquanto está aberto a cena fica intocável (`setModal`) — a pinça não
 * pode estar arrastando componente atrás do cartão.
 */
export function ShareDialog() {
  const doc = useEditor((s) => s.doc);
  const setModal = useEditor((s) => s.setModal);
  const [open, setOpen] = useState(false);
  const [destino, setDestino] = useState<Destino>('bancada');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // só calcula enquanto aberto (codificar é barato, mas não é de graça)
  const links = useMemo(() => (open ? shareLinks(doc) : null), [open, doc]);
  const url = links?.[destino] ?? '';
  const qr = useMemo(() => (url ? makeQr(url) : null), [url]);

  useEffect(() => {
    setModal(open);
    return () => setModal(false);
  }, [open, setModal]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // sem API de área de transferência (ou permissão negada): marca tudo p/
      // Ctrl+C à mão e tenta o atalho antigo, que ainda vale em muito PC da escola
      inputRef.current?.select();
      try {
        if (document.execCommand('copy')) setCopied(true);
      } catch {
        /* deixa só selecionado */
      }
    }
  };

  return (
    <>
      <button
        type="button"
        className={open ? 'ghost active' : 'ghost'}
        data-hand="share"
        aria-expanded={open}
        title="Gerar link e QR deste circuito"
        onClick={() => setOpen(!open)}
      >
        Compartilhar
      </button>
      {open && (
        <div className="share-mask" onClick={() => setOpen(false)}>
          <div
            className="share-card"
            role="dialog"
            aria-modal="true"
            aria-label="Compartilhar circuito"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Compartilhar circuito</h2>

            {qr ? (
              <div className="share-qr">
                <svg
                  viewBox={`0 0 ${qr.getModuleCount() + 8} ${qr.getModuleCount() + 8}`}
                  role="img"
                  aria-label="QR code com o link deste circuito"
                  shapeRendering="crispEdges"
                >
                  <rect width="100%" height="100%" fill="#fff" />
                  <g transform="translate(4 4)" fill="#111">
                    <path d={qrPath(qr)} />
                  </g>
                </svg>
              </div>
            ) : (
              <p className="notice error">
                Este circuito grande demais para virar QR — use só o link.
              </p>
            )}

            <span className="seg share-seg" role="group" aria-label="Para onde o link abre">
              <button
                type="button"
                className={destino === 'bancada' ? 'ghost active' : 'ghost'}
                data-hand="share:pc"
                title="Quem abrir no PC monta e edita o circuito"
                onClick={() => setDestino('bancada')}
              >
                PC (bancada)
              </button>
              <button
                type="button"
                className={destino === 'cardboard' ? 'ghost active' : 'ghost'}
                data-hand="share:vr"
                title="Quem abrir no celular vê na bancada 3D, para o viewer"
                onClick={() => setDestino('cardboard')}
              >
                Celular (cardboard)
              </button>
              <button
                type="button"
                className={destino === 'espelho' ? 'ghost active' : 'ghost'}
                data-hand="share:espelho"
                title="Quem abrir no projetor vê o espelho da sala, ao vivo e sem edição"
                onClick={() => setDestino('espelho')}
              >
                Projetor (espelho)
              </button>
            </span>

            <label className="share-url">
              <span>Link do circuito</span>
              <input
                ref={inputRef}
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Link do circuito"
              />
            </label>

            <div className="actions">
              <button type="button" data-hand="share:copy" onClick={copy}>
                {copied ? 'Copiado ✓' : 'Copiar link'}
              </button>
              <button type="button" className="ghost" data-hand="share:close" onClick={() => setOpen(false)}>
                Fechar
              </button>
            </div>

            <p className="hint">
              Aponte a câmera do celular para o QR: a turma abre este circuito pronto, sem
              reconstruir. O link guarda o circuito inteiro — nada sai deste navegador. O
              projetor pode abrir pelo destino <em>Projetor (espelho)</em>: mesma imagem,
              sem edição.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
