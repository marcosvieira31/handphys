/**
 * FUNDO DO AR DE BOLSO — o vídeo da câmera atrás da bancada 3D.
 *
 * O "AR de bolso" não é WebXR: é o vídeo da câmera como FUNDO da cena, com a
 * bancada escura fora do caminho e o circuito aparecendo sobre a mesa de
 * verdade. Vale no celular, no tablet e no PC com webcam — inclusive no iPhone,
 * onde não existe WebXR AR. É o que o PLANO chama de "Câmera traseira + mãos".
 *
 * A parte de CIMA é pura (testável sem navegador): de onde vem o vídeo, que
 * restrições pedir e como traduzir a falha da câmera para uma frase de sala de
 * aula. A parte de BAIXO é a única que fala com o navegador.
 *
 * REGRA DE OURO DO REÚSO: com as MÃOS ligadas, o fundo é o MESMO stream do
 * rastreio — a webcam já está aberta e a mão de verdade aparece sobre o
 * circuito. Nesse caso o stream NÃO é nosso: quem ligou (as mãos) é quem
 * desliga, senão a bancada perderia a mira ao sair do AR.
 */

/** De onde veio o vídeo do fundo: do rastreio das mãos, ou aberto aqui. */
export type FonteFundo = 'maos' | 'propria';

/** Um fundo ligado: o stream em uso e de quem ele é. */
export interface FundoLigado {
  stream: MediaStream;
  fonte: FonteFundo;
}

/** Abre uma câmera (injetável: os testes passam uma falsa e nada abre de verdade). */
export type PedirCamera = (r: MediaStreamConstraints) => Promise<MediaStream>;

/**
 * O stream das mãos já serve de fundo? Sim quando existe — e é o melhor caso:
 * a webcam já está aberta (zero permissão a mais) e o que a mão pinça é o que
 * ela vê.
 */
export function fonteDeFundo(streamDasMaos: MediaStream | null): FonteFundo {
  return streamDasMaos ? 'maos' : 'propria';
}

/**
 * O que pedir quando o fundo abre a própria câmera: a TRASEIRA (é ela que
 * aponta para a mesa quando o aluno segura o celular) e uma resolução que
 * aceite 16:9 de celular e 4:3 de webcam sem forçar nada — `ideal`, não
 * `exact`: quem não tem câmera traseira (o PC) cai na que tiver.
 */
export function restricoesFundo(): MediaStreamConstraints {
  return {
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  };
}

/** A falha da câmera em linguagem de aluno (o nome cru do erro não diz nada). */
export function mensagemDeErroCamera(nome: string): string {
  switch (nome) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Câmera bloqueada: permita o acesso no ícone de câmera da barra do navegador e ligue o AR de novo.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Não achei nenhuma câmera neste aparelho.';
    case 'NotReadableError':
      return 'A câmera está ocupada por outro programa (ou por outra aba). Feche-o e tente de novo.';
    case 'AbortError':
      return 'A câmera parou de responder: desconecte e conecte de novo, ou recarregue a página.';
    default:
      return 'Não consegui abrir a câmera.';
  }
}

/**
 * Fecha o fundo — mas só o que é NOSSO. O stream das mãos continua servindo ao
 * rastreio (a mira não pode cair junto com o modo AR).
 */
export function fecharFundo(fundo: FundoLigado | null): void {
  if (!fundo || fundo.fonte !== 'propria') return;
  for (const faixa of fundo.stream.getTracks()) faixa.stop();
}

/**
 * Liga o vídeo de fundo no elemento dado: reaproveita o stream das mãos quando
 * ele existe, senão abre a própria câmera. Devolve de quem é o stream para que
 * quem desligar saiba o que pode soltar.
 */
export async function abrirFundo(
  video: HTMLVideoElement,
  streamDasMaos: MediaStream | null,
  pedir: PedirCamera = (r) => navigator.mediaDevices.getUserMedia(r),
): Promise<FundoLigado> {
  const fonte = fonteDeFundo(streamDasMaos);
  const stream = streamDasMaos ?? (await pedir(restricoesFundo()));
  video.srcObject = stream;
  video.muted = true; // a mesa não vira microfonia na sala
  await video.play().catch(() => {});
  return { stream, fonte };
}
