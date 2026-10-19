import { useSyncExternalStore } from 'react';
import { liberarCameraDoFundo, mensagemDeErroCamera } from '../ar/fundo';
import { arAtual, assinarAr } from '../editor/ar';
import { applyPan, applyRoll, applyZoom } from '../editor/zoom';
import { clientToBoard, miraOverTrash } from '../editor/coords';
import { useEditor } from '../editor/store';
import { Clutch } from './clutch';
import { OneEuroFilter } from './oneEuro';
import { PinchTracker } from './pinch';
import { SideVote, type HandSide } from './side';
import {
  HandTracker,
  pinchRatio2D,
  pinchRatio3D,
  type FrameHand,
  type LadoCamera,
  type Pt3,
} from './tracker';

/** Seletor de UMA mão: quem comanda o cursor, a pinça e a calibração. */
export type HandFilter = 'auto' | 'right' | 'left' | 'lock';

/**
 * De onde vem a câmera das mãos: 'auto' segue o AR (ligado = a de trás, a
 * mesa; desligado = a frontal) e as outras duas forçam um lado. Serve para o
 * aparelho em que a regra automática não é a certa — celular preso num suporte
 * apontado para a mesa com o AR desligado, tablet com duas câmeras, PC em que
 * o rótulo "frontal/traseira" não quer dizer nada.
 */
export type EscolhaCamera = 'auto' | 'frontal' | 'traseira';

export interface HandPoint {
  x: number;
  y: number;
}

export interface DrawHand {
  side: string;
  /** Pontos suavizados, normalizados e JÁ na tela (prontos para desenhar). */
  pts: HandPoint[];
  pinched: boolean;
  /** true = esta mão é a que fornece a mira (o esqueleto é ancorado nela). */
  cursor: boolean;
  /**
   * Tamanho aparente da mão (pulso→metacarpal do meio, em fração da imagem):
   * é a PROFUNDIDADE que sobra na webcam (ela não mede distância, mede
   * aparencia). Mão perto do celular => número grande; longe => pequeno.
   */
  size: number;
  /** false = o seletor de UMA mão está ignorando esta (ela aparece apagada). */
  used: boolean;
}

export interface DrawCursor {
  x: number;
  y: number;
  /** true = pinça fechada (agarrando); false = mão aberta (só pairando). */
  active: boolean;
}

export interface HandsStatus {
  active: boolean;
  starting: boolean;
  hands: number;
  pinched: string[];
  /**
   * Qual câmera está alimentando o rastreio: com o AR ligado é a de TRÁS (a
   * mesa, a mesma do vídeo de fundo); sem AR é a frontal. O painel mostra isso
   * e a camada do AR reage a mudanças (o fundo passa a ser o stream novo).
   */
  camera: LadoCamera;
  /** O que o aluno ESCOLHEU: 'auto' = a regra do AR; ou frontal/traseira fixa. */
  cameraEscolha: EscolhaCamera;
  /**
   * Quantas largadas de câmera já TERMINARAM (ligou ou falhou). É o sinal que a
   * camada do AR usa para reabrir a câmera dela quando a largada das mãos não
   * deu certo: enquanto as mãos estão LIGANDO o contador não muda (o fundo fica
   * quieto, com a câmera devolvida), e quando o desfecho sai ele muda — se as
   * mãos não vieram, a mesa volta sozinha.
   */
  tentativa: number;
  /** Razão polegar–indicador da mão piloto (para diagnóstico em aula). */
  ratio: number | null;
  /** Cursor da mão piloto (0..1, já pronto para a tela). */
  cursor: HandPoint | null;
  /** 'travada' = mira congelada na palma (dedos fechando não deslocam o ponto). */
  mira: 'livre' | 'travada';
  /**
   * Fonte da razão de pinça: '3D' = coordenadas de MUNDO (tem o eixo Z, em
   * metros — estável com as pontas se tocando); '2D' = só a imagem da câmera.
   */
  prof: '3D' | '2D' | '–';
  /** Posição do seletor de UMA mão (quem comanda). */
  filter: HandFilter;
  /** Lado da mão que está comandando agora (para o professor conferir). */
  handSide: HandSide | '–';
  /** Quantas mãos detectadas o seletor está ignorando. */
  ignored: number;
  /** 'rVFC' = no ritmo do vídeo; 'rAF' = laço de reserva (iOS). */
  mode: 'rVFC' | 'rAF' | '–';
  fps: number;
  latencyMs: number;
  delegate: string;
  threshold: number;
  lastCalib: string | null;
  error: string | null;
  calibrating: { phase: 'closed' | 'open'; leftMs: number } | null;
}

const LS_KEY = 'handphys.pinchThreshold';
const LS_FILTER = 'handphys.handFilter';
const LS_CAMERA = 'handphys.handCamera';
const CALIB_MS = 2500;
/** Depois disto, uma largada com stream e sem quadro é dada por travada. */
const LARGADA_MS = 5000;
/** Pulso→metacarpal do meio, em fração da imagem, com a mão a ~40 cm da câmera. */
const HAND_REF = 0.2;

function loadFilter(): HandFilter {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_FILTER) : null;
    if (raw === 'right' || raw === 'left' || raw === 'lock') return raw;
  } catch {
    /* sem storage: qualquer mão comanda */
  }
  return 'auto';
}

function loadEscolhaCamera(): EscolhaCamera {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_CAMERA) : null;
    if (raw === 'frontal' || raw === 'traseira') return raw;
  } catch {
    /* sem storage: segue o AR */
  }
  return 'auto';
}

function loadThreshold(): number {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    const v = raw === null ? NaN : Number(raw);
    if (Number.isFinite(v) && v >= 0.2 && v <= 0.8) return v;
  } catch {
    /* sem storage: usa o medido no spike */
  }
  return 0.45;
}

