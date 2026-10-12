import { useCallback } from 'react';
import { hands, useHandsStatus, type HandFilter } from '../hands/controller';

const FILTERS: HandFilter[] = ['auto', 'right', 'left', 'lock'];
const FILTER_TEXT: Record<HandFilter, string> = {
  auto: 'Qualquer',
  right: 'Direita',
  left: 'Esquerda',
  lock: 'Travar',
};
const FILTER_HINT: Record<HandFilter, string> = {
  auto: 'Qualquer mão vista comanda o cursor e a pinça.',
  right: 'Só a mão DIREITA comanda (o lado sai de um voto entre as últimas amostras, não do rótulo que troca sozinho).',
  left: 'Só a mão ESQUERDA comanda.',
  lock: 'Gruda na mão que estiver em uso e ignora as outras — não precisa acertar direita/esquerda.',
};

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
            Gesto de <strong>pinça</strong>: feche para apertar/arrastar e abrir para soltar — no
            quadro 2D, na bancada 3D e nos botões da tela (a pinça clica neles).{' '}
            <strong>Duas mãos</strong> abrindo e juntando dão zoom só enquanto{' '}
            <strong>Mão que comanda</strong> estiver em <strong>Qualquer</strong> (ou use os
            botões −/%/+ no canto). O esqueleto fica maior quando a mão se aproxima da câmera e a
            cena mostra só o esqueleto, nunca o vídeo. Com a câmera ligada,{' '}
            <strong>Mão que comanda</strong> restringe tudo — cursor, pinça, calibração e zoom — à
            UMA mão escolhida (direita, esquerda ou travar na que estiver em uso): a outra fica
            apagada e não comanda nada.
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
              {st.fps} det/s · {st.latencyMs} ms · {st.delegate} · {st.mode}
            </li>
            <li>
              <span title="Fonte da razão de pinça: 3D usa o eixo Z (coordenadas de mundo, em metros); 2D usa só a imagem da câmera.">
                Pinça em{' '}
                <strong>{st.prof === '3D' ? 'profundidade (3D)' : st.prof === '2D' ? 'só imagem (2D)' : '…'}</strong>
              </span>
            </li>
            <li>
              Comandando:{' '}
              <strong>
                {st.handSide === 'right' ? 'direita' : st.handSide === 'left' ? 'esquerda' : '…'}
              </strong>
              {st.ignored > 0 && (
                <span title="Fora do seletor de uma mão: aparecem apagadas e não comandam nada.">
                  {' · '}
                  {st.ignored} {st.ignored === 1 ? 'mão ignorada' : 'mãos ignoradas'}
                </span>
              )}
            </li>
            <li>
              Limiar da pinça: {st.threshold.toFixed(2)}
              {st.ratio !== null && (
                <>
                  {' '}· razão agora:{' '}
                  <strong className={st.ratio < st.threshold ? 'pinch-on' : undefined}>
                    {st.ratio.toFixed(2)}
                  </strong>
                </>
              )}
            </li>
            {st.cursor && (
              <li>
                Mira em {Math.round(st.cursor.x * 100)}% , {Math.round(st.cursor.y * 100)}%
                {st.mira === 'travada' && (
                  <span title="Dedos fechando: a mira segue só a mão e não escorrega com a pinça">
                    {' '}· trava
                  </span>
                )}
              </li>
            )}
            {st.lastCalib && <li>Última calibração: {st.lastCalib}</li>}
          </ul>
          <div className="hands-filter" role="group" aria-label="Mão que comanda">
            <span>Mão que comanda</span>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={`ghost${st.filter === f ? ' active' : ''}`}
                data-hand={`hand:${f}`}
                title={FILTER_HINT[f]}
                aria-pressed={st.filter === f}
                onClick={() => hands.setFilter(f)}
              >
                {FILTER_TEXT[f]}
              </button>
            ))}
          </div>
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
