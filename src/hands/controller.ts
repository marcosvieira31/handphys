import { useSyncExternalStore } from 'react';
import { clientToCell } from '../editor/coords';
import { useEditor } from '../editor/store';
import { OneEuroFilter } from './oneEuro';
import { PinchTracker } from './pinch';
import { HandTracker, pinchRatio2D, pinchRatio3D, type FrameHand } from './tracker';

export interface HandPoint {
  x: number;
  y: number;
}

export interface DrawHand {
  side: string;
  /** Pontos suavizados, normalizados e ESPELHADOS (prontos para desenhar). */
  pts: HandPoint[];
  pinched: boolean;
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
  fps: number;
  latencyMs: number;
  delegate: string;
  threshold: number;
  error: string | null;
  calibrating: { phase: 'closed' | 'open'; leftMs: number } | null;
}

const LS_KEY = 'handphys.pinchThreshold';
const CALIB_MS = 2500;

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
 * Adapter mãos => store: a pinça aperta/move/solta as MESMAS ações do mouse
 * (pressAt/moveAt/releaseAt). Sem vídeo sobre a cena (privacidade): a camada
 * desenha só o esqueleto. Testável sem câmera via `ingest`.
 */
export class HandsController {
  private tracker = new HandTracker();
  private customCell: ((cursor: HandPoint) => { x: number; y: number } | null) | null = null;  private pinch = new PinchTracker({ threshold: loadThreshold() });
  private filters = new Map<string, { x: OneEuroFilter[]; y: OneEuroFilter[] }>();
  private lastCell = new Map<string, { x: number; y: number }>();
  private pressed = new Set<string>();
  private driver: string | null = null;
  private getSvg: (() => SVGSVGElement | null) | null = null;
  private hiddenVideo: HTMLVideoElement | null = null;
  private previewVideo: HTMLVideoElement | null = null;
  private listeners = new Set<() => void>();
  private draw: { hands: DrawHand[]; cursor: DrawCursor | null } = { hands: [], cursor: null };
  private status: HandsStatus = {
    active: false,
    starting: false,
    hands: 0,
    pinched: [],
    fps: 0,
    latencyMs: 0,
    delegate: '–',
    threshold: loadThreshold(),
    error: null,
    calibrating: null,
  };
  private frames = 0;
  private fpsAt = 0;
  private latSum = 0;
  private latN = 0;
  private lastNotify = 0;
  private calib: { phase: 'closed' | 'open'; until: number; samples: number[] } | null = null;

  constructor(opts: { toCell?: (cursor: HandPoint) => { x: number; y: number } | null } = {}) {
    this.customCell = opts.toCell ?? null;
  }

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
  bind(getSvg: () => SVGSVGElement | null, video: HTMLVideoElement) {
    this.getSvg = getSvg;
    this.hiddenVideo = video;
  }