/**
 * Que câmera as MÃOS devem usar: com o AR ligado é a de TRÁS — a que aponta
 * para a mesa, a MESMA do vídeo de fundo. Assim o aluno manipula com as mãos
 * sobre a mesa o circuito que está vendo, e só existe uma câmera aberta. Sem
 * AR volta para a frontal, que enxerga quem está na frente da tela.
 *
 * A escolha do aluno (o painel das mãos) manda por cima da regra quando não é
 * 'auto' — é o desempate de quem tem o aparelho numa posição fora do comum.
 */
export function cameraDasMaos(ar: boolean, escolha: EscolhaCamera = 'auto'): LadoCamera {
  if (escolha !== 'auto') return escolha;
  return ar ? 'traseira' : 'frontal';
}

/**
 * Onde cai o ponto (u,v) do QUADRO do vídeo quando ele é desenhado com
 * `object-fit: cover` numa caixa da tela (é assim que o fundo do AR aparece).
 * O cover estica a imagem até cobrir a caixa e CORTA o que sobra: a sobra vira
 * metade de cada lado, isto é, um deslocamento negativo. Sem isso, com a câmera
 * de trás a mira e a mão de verdade andariam em lugares diferentes na tela.
 */
export function pontoNaTela(
  u: number,
  v: number,
  quadro: { w: number; h: number },
  caixa: { x: number; y: number; w: number; h: number },
): HandPoint {
  if (quadro.w <= 0 || quadro.h <= 0 || caixa.w <= 0 || caixa.h <= 0) {
    return { x: caixa.x + u * caixa.w, y: caixa.y + v * caixa.h };
  }
  const escala = Math.max(caixa.w / quadro.w, caixa.h / quadro.h);
  const sobraX = (caixa.w - quadro.w * escala) / 2;
  const sobraY = (caixa.h - quadro.h * escala) / 2;
  return {
    x: caixa.x + sobraX + u * quadro.w * escala,
    y: caixa.y + sobraY + v * quadro.h * escala,
  };
}

/** A caixa do vídeo do AR na tela — só existe com a bancada 3D em AR montada. */
function caixaDoVideoAr(): { x: number; y: number; w: number; h: number; quadro: { w: number; h: number } } | null {
  if (typeof document === 'undefined' || !document.querySelector) return null;
  const el = document.querySelector<HTMLVideoElement>('video.ar-video');
  if (!el || !el.videoWidth || !el.videoHeight) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height, quadro: { w: el.videoWidth, h: el.videoHeight } };
}

/**
 * Adapter mãos => store: a pinça aperta/move/solta as MESMAS ações do mouse
 * (pressAt/moveAt/releaseAt). Sem vídeo sobre a cena (privacidade): a camada
 * desenha só o esqueleto. Testável sem câmera via `ingest`.
 */
export type LocateFn = (cursor: HandPoint) => { x: number; y: number } | null;

/** Uma mão já identificada e suavizada (uma linha do `ingest`). */
interface SeenHand {
  sm: HandPoint[];
  fast: HandPoint[];
  /** Pontos prontos para a TELA (espelho da frontal, recorte do fundo do AR). */
  mir: HandPoint[];
  pinched: boolean;
  edge: 'down' | 'up' | null;
  label: string;
  ratio: number;
  /** Tamanho aparente (pulso→metacarpal) — é a "profundidade" da webcam. */
  size: number;
  /** true = o modelo entregou coordenadas de mundo (a pinça tem o eixo Z). */
  hasWorld: boolean;
  /** Lado VOTADO desta mão (direita/esquerda) — o rótulo cru oscila. */
  handSide: HandSide;
}

export class HandsController {
  private tracker = new HandTracker();
  /** Miras por vista ("3d" antes de "2d"): só uma vista está montada por vez. */
  private locators = new Map<string, LocateFn>();
  private pinch = new PinchTracker({ threshold: loadThreshold() });
  /** Suavização LENTA (razão de pinça estável) e RÁPIDA (cursor sem lag), por mão. */
  private slowFilters = new Map<string, { x: OneEuroFilter[]; y: OneEuroFilter[] }>();
  private fastFilters = new Map<string, { x: OneEuroFilter[]; y: OneEuroFilter[] }>();
  /** Coordenadas de MUNDO (x,y,z em METROS) suavizadas: alimentam a razão 3D. */
  private worldFilters = new Map<
    string,
    { x: OneEuroFilter[]; y: OneEuroFilter[]; z: OneEuroFilter[] }
  >();
  /** Estado do gesto das DUAS mãos no quadro anterior: zoom (distância),
   *  enquadramento (meio) e giro de Z (ângulo da linha entre as mãos). */
  private spread: {
    ids: [string, string];
    dist: number;
    mid: HandPoint;
    ang: number;
  } | null = null;
  /** Identidade estável: o classificador troca Left/Right; o centroide, não. */
  private slots = new Map<string, { x: number; y: number; lastSeen: number }>();
  private slotSeq = 0;
  private lastCell = new Map<string, { x: number; y: number }>();
  private pressed = new Set<string>();
  /** Posição da mira (fração de tela) do quadro anterior quando o aperto-vazio
   *  virou PAN: em px, porque a célula mudaria sozinha com a vista andando. */
  private panPrev: { x: number; y: number } | null = null;
  private driver: string | null = null;
  /** Trava de mira da mão piloto (a mira não escorrega quando os dedos convergem). */
  private clutch = new Clutch();
  private clutchId: string | null = null;
  /** Seletor de UMA mão: o lado vem de VOTO (o rótulo do modelo oscila). */
  private sideVote = new SideVote();
  private filter: HandFilter = loadFilter();
  /** No modo 'lock': o id estável da mão grudada (some => gruda na próxima). */
  private lockedId: string | null = null;
  private hiddenVideo: HTMLVideoElement | null = null;
  private previewVideo: HTMLVideoElement | null = null;
  /** A câmera que o aluno escolheu no painel (persiste): 'auto' segue o AR. */
  private escolhaCamera: EscolhaCamera = loadEscolhaCamera();
  /**
   * A câmera que as mãos DEVEM usar agora (o AR ou a escolha do aluno). Ela só
   * muda com uma sessão viva por `sincronizarCamera`, que troca o stream na hora.
   */
  private usaTraseira = cameraDasMaos(arAtual(), this.escolhaCamera) === 'traseira';
  private listeners = new Set<() => void>();
  private draw: { hands: DrawHand[]; cursor: DrawCursor | null } = { hands: [], cursor: null };
  private status: HandsStatus = {
    active: false,
    starting: false,
    hands: 0,
    pinched: [],
    camera: cameraDasMaos(arAtual(), this.escolhaCamera),
    cameraEscolha: this.escolhaCamera,
    tentativa: 0,
    ratio: null,
    cursor: null,
    mira: 'livre',
    prof: '–',
    filter: loadFilter(),
    handSide: '–',
    ignored: 0,
    mode: '–',
    fps: 0,
    latencyMs: 0,
    delegate: '–',
    threshold: loadThreshold(),
    lastCalib: null,
    error: null,
    calibrating: null,
  };
  private frames = 0;
  private fpsAt = 0;
  private latSum = 0;
  private latN = 0;
  private lastNotify = 0;
  private calib: { phase: 'closed' | 'open'; until: number; startMark: number; samples: number[] } | null = null;

