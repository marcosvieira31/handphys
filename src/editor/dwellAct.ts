import {
  nearestTerminal,
  samePt,
  wireRoute,
  type CircuitDoc,
  type Pt,
} from '../core/netlist';

/**
 * Alvo da mira por fixação: uma FUNÇÃO (botão marcado com `data-dwell`) ou um
 * objeto do quadro. Puro e testável — o componente só faz o `elementFromPoint`.
 */
export type DwellKind = 'dom' | 'comp' | 'wire' | 'term';

export interface DwellHit {
  /** Id estável para o DwellController (não muda enquanto a mira fica no alvo). */
  id: string;
  kind: DwellKind;
  /** Para 'dom': ação ("view:3d", "wire", "kind:vsource", "example:0", "clear"). */
  action?: string;
  /** Para 'comp'/'wire': id do objeto; para 'term': id do componente. */
  refId?: string;
  terminal?: 0 | 1;
  /** Célula de grade do alvo (para iniciar/finalizar fio). */
  cell?: Pt;
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/** Objeto do quadro sob a célula: terminal (imã) > componente > fio. */
export function boardHitAt(doc: CircuitDoc, cell: Pt): DwellHit | null {
  const term = nearestTerminal(doc, cell, 0.75);
  if (term) {
    return {
      id: `term:${term.comp.id}:${term.terminal}`,
      kind: 'term',
      refId: term.comp.id,
      terminal: term.terminal,
      cell: term.pos,
    };
  }
  for (const comp of doc.comps) {
    if (Math.abs(comp.x - cell.x) <= 1 && Math.abs(comp.y - cell.y) <= 1) {
      return { id: `comp:${comp.id}`, kind: 'comp', refId: comp.id, cell };
    }
  }
  for (const w of doc.wires) {
    const pts = wireRoute(doc, w);
    for (let i = 1; i < pts.length; i++) {
      if (distToSeg(cell, pts[i - 1], pts[i]) < 0.35) {
        return { id: `wire:${w.id}`, kind: 'wire', refId: w.id, cell };
      }
    }
  }
  return null;
}

/** Ação de um botão `data-dwell` vira alvo, se reconhecida. */
export function domHitAt(action: string): DwellHit | null {
  const ok =
    action.startsWith('kind:') ||
    action.startsWith('example:') ||
    action.startsWith('view:') ||
    action === 'wire' ||
    action === 'clear';
  return ok ? { id: `dom:${action}`, kind: 'dom', action } : null;
}

/** Rótulo curto para o HUD/rótulo da mira. */
export function labelOf(hit: DwellHit): string {
  if (hit.kind === 'dom') return `função: ${hit.action}`;
  if (hit.kind === 'term') return `conectar ${hit.refId}`;
  return `${hit.kind}: ${hit.refId}`;
}

/**
 * Estado de ativação por fixação. A dependência do store entra como funções,
 * então a máquina de "primeiro terminal inicia, segundo completa" é testável.
 */
export interface DwellActApi {
  arm: (kind: string | null) => void;
  armWire: (on: boolean) => void;
  loadExample: (index: number) => void;
  clear: () => void;
  setView: (v: '2d' | '3d') => void;
  select: (kind: 'comp' | 'wire', id: string) => void;
  startDraft: (cell: Pt) => void;
  moveDraft: (cell: Pt) => void;
  endDraft: (cell: Pt) => void;
}

export class DwellActivator {
  private wireFrom: Pt | null = null;

  constructor(private readonly api: DwellActApi) {}

  /** Célula com fio em construção (para a prévia seguir a mira), senão null. */
  get pendingFrom(): Pt | null {
    return this.wireFrom;
  }

  reset() {
    this.wireFrom = null;
  }

  /** Dispara a ação do alvo; devolve true se algo foi ativado. */
  fire(hit: DwellHit): boolean {
    switch (hit.kind) {
      case 'dom': {
        const a = hit.action ?? '';
        if (a.startsWith('kind:')) this.api.arm(a.slice(5));
        else if (a === 'wire') this.api.armWire(true);
        else if (a.startsWith('example:')) this.api.loadExample(Number(a.slice(8)));
        else if (a === 'clear') this.api.clear();
        else if (a === 'view:2d' || a === 'view:3d') this.api.setView(a.slice(5) as '2d' | '3d');
        return true;
      }
      case 'comp':
      case 'wire':
        this.api.select(hit.kind, hit.refId!);
        return true;
      case 'term': {
        if (!hit.cell) return false;
        if (!this.wireFrom) {
          this.wireFrom = hit.cell;
          this.api.startDraft(hit.cell);
          return true;
        }
        if (samePt(this.wireFrom, hit.cell)) return false;
        this.api.moveDraft(hit.cell);
        this.api.endDraft(hit.cell);
        this.wireFrom = null;
        this.api.armWire(false);
        return true;
      }
    }
  }
}
