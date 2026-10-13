import { useSyncExternalStore } from 'react';
import { applyPan, applyZoom } from '../editor/zoom';
import { miraOverTrash } from '../editor/coords';
import { useEditor } from '../editor/store';
import { Clutch } from './clutch';
import { OneEuroFilter } from './oneEuro';
import { PinchTracker } from './pinch';
import { SideVote, type HandSide } from './side';
import { HandTracker, pinchRatio2D, pinchRatio3D, type FrameHand, type Pt3 } from './tracker';

/** Seletor de UMA mão: quem comanda o cursor, a pinça e a calibração. */
export type HandFilter = 'auto' | 'right' | 'left' | 'lock';

export interface HandPoint {
  x: number;
  y: number;
}

export interface DrawHand {
  side: string;
  /** Pontos suavizados, normalizados e ESPELHADOS (prontos para desenhar). */
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
  /** Razão polegar–indicador da mão piloto (para diagnóstico em aula). */
  ratio: number | null;
  /** Cursor da mão piloto (0..1, já espelhado). */
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
const CALIB_MS = 2500;
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

/** Uma mão já identificada e suavizada (uma linha do `ingest`). */
interface SeenHand {
  sm: HandPoint[];
  fast: HandPoint[];
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
  /** Distância entre as DUAS mãos do quadro anterior (gesto de zoom). */
  private spread: number | null = null;
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
  private listeners = new Set<() => void>();
  private draw: { hands: DrawHand[]; cursor: DrawCursor | null } = { hands: [], cursor: null };
  private status: HandsStatus = {
    active: false,
    starting: false,
    hands: 0,
    pinched: [],
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
        mir: this.mirroredFast(id),
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

    // 5.5) GESTO DE ZOOM: as DUAS mãos abrindo/juntando (é o "pinça" de toque,
    // mas com as mãos inteiras). SÓ vale em "Qualquer mão comanda": escolhida
    // UMA mão, a outra não interage para nada — nem zoom (a mira, a pinça e a
    // calibração já a ignoram; aqui fecha o último acesso). E continua exigindo
    // que nenhuma esteja pinçando: quem agarrou algo não muda a vista.
    const hands2 = [...seen.values()];
    if (this.filter === 'auto' && seen.size === 2 && pinchedNow.length === 0) {
      const a = midOf(hands2[0].mir, 0, 9);
      const b = midOf(hands2[1].mir, 0, 9);
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.spread !== null && this.spread > 0.08 && dist > 0.08) {
        // ganho 1,2: 10% de afastamento ≈ 12% de zoom; trava por quadro para
        // um salto de detecção não arremessar a câmera
        const f = Math.min(1.05, Math.max(0.95, Math.pow(dist / this.spread, 1.2)));
        if (Math.abs(f - 1) > 0.003) applyZoom(f);
      }
      this.spread = dist;
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

/** Média de dois landmarks num array JÁ espelhado (espaço da janela). */
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
