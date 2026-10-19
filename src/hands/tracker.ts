import type { HandLandmarker } from '@mediapipe/tasks-vision';
// NOTE: import só de TIPOS — o runtime entra por import dinâmico (fora do bundle inicial).

export interface Pt3 {
  x: number;
  y: number;
  z: number;
}

/** Distância polegar×indicador normalizada pelo tamanho aparente da mão. */
export function pinchRatio2D(lm: Array<{ x: number; y: number }>): number {
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  return d(lm[4], lm[8]) / (d(lm[0], lm[9]) || 1e-6);
}

/**
 * Mesma razão em coordenadas de mundo (metros). Mais estável quando as pontas
 * se tocam: em imagem um dedo some atrás do outro (medido no spike 0.1).
 */
export function pinchRatio3D(world: Pt3[]): number {
  const d = (a: Pt3, b: Pt3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  return d(world[4], world[8]) / (d(world[0], world[9]) || 1e-6);
}

/** De que lado do aparelho a webcam olha: a FRONTAL (selfie) ou a de TRÁS. */
export type LadoCamera = 'frontal' | 'traseira';

/**
 * O que pedir para a câmera das MÃOS. Com o AR ligado é a de TRÁS — a mesma que
 * aponta para a mesa, e é ela que o fundo do AR reaproveita (uma câmera só,
 * zero permissão a mais) — e nesse caso a resolução é a do VÍDEO DE FUNDO, que
 * ocupa a tela inteira: 720p custa pouco no modelo (ele redimensiona o quadro de
 * qualquer jeito) e salva a mesa de aparecer serrilhada atrás do circuito. Sem
 * AR é a frontal em 640x480, que é o que o rastreio precisa.
 *
 * `ideal` (nunca `exact`): quem não tem a câmera pedida — o PC de webcam única,
 * o tablet sem frontal — cai na que tiver em vez de ficar sem câmera nenhuma.
 */
export function restricoesMaos(traseira: boolean): MediaStreamConstraints {
  return {
    video: {
      facingMode: { ideal: traseira ? 'environment' : 'user' },
      width: { ideal: traseira ? 1280 : 640 },
      height: { ideal: traseira ? 720 : 480 },
    },
    audio: false,
  };
}

export interface FrameHand {
  /** 'Left' | 'Right' (etiqueta do classificador) — nunca índice de array. */
  side: string;
  pts: Pt3[];
  world: Pt3[] | null;
}

export interface FrameStats {
  latencyMs: number;
}

/**
 * Webcam + Hand Landmarker. Assets 100% locais (`public/mp`, sem CDN em aula),
 * GPU com fallback CPU, detecção no ritmo do vídeo (rVFC) com fallback rAF.
 * Só sente: suavização, pinça e semântica moram no controller.
 */
export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private delegate = '–';
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private lastVideoTime = -1;
  private videoFrameHandle = 0;
  private stopped = true;
  private onFrame: (hands: FrameHand[], stats: FrameStats) => void = () => {};
  private onVideoTick: () => void = () => {};

  get running(): boolean {
    return !this.stopped;
  }

  get gpuDelegate(): string {
    return this.delegate;
  }

  /** Elemento de vídeo com o stream (para a prévia opcional do painel). */
  get streamVideo(): HTMLVideoElement | null {
    return this.video;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  async start(
    video: HTMLVideoElement,
    callbacks: {
      onFrame: (hands: FrameHand[], stats: FrameStats) => void;
      onVideoTick?: () => void;
    },
    traseira = false,
  ): Promise<void> {
    if (!this.stopped) return;
    this.onFrame = callbacks.onFrame;
    if (callbacks.onVideoTick) this.onVideoTick = callbacks.onVideoTick;
    if (!this.landmarker) {
      const { landmarker, delegate } = await createLandmarker();
      this.landmarker = landmarker;
      this.delegate = delegate;
    }
    this.video = video;
    this.stream = await this.pedir(traseira);
    video.srcObject = this.stream;
    video.muted = true;
    await video.play().catch(() => {});
    this.stopped = false;
    this.lastVideoTime = -1;
    this.scheduleVideoFrame();
  }

  /**
   * Troca a câmera da sessão (frontal ⇄ de trás) SEM derrubar o rastreio: o
   * modelo, o laço de quadros e o elemento de vídeo continuam — só o stream
   * muda. A câmera nova é aberta ANTES de soltar a antiga: se ela falhar
   * (aparelho sem traseira, câmera ocupada por outro app), a que estava
   * funcionando continua na mira em vez de a sessão cair no meio da aula.
   */
  async trocarCamera(video: HTMLVideoElement, traseira: boolean): Promise<void> {
    if (this.stopped) return;
    const nova = await this.pedir(traseira);
    const antiga = this.stream;
    this.video = video;
    this.stream = nova;
    video.srcObject = nova;
    video.muted = true;
    await video.play().catch(() => {});
    this.lastVideoTime = -1; // quadro de outra câmera: o rAF tem de detectar de novo
    antiga?.getTracks().forEach((t) => t.stop());
  }

  /** Único lugar que fala com a câmera: frontal (selfie) ou de trás (a mesa). */
  private pedir(traseira: boolean): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia(restricoesMaos(traseira));
  }

  stop() {
    this.stopped = true;
    if (this.videoFrameHandle && this.video) {
      const v = this.video as HTMLVideoElement & {
        cancelVideoFrameCallback?: (h: number) => void;
      };
      v.cancelVideoFrameCallback?.(this.videoFrameHandle);
    }
    this.videoFrameHandle = 0;
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.lastVideoTime = -1;
  }

  /** Um passo de detecção (o controller chama no rAF quando não há rVFC). */
  detectFallback() {
    const v = this.video;
    if (this.stopped || !v || v.readyState < 2) return;
    if (v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    this.detectOnce();
  }

  get hasVideoCallback(): boolean {
    return this.videoFrameHandle !== 0;
  }

  /** true quando a detecção está no ritmo do vídeo (rVFC); false = laço rAF. */
  get usingVideoCallback(): boolean {
    return this.usingRvfc;
  }

  private usingRvfc = false;
  private rafHandle = 0;

  private scheduleVideoFrame() {
    const v = this.video as (HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    }) | null;
    if (this.stopped || !v) return;
    if (typeof v.requestVideoFrameCallback !== 'function') {
      // iOS Safari (e alguns Androids) não têm rVFC: sem este laço a detecção
      // NUNCA rodava e a mira ficava parada no centro. O rAF com guarda de
      // quadro repetido faz o mesmo trabalho (60 Hz, detecta só em quadro novo).
      this.usingRvfc = false;
      this.startRafFallback();
      return;
    }
    this.usingRvfc = true;
    this.videoFrameHandle = v.requestVideoFrameCallback(() => {
      if (this.stopped) return;
      this.onVideoTick();
      this.detectOnce();
      this.scheduleVideoFrame();
    });
  }

  private startRafFallback() {
    const tick = () => {
      if (this.stopped) return;
      this.rafHandle = requestAnimationFrame(tick);
      const v = this.video;
      if (!v || v.readyState < 2 || v.currentTime === this.lastVideoTime) return;
      this.lastVideoTime = v.currentTime;
      this.onVideoTick();
      this.detectOnce();
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  private detectOnce() {
    const lm = this.landmarker;
    const v = this.video;
    if (!lm || !v || v.readyState < 2) return;
    const t0 = performance.now();
    const result = lm.detectForVideo(v, t0);
    const latencyMs = performance.now() - t0;
    const hands: FrameHand[] = result.landmarks.map((pts, i) => ({
      side: result.handedness[i]?.[0]?.categoryName ?? `mão${i}`,
      pts: pts.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      world: (result.worldLandmarks[i] ?? null) as Pt3[] | null,
    }));
    this.onFrame(hands, { latencyMs });
  }
}

// BASE_URL espelha o `base` do Vite: '/' em dev, '/handphys/' no GitHub Pages.
const PUB = import.meta.env.BASE_URL;

async function createLandmarker(): Promise<{ landmarker: HandLandmarker; delegate: string }> {
  const tasks = await import('@mediapipe/tasks-vision');
  const fileset = await tasks.FilesetResolver.forVisionTasks(`${PUB}mp/wasm`);
  const base = {
    baseOptions: { modelAssetPath: `${PUB}mp/hand_landmarker.task` },
    runningMode: 'VIDEO' as const,
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    const landmarker = await tasks.HandLandmarker.createFromOptions(fileset, {
      ...base,
      baseOptions: { ...base.baseOptions, delegate: 'GPU' },
    });
    return { landmarker, delegate: 'GPU' };
  } catch {
    const landmarker = await tasks.HandLandmarker.createFromOptions(fileset, base);
    return { landmarker, delegate: 'CPU (GPU falhou)' };
  }
}