  unbind() {
    this.stop();
    this.getSvg = null;
    this.hiddenVideo = null;
    this.previewVideo = null;
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
    try {
      await this.tracker.start(this.hiddenVideo, {
        onFrame: (hands, stats) => this.ingest(hands, stats.latencyMs, performance.now()),
        onVideoTick: () => {
          this.frames += 1;
        },
      });
      if (this.previewVideo && this.tracker.getStream()) {
        this.previewVideo.srcObject = this.tracker.getStream();
        this.previewVideo.play().catch(() => {});
      }
      this.fpsAt = performance.now();
      this.setStatus({ active: true, starting: false, delegate: this.tracker.gpuDelegate }, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus(
        {
          starting: false,
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

  stop() {
    // solta tudo que a mão segurava (sem fio preso nem arraste fantasma)
    const s = useEditor.getState();
    s.cancelDraft();
    s.releaseGrip();
    this.tracker.stop();
    if (this.previewVideo) this.previewVideo.srcObject = null;
    this.pinch.reset();
    this.filters.clear();
    this.lastCell.clear();
    this.pressed.clear();
    this.driver = null;
    this.calib = null;
    this.draw = { hands: [], cursor: null };
    this.setStatus(
      { active: false, starting: false, hands: 0, pinched: [], fps: 0, calibrating: null },
      true,
    );
  }

  get active(): boolean {
    return this.status.active;
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
    // `until` arma no primeiro quadro (usa o mesmo relógio do ingest)
    this.calib = { phase: 'closed', until: 0, samples: [] };
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

    // 1) suaviza, mede a razão, atualiza a pinça de cada mão presente
    const t = now / 1000;
    const seen = new Map<string, { sm: HandPoint[]; pinched: boolean; edge: 'down' | 'up' | null }>();
    for (const h of hands) {
      const sm = this.smooth(h, t);
      const ratio = h.world ? pinchRatio3D(h.world) : pinchRatio2D(sm);
      if (this.calib) this.collectCalib(ratio, now);
      const { pinched, edge } = this.pinch.update(h.side, ratio, now);
      seen.set(h.side, { sm, pinched, edge });
    }

    // 2) mãos sumidas além da graça: solta o aperto das que estavam agarrando
    for (const side of this.pinch.prune(now)) {
      const cell = this.lastCell.get(side);
      if (cell) useEditor.getState().releaseAt(cell);
      this.lastCell.delete(side);
      this.pressed.delete(side);
      this.filters.delete(side);
      if (this.driver === side) this.driver = null;
    }

    // 3) solturas primeiro: a borda 'up' chega junto com pinched=false,
    // então o piloto ainda não pode ter sido trocado (senão a soltura se perde
    // e o fio fica preso na mão)
    const st = useEditor.getState();
    for (const [side, s] of seen) {
      if (s.edge === 'up' && this.pressed.has(side)) {
        const last = this.lastCell.get(side);
        if (last) st.releaseAt(last);
        this.pressed.delete(side);
        this.lastCell.delete(side);
      }
    }

    // 4) piloto: mantém o atual se ainda pinçado; senão, a primeira pinçada
    const pinchedNow = [...seen].filter(([, s]) => s.pinched).map(([side]) => side);
    if (this.driver === null || !pinchedNow.includes(this.driver)) {
      this.driver = pinchedNow[0] ?? null;
    }

    // 5) aperto/movimento do piloto ( contention: quem nunca apertou, aperta;
    // quem já apertou, move — a soltura foi tratada no passo 3)
    const d = this.driver !== null ? seen.get(this.driver) : undefined;
    if (this.driver !== null && d?.pinched) {
      const cell = this.cellOf(midpoint(d.sm));
      if (cell) {
        if (!this.pressed.has(this.driver)) {
          st.pressAt(cell);
          this.pressed.add(this.driver);
        } else {
          st.moveAt(cell);
        }
        this.lastCell.set(this.driver, cell);
      }
    }

    // 5) quadro para desenho + status (sem re-render a cada quadro: throttle interno)
    const drawHands: DrawHand[] = hands.map((h) => ({
      side: h.side,
      pts: this.mirrored(this.lastSmooth(h.side)),
      pinched: seen.get(h.side)?.pinched ?? false,
    }));
    const cursorHand = this.driver !== null ? seen.get(this.driver) : undefined;
    const hoverHand = cursorHand ?? (hands.length ? seen.get(hands[0].side) : undefined);
    this.draw = {
      hands: drawHands,
      cursor: hoverHand
        ? { ...midpoint(hoverHand.sm), active: this.driver !== null && hoverHand.pinched }
        : null,
    };
    this.setStatus({
      hands: hands.length,
      pinched: pinchedNow,
      calibrating: this.calib
        ? { phase: this.calib.phase, leftMs: Math.max(0, this.calib.until - now) }
        : null,
    });
  }

  /** Quadro suavizado para a camada desenhar (esqueleto + cursor). */
  drawFrame(): { hands: DrawHand[]; cursor: DrawCursor | null } {
    return this.draw;
  }

  private bank(side: string, n: number): { x: OneEuroFilter[]; y: OneEuroFilter[] } {
    let b = this.filters.get(side);
    if (!b || b.x.length !== n) {
      b = {
        x: Array.from({ length: n }, () => new OneEuroFilter()),
        y: Array.from({ length: n }, () => new OneEuroFilter()),
      };
      this.filters.set(side, b);
    }
    return b;
  }

  private smooth(h: FrameHand, t: number): HandPoint[] {
    const b = this.bank(h.side, h.pts.length);
    return h.pts.map((p, i) => ({ x: b.x[i].filter(p.x, t), y: b.y[i].filter(p.y, t) }));
  }

  private lastSmooth(side: string): HandPoint[] {
    const b = this.filters.get(side);
    if (!b) return [];
    return b.x.map((f, i) => ({ x: f.value ?? 0, y: b.y[i].value ?? 0 }));
  }

  private mirrored(pts: HandPoint[]): HandPoint[] {
    return pts.map((p) => ({ x: 1 - p.x, y: p.y }));
  }

  private cellOf(cursor: HandPoint): { x: number; y: number } | null {
    if (this.customCell) return this.customCell(cursor);
    const svg = this.getSvg?.() ?? null;
    if (!svg) return null; // sem esquemático (modo 3D): a pinça não age
    const r = svg.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return clientToCell(svg, r.left + cursor.x * r.width, r.top + cursor.y * r.height);
  }

  private collectCalib(ratio: number, now: number) {
    const c = this.calib;
    if (!c) return;
    if (c.until === 0) c.until = now + CALIB_MS;
    c.samples.push(ratio);
    if (now < c.until) return;
    if (c.phase === 'closed') {
      this.closedMed = median(c.samples);
      this.calib = { phase: 'open', until: now + CALIB_MS, samples: [] };
      this.setStatus({ calibrating: { phase: 'open', leftMs: CALIB_MS } }, true);
    } else {
      // medianas (robustas a tropeços no início/fim da fase)
      const openMed = median(c.samples);
      const closedMed = this.closedMed;
      if (closedMed < openMed) {
        const thr = Math.min(0.7, Math.max(0.25, (closedMed + openMed) / 2));
        this.pinch = new PinchTracker({ threshold: thr });
        try {
          localStorage.setItem(LS_KEY, String(thr));
        } catch {
          /* sem storage */
        }
        this.setStatus({ threshold: thr, error: null }, true);
      } else {
        this.setStatus({ error: 'Calibração confusa: feche bem a pinça e depois abra bem.' }, true);
      }
      this.calib = null;
      this.closedMed = 0;
      this.setStatus({ calibrating: null }, true);
    }
  }

  private closedMed = 0;
}

function midpoint(pts: HandPoint[]): HandPoint {
  const a = pts[4] ?? { x: 0.5, y: 0.5 };
  const b = pts[8] ?? { x: 0.5, y: 0.5 };
  return { x: 1 - (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; // já sai espelhado
}

/** Mediana (0 se vazio): ignora tropeços nas bordas da amostragem. */
function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function useHandsStatus(controller: HandsController): HandsStatus {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}

/** Instância da aplicação (uma câmera por página). */
export const hands = new HandsController();
