import { useEffect, useRef, useState } from 'react';
import { abrirFundo, fecharFundo, mensagemDeErroCamera, type FundoLigado } from '../ar/fundo';
import { hands, useHandsStatus } from '../hands/controller';

/**
 * CAMADA DO AR DE BOLSO — o vídeo da câmera atrás do canvas 3D.
 *
 * O canvas fica transparente (quem cuida disso é o `setAr` da cena) e esta
 * camada põe o vídeo atrás dele: a bancada escura some e o circuito passa a
 * aparecer sobre a mesa de verdade. É o contrário da camada das mãos, que
 * NUNCA mostra o vídeo (privacidade): aqui a câmera é a intenção — e por isso
 * só liga com clique explícito e desliga ao sair da bancada 3D (o efeito da
 * camada morre junto com a vista, soltando a câmera).
 *
 * A FONTE do vídeo depende das mãos: ligadas, o fundo é o MESMO stream do
 * rastreio (uma câmera só, zero permissão a mais, e a mão de verdade aparece
 * sobre o circuito); desligadas, abre-se a câmera de trás. Quando as mãos
 * mudam — ou quando elas TROCAM de câmera por causa do AR (frontal ⇄ de trás)
 * — o efeito roda de novo e reusa o stream novo; e aí só fecha o que é nosso.
 */
export function ArLayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  // `camera` entra como dependência: as mãos podem trocar de câmera (o AR liga
  // com elas já ligadas na frontal) e este vídeo tem de passar a mostrar o novo
  // stream — o das mãos, que é quem manda aqui.
  const { active: maosAtivas, camera } = useHandsStatus(hands);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let vivo = true;
    let fundo: FundoLigado | null = null;
    setErro(null);

    void (async () => {
      try {
        const ligado = await abrirFundo(video, hands.streamDasMaos);
        if (!vivo) {
          fecharFundo(ligado); // saiu do AR antes de a câmera responder
          return;
        }
        fundo = ligado;
      } catch (err) {
        if (!vivo) return;
        setErro(mensagemDeErroCamera(err instanceof DOMException ? err.name : ''));
      }
    })();

    return () => {
      vivo = false;
      video.srcObject = null;
      fecharFundo(fundo); // só a câmera que é NOSSA: a das mãos continua na mira
    };
  }, [maosAtivas, camera]);

  return (
    <>
      <video ref={videoRef} className="ar-video" aria-hidden muted playsInline autoPlay />
      {erro ? (
        <p className="ar-aviso" role="alert">
          {erro}
        </p>
      ) : (
        <p className="ar-dica">aponte a câmera para a mesa</p>
      )}
    </>
  );
}