  // ---- React ----
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): HandsStatus => this.status;

  private setStatus(patch: Partial<HandsStatus>, force = false) {
    this.status = { ...this.status, ...patch };
    const now = performance.now();
    if (force || now - this.lastNotify > 250) {
      this.lastNotify = now;
      this.listeners.forEach((fn) => fn());
    }
  }

  // ---- ciclo de vida ----
  constructor() {
    // A câmera das mãos segue o AR: ligado, a mão que comanda é a da MESA (a
    // mesma câmera do vídeo de fundo); desligado, volta a frontal. O ouvinte
    // vive junto com o módulo (uma instância: `hands`).
    assinarAr(() => {
      void this.sincronizarCamera();
    });
  }

  /**
   * Alinha a câmera das mãos com o que elas devem usar agora (o AR ligado/
   * desligado ou a escolha do aluno). Com sessão viva troca o stream na hora,
   * sem derrubar o modelo nem o laço de quadros; sem sessão só guarda a
   * escolha — a próxima já nasce na câmera certa.
   */
  async sincronizarCamera(): Promise<void> {
    const traseira = cameraDasMaos(arAtual(), this.escolhaCamera) === 'traseira';
    if (traseira === this.usaTraseira) {
      this.setStatus({ camera: this.ladoUsado }, true); // só o painel mudou de texto
      return;
    }
    const antes = this.usaTraseira;
    this.usaTraseira = traseira;
    const video = this.hiddenVideo;
    if (!this.status.active || !video) {
      this.setStatus({ camera: this.ladoUsado }, true);
      return;
    }
    this.esqueceMaos(); // a imagem que vem agora é OUTRA: nada fica agarrado
    try {
      // no celular não cabem duas câmeras abertas: quem tem a antiga devolve
      liberarCameraDoFundo();
      await this.tracker.trocarCamera(video, traseira);
      if (this.previewVideo) {
        this.previewVideo.srcObject = this.tracker.getStream();
        this.previewVideo.play().catch(() => {});
      }
      this.setStatus(
        { camera: this.ladoUsado, hands: 0, pinched: [], calibrating: null, error: null },
        true,
      );
      this.vigiaDeQuadros(); // o veredito da câmera antiga não vale para a nova
    } catch (err) {
      // ficar na câmera errada é melhor do que perder a mira no meio da aula —
      // mas se nem a antiga sobrou (o aparelho não devolveu nenhuma), a sessão
      // acaba com a frase de sala de aula em vez de um painel mentindo "ativa"
      this.usaTraseira = antes;
      if (this.tracker.running === false) {
        this.setStatus(
          {
            active: false,
            starting: false,
            hands: 0,
            pinched: [],
            calibrating: null,
            camera: this.ladoUsado,
            error: mensagemDeErroCamera(err instanceof DOMException ? err.name : ''),
          },
          true,
        );
        return;
      }
      this.setStatus(
        {
          camera: this.ladoUsado,
          hands: 0,
          pinched: [],
          calibrating: null,
          error: mensagemDeErroCamera(err instanceof DOMException ? err.name : ''),
        },
        true,
      );
    }
  }

  /** A câmera usada agora, para o painel e o status. */
  private get ladoUsado(): LadoCamera {
    return this.usaTraseira ? 'traseira' : 'frontal';
  }

  /**
   * O aluno escolhe a câmera das mãos no painel. 'auto' volta à regra do AR;
   * 'frontal'/'traseira' fixam um lado (persiste, como o limiar e o seletor de
   * mão). Com sessão viva a troca acontece na hora.
   */
  setCameraEscolha(e: EscolhaCamera) {
    if (e === this.escolhaCamera) return;
    this.escolhaCamera = e;
    try {
      localStorage.setItem(LS_CAMERA, e);
    } catch {
      /* sem storage */
    }
    this.setStatus({ cameraEscolha: e, error: null }, true);
    void this.sincronizarCamera();
  }

  /** Solta apertos e esquece as mãos vistas (a imagem que chega agora é outra). */
  private esqueceMaos(): void {
    const s = useEditor.getState();
    s.cancelDraft();
    s.releaseGrip();
    this.pinch.reset();
    this.slowFilters.clear();
    this.fastFilters.clear();
    this.worldFilters.clear();
    this.sideVote.clear();
    this.spread = null;
    this.lockedId = null;
    this.slots.clear();
    this.lastCell.clear();
    this.pressed.clear();
    this.driver = null;
    this.clutch.reset();
    this.clutchId = null;
    this.calib = null;
    this.draw = { hands: [], cursor: null };
  }

  /** Uma vista (2d/3d) registra como transformar cursor em célula + vídeo. */
  bindSlot(name: string, locate: LocateFn | null, video?: HTMLVideoElement) {
    if (locate) this.locators.set(name, locate);
    else this.locators.delete(name);
    if (video) this.hiddenVideo = video;
  }

  unbindSlot(name: string) {
    this.locators.delete(name);
    if (name === '2d') {
      this.stop();
      this.hiddenVideo = null;
      this.previewVideo = null;
    }
  }

  /** Prévia opcional (recolhida por padrão): mostra a câmera SÓ ali, nunca na cena. */
  attachPreview(video: HTMLVideoElement | null) {
    this.previewVideo = video;
    if (video) {
      video.muted = true;
      const stream = this.tracker.getStream();
      if (stream) {
        video.srcObject = stream;
        video.play().catch(() => {});
      }
    }
  }

  async toggle(): Promise<void> {
    if (this.status.active || this.status.starting) {
      this.stop();
      return;
    }
    if (!this.hiddenVideo) {
      this.setStatus({ error: 'Camada das mãos não montada.' }, true);
      return;
    }
    this.setStatus({ starting: true, error: null }, true);
    this.vigiaDaLargada();
    try {
      // o AR de bolso pode estar com a câmera de trás na mão (o vídeo de fundo
      // sem as mãos): no celular não cabem duas abertas, então ela é devolvida
      // antes do pedido — a camada do AR reusa o stream assim que ele existe
      liberarCameraDoFundo();
      await this.tracker.start(
        this.hiddenVideo,
        {
          onFrame: (hands, stats) => this.ingest(hands, stats.latencyMs, performance.now()),
          onVideoTick: () => {
            this.frames += 1;
          },
        },
        this.usaTraseira,
      );
      if (this.previewVideo && this.tracker.getStream()) {
        this.previewVideo.srcObject = this.tracker.getStream();
        this.previewVideo.play().catch(() => {});
      }
      this.fpsAt = performance.now();
      this.setStatus(
        {
          active: true,
          starting: false,
          delegate: this.tracker.gpuDelegate,
          camera: this.ladoUsado,
          error: null,
          tentativa: this.status.tentativa + 1,
        },
        true,
      );
      this.vigiaDeQuadros();
    } catch (err) {
      // um `stop()` no meio da largada (troca de vista, "Parar") não é falha de
      // câmera: o estado já foi desfeito — só o contador anda, para o AR saber
      // que pode reabrir a câmera dele
      if (!this.status.starting && !this.status.active) {
        this.setStatus({ tentativa: this.status.tentativa + 1 }, true);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus(
        {
          starting: false,
          tentativa: this.status.tentativa + 1, // o AR pode reabrir a câmera dele
          error: /denied|permission|not allowed/i.test(msg)
            ? 'Câmera negada: permita o acesso e tente de novo.'
            : /https|secure/i.test(msg)
              ? 'Câmera exige HTTPS ou localhost.'
              : `Falha na câmera: ${msg}`,
        },
        true,
      );
    }
  }

  /**
   * Vigia da LARGADA: câmera que responde mas não começa a transmitir (o vídeo
   * nunca sai do `play()`, quadro que não chega) deixaria o painel em "Ligando
   * câmera e modelo…" para sempre — e o fundo do AR esperando uma câmera que
   * não vem. Aqui a sessão é desfeita com uma frase que diz o que fazer.
   *
   * Só desfaz quando o stream JÁ chegou: antes disso o que está na tela é o
   * pedido de permissão do navegador, e o aluno pode levar o tempo que quiser
   * (por isso o vigia se re-arma enquanto não houver stream).
   */
  private vigiaDaLargada(): void {
    if (typeof window === 'undefined') return; // em node (testes) não há relógio de tela
    window.setTimeout(() => {
      if (!this.status.starting) return; // largoou (ou já foi desfeita) no caminho
      if (!this.tracker.getStream()) {
        this.vigiaDaLargada(); // ainda é o pedido de permissão: espera mais
        return;
      }
      this.tracker.stop();
      this.setStatus(
        {
          starting: false,
          active: false,
          tentativa: this.status.tentativa + 1,
          error: 'A câmera não começou a transmitir: toque em "Usar as mãos" de novo.',
        },
        true,
      );
    }, LARGADA_MS);
  }

  /**
   * Vigia de prontidão: se a câmera não entregar quadros em 2,5 s (vídeo
   * pausado, permissão estranha, elemento oculto), avisa em vez de ficar mudo.
   * Vale na largada e DEPOIS de cada troca de câmera — a imagem que chega é
   * outra, e o veredito da antiga não serve para ela.
   */
  private vigiaDeQuadros(): void {
    if (typeof window === 'undefined') return; // em node (testes) não há relógio de tela
    this.frames = 0;
    window.setTimeout(() => {
      if (this.status.active && this.frames === 0) {
        this.setStatus(
          { error: 'A câmera não está entregando quadros: verifique a permissão e recarregue.' },
          true,
        );
      }
    }, 2500);
  }

  stop() {
    // solta tudo que a mão segurava (sem fio preso nem arraste fantasma)
    this.esqueceMaos();
    this.tracker.stop();
    if (this.previewVideo) this.previewVideo.srcObject = null;
    this.setStatus(
      { active: false, starting: false, hands: 0, pinched: [], fps: 0, calibrating: null },
      true,
    );
  }

  get active(): boolean {
    return this.status.active;
  }

  /**
   * O stream da webcam que está alimentando o rastreio, para o AR de bolso
   * reusar como FUNDO da cena: uma câmera só, zero permissão a mais — e o que a
   * mão vê é o que ela pinça. Devolve null quando as mãos estão desligadas (aí
   * quem quiser fundo abre a própria câmera; o stream NÃO é nosso para fechar).
   */
  get streamDasMaos(): MediaStream | null {
    return this.active ? this.tracker.getStream() : null;
  }

  /** Ajuste fino manual do limiar (±, persiste): para quando a auto-calibração erra. */
  nudgeThreshold(delta: number) {
    const thr = Math.min(0.8, Math.max(0.2, Math.round((this.status.threshold + delta) * 100) / 100));
    if (thr === this.status.threshold) return;
    this.releaseAllPressed();
    this.pinch = new PinchTracker({ threshold: thr });
    try {
      localStorage.setItem(LS_KEY, String(thr));
    } catch {
      /* sem storage */
    }
    this.setStatus({ threshold: thr, lastCalib: `ajuste manual: ${thr.toFixed(2)}` }, true);
  }

  /** Seletor de UMA mão: qual delas comanda cursor, pinça e calibração.
   *  'auto' = qualquer uma; 'right'/'left' = só aquela (lado por voto, porque o
   *  rótulo do modelo troca sozinho); 'lock' = gruda na que estiver em uso e
   *  esquece direita/esquerda. Persiste (localStorage) como o limiar. */
  setFilter(f: HandFilter) {
    if (f === this.filter) return;
    this.releaseAllPressed(); // mão que estava agarrando não pode ficar presa
    this.filter = f;
    this.lockedId = null; // no modo travar, gruda na próxima que aparecer
    this.spread = null; // gesto de zoom das duas mãos recomeça do zero
    try {
      localStorage.setItem(LS_FILTER, f);
    } catch {
      /* sem storage */
    }
    this.setStatus({ filter: f, handSide: '–', ignored: 0 }, true);
  }

  /** Esta mão obedece ao seletor? (separa, no ingest, quem comanda de quem não) */
  private useHand(id: string, seen: Map<string, SeenHand>): boolean {
    if (this.filter === 'auto') return true;
    if (this.filter === 'lock') return this.lockedId === null || this.lockedId === id;
    return seen.get(id)?.handSide === this.filter;
  }

  /** Solta no store todo aperto vindo da mão (troca de limiar, calibração, sumiço). */
  private releaseAllPressed() {
    const st = useEditor.getState();
    for (const side of [...this.pressed]) {
      const last = this.lastCell.get(side);
      if (last) st.releaseAt(last);
    }
    this.pressed.clear();
    this.lastCell.clear();
    this.driver = null;
    this.clutch.reset();
    this.clutchId = null;
  }

  // ---- calibração: 2,5 s fechada + 2,5 s aberta; limiar = meio do caminho ----
  startCalibration() {
    if (this.calib) return;
    // solta apertos em curso para a amostragem começar limpa
    const st = useEditor.getState();
    st.cancelDraft();
    st.releaseGrip();
    this.pressed.clear();
    this.driver = null;
    this.clutch.reset();
    this.clutchId = null;
    // `until` arma no primeiro quadro (usa o mesmo relógio do ingest)
    this.calib = { phase: 'closed', until: 0, startMark: 0, samples: [] };
    this.setStatus({ calibrating: { phase: 'closed', leftMs: CALIB_MS }, error: null }, true);
  }

  // ---- núcleo (chamado pelo tracker; público para teste sem câmera) ----
  ingest(hands: FrameHand[], latencyMs: number, now: number) {
    this.latSum += latencyMs;
    this.latN += 1;
    if (now - this.fpsAt >= 1000) {
      this.setStatus({
        fps: this.frames,
        latencyMs: this.latN ? Math.round(this.latSum / this.latN) : 0,
      });
      this.frames = 0;
      this.fpsAt = now;
      this.latSum = 0;
      this.latN = 0;
    }

    // 1) identidade estável por centroide (a etiqueta Left/Right oscila e
    // teleportava o cursor) + suavização dupla: lenta p/ a razão, rápida p/ o cursor
    const t = now / 1000;
    const seen = new Map<string, SeenHand>();
    for (const h of hands) {
      const id = this.stableId(h, now);
      const sm = this.smooth(this.slowFilters, id, h.pts, t, {});
      const fast = this.smooth(this.fastFilters, id, h.pts, t, { minCutoff: 2.5, beta: 0.07 });
      // razão de pinça: com o eixo Z quando existe (coordenadas de mundo, em
      // metros) — é o que não mente quando uma ponta some atrás da outra na
      // imagem. Suavizamos os dois caminhos; sem isso a razão 3D treme no ponto
      // de contato e a pinça "fisga" no meio do gesto.
      const hasWorld = !!h.world;
      const world = h.world ? this.smoothWorld(id, h.world, t) : null;
      const ratio = world ? pinchRatio3D(world) : pinchRatio2D(sm);
      const { pinched, edge } = this.pinch.update(id, ratio, now);
      const wrist = sm[0] ?? { x: 0.5, y: 0.5 };
      const mid = sm[9] ?? { x: 0.5, y: 0.5 };
      seen.set(id, {
        sm,
        fast,
        mir: this.miraDaMao(id),
        pinched,
        edge,
        label: h.side,
        ratio,
        // profundidade da mão: só o que a webcam dá de verdade (aparencia)
        size: Math.hypot(mid.x - wrist.x, mid.y - wrist.y),
        hasWorld,
        // lado por VOTO: o rótulo cru do modelo troca sozinho no meio do gesto
        handSide: this.sideVote.add(id, h.side),
      });
    }

    // 1.5) SELETOR DE UMA MÃO. 'auto' deixa qualquer mão comandar; 'right'/
    // 'left' só aquela (lado votado); 'lock' gruda na que estiver em uso —
    // não precisa acertar direita/esquerda, serve quando o rótulo mente.
    const pinchedAll = [...seen].filter(([, s]) => s.pinched).map(([id]) => id);
    if (this.filter === 'lock' && this.lockedId === null && seen.size > 0) {
      this.lockedId = pinchedAll[0] ?? [...seen.keys()][0] ?? null;
    }
    const usedIds = new Set(
      [...seen].filter(([id]) => this.useHand(id, seen)).map(([id]) => id),
    );

    // calibração: UMA mão (a primeira que COMANDA) — duas mãos misturam amostras
    const firstUsed = [...seen].find(([id]) => usedIds.has(id))?.[1];
    if (firstUsed && this.calib) this.collectCalib(firstUsed.ratio, now);

    // 2) mãos sumidas além da graça: solta o aperto das que estavam agarrando
    for (const side of this.pinch.prune(now)) {
      const cell = this.lastCell.get(side);
      if (cell) useEditor.getState().releaseAt(cell);
      this.lastCell.delete(side);
      this.pressed.delete(side);
      this.slowFilters.delete(side);
      this.fastFilters.delete(side);
      this.worldFilters.delete(side);
      this.sideVote.forget(side);
      if (this.lockedId === side) this.lockedId = null; // gruda na próxima
      if (this.driver === side) this.driver = null;
      if (this.clutchId === side) {
        this.clutch.reset();
        this.clutchId = null;
      }
    }

    // 3) solturas primeiro: a borda 'up' chega junto com pinched=false,
    // então o piloto ainda não pode ter sido trocado (senão a soltura se perde
    // e o fio fica preso na mão)
    const st = useEditor.getState();
    for (const [side, s] of seen) {
      if (s.edge === 'up' && this.pressed.has(side)) {
        const last = this.lastCell.get(side);
        // soltou com a mira VISÍVEL em cima da lixeira = jogou o que estava na
        // mão fora (a última célula vale só para soltar normal)
        const p = this.draw.cursor;
        if (p && miraOverTrash(p)) st.trash();
        else if (last) st.releaseAt(last);
        this.pressed.delete(side);
        this.lastCell.delete(side);
        this.panPrev = null;
      }
    }

    // 4) piloto: mantém o atual se ainda pinçado; senão, a primeira pinçada.
    // Só mãos que COMANDAM entram (o seletor de uma mão pega só uma delas).
    const pinchedNow = pinchedAll.filter((id) => usedIds.has(id));
    if (this.driver === null || !pinchedNow.includes(this.driver)) {
      this.driver = pinchedNow[0] ?? null;
    }

    // 4.5) TRAVA DE MIRA. A mira crua é o meio entre as pontas 4 e 8, mas elas
    // se CONVERGEM ao fechar a mão: o meio escorrega em direção ao polegar e
    // o esqueleto (ancorado na mira) deslizava junto — seleção errando alvo.
    // A trava congela a "apontada" dos dedos pouco antes da pinça e daí a mira
    // é palma + apontada: os dedos fecham em volta dela, ela não anda.
    const hoverId = this.driver ?? [...usedIds][0] ?? null;
    let cursorPoint: HandPoint | null = null;
    const hover = hoverId !== null ? seen.get(hoverId) : undefined;
    if (hover && hover.mir.length >= 10) {
      if (this.clutchId !== hoverId) {
        this.clutch.reset();
        this.clutchId = hoverId;
      }
      cursorPoint = this.clutch.update({
        ratio: hover.ratio,
        tip: midOf(hover.mir, 4, 8),
        palm: midOf(hover.mir, 0, 9),
      });
    }

    // 5) aperto/movimento do piloto ( contention: quem nunca apertou, aperta;
    // quem já apertou, move — a soltura foi tratada no passo 3).
    const d = this.driver !== null ? seen.get(this.driver) : undefined;
    if (this.driver !== null && d?.pinched && cursorPoint) {
      const cell = this.resolveCell(cursorPoint);
      if (cell) {
        if (!this.pressed.has(this.driver)) {
          st.pressAt(cell);
          this.pressed.add(this.driver);
          // aperto no VAZIO do quadro/bancada => o que vier é pan da vista;
          // meço em fração de tela (a célula reage ao movimento da vista)
          this.panPrev = useEditor.getState().panning
            ? { x: cursorPoint.x, y: cursorPoint.y }
            : null;
        } else if (this.panPrev && useEditor.getState().panning && typeof window !== 'undefined') {
          // PINÇA E PUXA: a vista acompanha a mão (px) — mouse e toque fazem
          // o mesmo caminho pelo lado deles; componente algum é tocado.
          const dx = (cursorPoint.x - this.panPrev.x) * window.innerWidth;
          const dy = (cursorPoint.y - this.panPrev.y) * window.innerHeight;
          this.panPrev = { x: cursorPoint.x, y: cursorPoint.y };
          if (dx !== 0 || dy !== 0) applyPan(dx, dy, window.innerWidth);
        } else {
          st.moveAt(cell);
        }
        this.lastCell.set(this.driver, cell);
      }
    }

    // 5.5) GESTO DE DUAS mãos = o "pinça" de toque COMPLETO, com as mãos
    // inteiras: afastar dá zoom (ancorado no ponto do quadro sob o MEIO das
    // mãos), deslocar o meio posiciona o enquadramento (vertical e horizontal)
    // e — SÓ na bancada 3D — girar a linha entre as mãos gira o eixo Z (o
    // esquemático é diagrama e não gira). SÓ vale em "Qualquer mão comanda":
    // escolhida UMA mão, a outra não interage para nada — nem zoom (a mira, a
    // pinça e a calibração já a ignoram; aqui fecha o último acesso). E
    // continua exigindo que nenhuma esteja pinçando: quem agarrou algo não
    // muda a vista.
    const hands2 = [...seen.entries()];
    if (this.filter === 'auto' && hands2.length === 2 && pinchedNow.length === 0) {
      const [[idA, ha], [idB, hb]] = hands2;
      const a = midOf(ha.mir, 0, 9);
      const b = midOf(hb.mir, 0, 9);
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid: HandPoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const prev = this.spread;
      // as IDENTIDADES têm de ser as mesmas do quadro anterior: um par trocado
      // no meio do gesto inverteria a ordem das mãos e daria um salto de π
      const same = prev !== null && prev.ids[0] === idA && prev.ids[1] === idB;
      if (same && prev.dist > 0.08 && dist > 0.08) {
        // ganho 1,2: 10% de afastamento ≈ 12% de zoom; trava por quadro para
        // um salto de detecção não arremessar a câmera
        const f = Math.min(1.05, Math.max(0.95, Math.pow(dist / prev.dist, 1.2)));
        if (Math.abs(f - 1) > 0.003) applyZoom(f, this.boardAt(prev.mid));
        if (typeof window !== 'undefined') {
          // o MEIO das mãos anda => o enquadramento anda junto (vertical e
          // horizontal) — é o que o pinch do toque já fazia com os dedos.
          // 0,05 px de folga: não é o tremor da suavização nem ponto flutuante
          const dx = (mid.x - prev.mid.x) * window.innerWidth;
          const dy = (mid.y - prev.mid.y) * window.innerHeight;
          if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) applyPan(dx, dy, this.panViewport());
        }
        // giro de Z: mão girando no sentido horário de tela (y cresce) =>
        // orbita anti-horária por cima => o visto de cima gira junto com a mão
        let dAng = ang - prev.ang;
        while (dAng > Math.PI) dAng -= 2 * Math.PI;
        while (dAng < -Math.PI) dAng += 2 * Math.PI;
        dAng = Math.max(-0.25, Math.min(0.25, dAng)); // trava por quadro
        if (Math.abs(dAng) > 0.002) applyRoll(dAng);
      }
      this.spread = { ids: [idA, idB], dist, mid, ang };
    } else {
      this.spread = null;
    }

    // 6) quadro para desenho (esqueleto rápido) + status com etiquetas legíveis
    const drawHands: DrawHand[] = [...seen].map(([id, s]) => ({
      side: s.label,
      pts: s.mir,
      pinched: s.pinched,
      cursor: id === hoverId,
      size: Number.isFinite(s.size) && s.size > 0 ? s.size : HAND_REF,
      // as mãos que o seletor ignora aparecem apagadas (o professor vê por quê)
      used: usedIds.has(id),
    }));
    this.draw = {
      hands: drawHands,
      cursor: cursorPoint
        ? { ...cursorPoint, active: this.driver !== null && !!d?.pinched }
        : null,
    };
    this.setStatus({
      hands: hands.length,
      pinched: pinchedNow.map((id) => seen.get(id)?.label ?? id),
      ratio: hover?.ratio ?? null,
      cursor: cursorPoint,
      mira: this.clutch.isFrozen ? 'travada' : 'livre',
      prof: hover ? (hover.hasWorld ? '3D' : '2D') : '–',
      filter: this.filter,
      handSide: hover?.handSide ?? '–',
      ignored: seen.size - usedIds.size,
      mode: this.tracker.usingVideoCallback ? 'rVFC' : 'rAF',
      calibrating: this.calib
        ? { phase: this.calib.phase, leftMs: Math.max(0, this.calib.until - now) }
        : null,
    });
  }

  /**
   * Fração da tela => ponto do quadro (unidades do viewBox): é a âncora do
   * zoom do gesto das duas mãos — o ponto do quadro sob o MEIO das mãos fica
   * preso na mão. Sem quadro 2D na tela (bancada 3D) não há âncora: o dolly
   * não tem, e o enquadramento anda pelo pan e pelo giro.
   */
  private boardAt(f: HandPoint): { x: number; y: number } | null {
    if (typeof document === 'undefined' || typeof window === 'undefined') return null;
    const el = document.querySelector<SVGSVGElement>('svg.schematic');
    if (!el) return null;
    return clientToBoard(el, f.x * window.innerWidth, f.y * window.innerHeight);
  }

  /** Largura do quadro em px: a referência do pan (sem quadro na tela, a janela). */
  private panViewport(): number {
    if (typeof window === 'undefined') return 1;
    const w =
      typeof document !== 'undefined'
        ? document.querySelector('svg.schematic')?.getBoundingClientRect().width
        : 0;
    return w && w > 1 ? w : window.innerWidth;
  }

  /** Quadro suavizado para a camada desenhar (esqueleto + cursor). */
  drawFrame(): { hands: DrawHand[]; cursor: DrawCursor | null } {
    return this.draw;
  }

  /**
   * Identidade estável: casa cada mão detectada com o centroide mais próximo
   * (até 0,25 em coords normalizadas); nova mão ganha id novo. Assim a troca
   * de etiqueta Left/Right do classificador não teleporta o cursor nem
   * reinicia a pinça.
   */
  private stableId(h: FrameHand, now: number): string {
    const cx = h.pts.reduce((s, p) => s + p.x, 0) / h.pts.length;
    const cy = h.pts.reduce((s, p) => s + p.y, 0) / h.pts.length;
    let best: string | null = null;
    let bestD = 0.25;
    for (const [id, s] of this.slots) {
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    // slots velhos somem (mão que saiu e voltou é mão nova)
    for (const [id, s] of [...this.slots]) {
      if (now - s.lastSeen > 1500) this.slots.delete(id);
    }
    if (best === null) {
      best = `H${++this.slotSeq}`;
      this.slots.set(best, { x: cx, y: cy, lastSeen: now });
    } else {
      this.slots.set(best, { x: cx, y: cy, lastSeen: now });
    }
    return best;
  }

  private bank(
    store: Map<string, { x: OneEuroFilter[]; y: OneEuroFilter[] }>,
    side: string,
    n: number,
    opts: { minCutoff?: number; beta?: number } = {},
  ): { x: OneEuroFilter[]; y: OneEuroFilter[] } {
    let b = store.get(side);
    if (!b || b.x.length !== n) {
      b = {
        x: Array.from({ length: n }, () => new OneEuroFilter(opts)),
        y: Array.from({ length: n }, () => new OneEuroFilter(opts)),
      };
      store.set(side, b);
    }
    return b;
  }

  private smooth(
    store: Map<string, { x: OneEuroFilter[]; y: OneEuroFilter[] }>,
    side: string,
    pts: { x: number; y: number }[],
    t: number,
    opts: { minCutoff?: number; beta?: number },
  ): HandPoint[] {
    const b = this.bank(store, side, pts.length, opts);
    return pts.map((p, i) => ({ x: b.x[i].filter(p.x, t), y: b.y[i].filter(p.y, t) }));
  }

  /** Mesma suavização lenta das coordenadas 2D, agora nos TRÊS eixos (metros). */
  private smoothWorld(side: string, pts: Pt3[], t: number): Pt3[] {
    let b = this.worldFilters.get(side);
    if (!b || b.x.length !== pts.length) {
      b = {
        x: Array.from({ length: pts.length }, () => new OneEuroFilter({})),
        y: Array.from({ length: pts.length }, () => new OneEuroFilter({})),
        z: Array.from({ length: pts.length }, () => new OneEuroFilter({})),
      };
      this.worldFilters.set(side, b);
    }
    const bank = b;
    return pts.map((p, i) => ({
      x: bank.x[i].filter(p.x, t),
      y: bank.y[i].filter(p.y, t),
      z: bank.z[i].filter(p.z, t),
    }));
  }

  /**
   * Os pontos da mão prontos para a TELA — é deles que saem o cursor, o
   * esqueleto e o gesto de zoom. Na câmera FRONTAL a imagem é um selfie: quem
   * levanta a mão direita se vê à esquerda da tela, então a mira é espelhada.
   * Na câmera de TRÁS não há espelho (a mesa aparece como o aluno a vê) e, com
   * o AR ligado, a mira cai no PIXEL em que a mão aparece no vídeo de fundo —
   * é isso que faz a mão de verdade e o cursor coincidirem. Sem bancada em AR
   * (o vídeo não está na tela), vale o quadro inteiro.
   *
   * O rótulo Left/Right NÃO muda com a câmera: o modelo já recebe imagem
   * direta nos dois casos — o espelho é de TELA, não do pixel.
   */
  private miraDaMao(id: string): HandPoint[] {
    const b = this.fastFilters.get(id);
    if (!b) return [];
    const cru = b.x.map((f, i) => ({ x: f.value ?? 0, y: b.y[i].value ?? 0 }));
    if (!this.usaTraseira) return cru.map((p) => ({ x: 1 - p.x, y: p.y }));
    const caixa = caixaDoVideoAr();
    if (!caixa || typeof window === 'undefined') return cru;
    const tela = { w: window.innerWidth, h: window.innerHeight };
    return cru.map((p) => {
      const q = pontoNaTela(p.x, p.y, caixa.quadro, caixa);
      return { x: q.x / tela.w, y: q.y / tela.h };
    });
  }

  /**
   * Cursor (fração da janela, já pronto para a tela) => célula na vista ativa. A
   * 3D tem prioridade sobre a 2D; sem vista aplicável devolve null (a pinça não
   * age).
   */
  resolveCell(cursor: HandPoint): { x: number; y: number } | null {
    for (const name of ['3d', '2d']) {
      const locate = this.locators.get(name);
      if (!locate) continue;
      const cell = locate(cursor);
      if (cell) return cell;
    }
    return null;
  }

  private collectCalib(ratio: number, now: number) {
    const c = this.calib;
    if (!c) return;
    if (c.until === 0) {
      c.until = now + CALIB_MS;
      c.startMark = now;
    }
    // descarta os primeiros 600 ms da fase (transição de abrir/fechar contamina)
    if (now - c.startMark < 600) return;
    c.samples.push(ratio);
    if (now < c.until) return;
    if (c.phase === 'closed') {
      this.closedRef = percentile(c.samples, 0.9);
      this.calib = { phase: 'open', until: 0, startMark: 0, samples: [] };
      this.setStatus({ calibrating: { phase: 'open', leftMs: CALIB_MS } }, true);
    } else {
      const openRef = percentile(c.samples, 0.1);
      const closedRef = this.closedRef;
      // limiar COLADO no teto da fechada (+0,08 de folga): pinça responde sem
      // exigir mão esmagada — mas só instala se há separação real (senão MANTÉM
      // o limiar antigo em vez de piorar, que era o defeito relatado)
      const thr = Math.min(0.7, Math.max(0.25, closedRef + 0.08));
      if (!c.samples.length) {
        this.setStatus({ error: 'Nenhuma mão vista: mostre UMA mão para a câmera.' }, true);
      } else if (closedRef + 0.08 + 0.12 + 0.05 < openRef) {
        this.installThreshold(thr);
        const txt = `fechada ~${closedRef.toFixed(2)} · aberta ~${openRef.toFixed(2)} → ${thr.toFixed(2)}`;
        this.setStatus({ threshold: thr, lastCalib: txt, error: null }, true);
      } else {
        this.setStatus(
          { error: `Sem separação (fechada ~${closedRef.toFixed(2)}, aberta ~${openRef.toFixed(2)}): feche mais a pinça e abra mais a mão. Limiar mantido.` },
          true,
        );
      }
      this.calib = null;
      this.closedRef = 0;
      this.setStatus({ calibrating: null }, true);
    }
  }

  private installThreshold(thr: number) {
    this.releaseAllPressed();
    this.pinch = new PinchTracker({ threshold: thr });
    try {
      localStorage.setItem(LS_KEY, String(thr));
    } catch {
      /* sem storage */
    }
  }

  private closedRef = 0;
}

/** Média de dois landmarks num array JÁ convertido para a tela (espaço da janela). */
function midOf(pts: HandPoint[], i: number, j: number): HandPoint {
  const a = pts[i] ?? { x: 0.5, y: 0.5 };
  const b = pts[j] ?? { x: 0.5, y: 0.5 };
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Percentil (0 se vazio): p90 do teto, p10 do piso — robustos a tropeços. */
function percentile(v: number[], q: number): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

export function useHandsStatus(controller: HandsController): HandsStatus {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}

/** Instância da aplicação (uma câmera por página). */
export const hands = new HandsController();

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // gancho de depuração (só dev): alimenta `ingest` com mãos sintéticas sem
  // câmera — mesmo caminho do tracker, útil para validar gestos no navegador
  (window as unknown as { __hands?: HandsController }).__hands = hands;
}
