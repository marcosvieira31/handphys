import { useSyncExternalStore } from 'react';
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
  /** Razão polegar–indicador da mão piloto (para diagnóstico em aula). */
  ratio: number | null;
  /** Cursor da mão piloto (0..1, já espelhado). */
  cursor: HandPoint | null;
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
export type LocateFn = (cursor: HandPoint) => { x: number; y: number } | null;

export class HandsController {
  private tracker = new HandTracker();
  /** Miras por vista ("3d" antes de "2d"): só uma vista está montada por vez. */
  private locators = new Map<string, LocateFn>();
  private pinch = new PinchTracker({ threshold: loadThreshold() });
  /** Suavização LENTA (razão de pinça estável) e RÁPIDA (cursor sem lag), por mão. */
  private slowFilters = new Map<string, { x: OneEuroFilter[]; y: OneEuroFilter[] }>();
  private fastFilters = new Map<string, { x: OneEuroFilter[]; y: OneEuroFilter[] }>();
  /** Identidade estável: o classificador troca Left/Right; o centroide, não. */
  private slots = new Map<string, { x: number; y: number; lastSeen: number }>();
  private slotSeq = 0;
  private lastCell = new Map<string, { x: number; y: number }>();
  private pressed = new Set<string>();
  private driver: string | null = null;
  private hiddenVideo: HTMLVideoElement | null = null;
  private previewVideo: HTMLVideoElement | null = null;
  private listeners = new Set<() => void>();
  private draw: { hands: DrawHand[]; cursor: DrawCursor | null } = { hands: [], cursor: null };
  private status: HandsStatus = {
    active: false,
    starting: false,
    hands: 0,
    pinched: [],
    ratio: null,
    cursor: null,
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
      // Vigia de prontidão: se a câmera não entregar quadros em 2,5 s (vídeo
      // pausado, permissão estranha, elemento oculto), avisa em vez de ficar mudo.
      window.setTimeout(() => {
        if (this.status.active && this.frames === 0) {
          this.setStatus(
            { error: 'A câmera não está entregando quadros: verifique a permissão e recarregue.' },
            true,
          );
        }
      }, 2500);
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
    this.slowFilters.clear();
    this.fastFilters.clear();
    this.slots.clear();
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
    const seen = new Map<string, { sm: HandPoint[]; fast: HandPoint[]; pinched: boolean; edge: 'down' | 'up' | null; label: string; ratio: number }>();
    let firstRatio: number | null = null;
    for (const h of hands) {
      const id = this.stableId(h, now);
      const sm = this.smooth(this.slowFilters, id, h.pts, t, {});
      const fast = this.smooth(this.fastFilters, id, h.pts, t, { minCutoff: 2.5, beta: 0.07 });
      const ratio = h.world ? pinchRatio3D(h.world) : pinchRatio2D(sm);
      if (firstRatio === null) firstRatio = ratio;
      const { pinched, edge } = this.pinch.update(id, ratio, now);
      seen.set(id, { sm, fast, pinched, edge, label: h.side, ratio });
    }
    // calibração: UMA mão (a primeira) — duas mãos misturam as amostras
    if (firstRatio !== null && this.calib) this.collectCalib(firstRatio, now);

    // 2) mãos sumidas além da graça: solta o aperto das que estavam agarrando
    for (const side of this.pinch.prune(now)) {
      const cell = this.lastCell.get(side);
      if (cell) useEditor.getState().releaseAt(cell);
      this.lastCell.delete(side);
      this.pressed.delete(side);
      this.slowFilters.delete(side);
      this.fastFilters.delete(side);
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
    // quem já apertou, move — a soltura foi tratada no passo 3).
    // O cursor usa o filtro RÁPIDO (sem o lag do filtro da razão).
    const d = this.driver !== null ? seen.get(this.driver) : undefined;
    if (this.driver !== null && d?.pinched) {
      const cell = this.resolveCell(midpoint(d.fast));
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

    // 6) quadro para desenho (esqueleto rápido) + status com etiquetas legíveis
    const drawHands: DrawHand[] = [...seen].map(([id, s]) => ({
      side: s.label,
      pts: this.mirroredFast(id),
      pinched: s.pinched,
    }));
    const cursorHand = this.driver !== null ? seen.get(this.driver) : undefined;
    const hoverSeen = cursorHand ?? [...seen.values()][0];
    const cursorPoint = hoverSeen ? midpoint(hoverSeen.fast) : null;
    this.draw = {
      hands: drawHands,
      cursor: cursorPoint
        ? { ...cursorPoint, active: this.driver !== null && !!hoverSeen?.pinched }
        : null,
    };
    this.setStatus({
      hands: hands.length,
      pinched: pinchedNow.map((id) => seen.get(id)?.label ?? id),
      ratio: (cursorHand ?? hoverSeen)?.ratio ?? null,
      cursor: cursorPoint,
      mode: this.tracker.usingVideoCallback ? 'rVFC' : 'rAF',
      calibrating: this.calib
        ? { phase: this.calib.phase, leftMs: Math.max(0, this.calib.until - now) }
        : null,
    });
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

  private mirroredFast(id: string): HandPoint[] {
    const b = this.fastFilters.get(id);
    if (!b) return [];
    return b.x.map((f, i) => ({ x: 1 - (f.value ?? 0), y: b.y[i].value ?? 0 }));
  }

  /**
   * Cursor (já espelhado) => célula na vista ativa. A 3D tem prioridade sobre a
   * 2D; sem vista aplicável devolve null (a pinça não age).
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

function midpoint(pts: HandPoint[]): HandPoint {
  const a = pts[4] ?? { x: 0.5, y: 0.5 };
  const b = pts[8] ?? { x: 0.5, y: 0.5 };
  return { x: 1 - (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; // já sai espelhado
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
