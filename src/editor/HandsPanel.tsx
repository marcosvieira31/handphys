import { useCallback } from 'react';
import { hands, useHandsStatus } from '../hands/controller';

/**
 * Painel das mãos (Fase 2b): liga/desliga a câmera, mostra estado, calibra a
 * pinça e oferece a prévia da câmera RECOLHIDA (privacidade: a cena nunca
 * mostra o vídeo, só o esqueleto).
 */
export function HandsPanel() {
  const st = useHandsStatus(hands);
  // callback ref estável: liga/desliga a prévia quando o <video> monta/desmonta
  // (ele só existe com a câmera ativa — o efeito único da montagem o perdia)
  const setPreview = useCallback((el: HTMLVideoElement | null) => {
    hands.attachPreview(el);
  }, []);

  return (
    <section className="editor-box">
      <h3>Mãos (webcam)</h3>
      {!st.active && !st.starting && (
        <>
          <div className="actions">
            <button type="button" onClick={() => hands.toggle()}>
              Usar as mãos
            </button>
          </div>
          <p className="hint">
            A pinça aperta, move e solta como o mouse — no quadro 2D e na bancada 3D. A cena
            mostra só o esqueleto da mão, nunca o vídeo.
          </p>
        </>
      )}
      {st.starting && <p className="hint">Ligando câmera e modelo…</p>}
      {st.error && <p className="notice error">{st.error}</p>}
      {st.active && (
        <>
          <ul className="hands-status">
            <li>
              Mãos <strong>{st.hands}</strong>
              {st.pinched.length > 0 && (
                <>
                  {' '}· pinça <strong className="pinch-on">{st.pinched.join(', ')}</strong>
                </>
              )}
            </li>
            <li>
              {st.fps} det/s · {st.latencyMs} ms · {st.delegate}
            </li>
            <li>Limiar da pinça: {st.threshold.toFixed(2)}</li>
            {st.lastCalib && <li>Última calibração: {st.lastCalib}</li>}
          </ul>
          {st.calibrating ? (
            <p className="hint">
              Mostre UMA mão para a câmera.{' '}
              {st.calibrating.phase === 'closed' ? (
                <>
                  Feche a pinça e <strong>segure</strong>… {Math.ceil(st.calibrating.leftMs / 1000)} s
                </>
              ) : (
                <>
                  Agora <strong>abra bem</strong> a mão… {Math.ceil(st.calibrating.leftMs / 1000)} s
                </>
              )}
            </p>
          ) : (
            <div className="actions">
              <button type="button" className="ghost" onClick={() => hands.startCalibration()}>
                Calibrar pinça
              </button>
              <button
                type="button"
                className="ghost"
                title="Pinça sensível demais? Sobe o limiar."
                onClick={() => hands.nudgeThreshold(0.05)}
              >
                +
              </button>
              <button
                type="button"
                className="ghost"
                title="Pinça não agarra? Desce o limiar."
                onClick={() => hands.nudgeThreshold(-0.05)}
              >
                −
              </button>
              <button type="button" className="ghost" onClick={() => hands.toggle()}>
                Parar
              </button>
            </div>
          )}
          <details className="camera-preview">
            <summary>Prévia da câmera (só aqui)</summary>
            <video ref={setPreview} className="camera-video" muted playsInline />
            <p className="hint">A imagem não sai desta máquina e nunca aparece na cena.</p>
          </details>
        </>
      )}
    </section>
  );
}
