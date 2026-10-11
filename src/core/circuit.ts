/**
 * Núcleo de simulação de circuitos — Fase 1 (MNA: Modified Nodal Analysis).
 *
 * TypeScript puro, sem DOM nem dependências: o mesmo código roda nos testes
 * (Vitest), na simulação desktop, no celular e na camada WebXR da Fase 3.
 *
 * Por que MNA e não "só lei de Ohm": série/paralelo não cobrem qualquer
 * topologia (ponte, duas fontes, malhas mistas). MNA monta o sistema linear
 * A·x = z (tensões de nós + correntes de fontes) e resolve por eliminação de
 * Gauss com pivô parcial — determinístico e com erro claro quando o circuito
 * não é solúvel (nó flutuante, fonte em conflito).
 *
 * Escopo v1: resistor, fonte de tensão e capacitor (transitório por Euler
 * implícito — incondicionalmente estável, ideal para passo variável depois).
 * Não-linearidades (lâmpada, diodo) entram via Newton-Raphson numa etapa futura.
 */

/** Nó de referência (terra). Toda tensão é medida em relação a ele. */
export const GND = 'GND';

/**
 * Nós de referência. Cada um vale 0 V e sai das incógnitas do sistema.
 * Um circuito com duas partes isoladas usa duas referências (uma por parte):
 * a tensão absoluta de uma parte solta não é física, só as diferenças são.
 */
export type Grounds = readonly string[];

export interface Resistor {
  kind: 'resistor';
  id: string;
  a: string;
  b: string;
  ohms: number;
}

export interface VoltageSource {
  kind: 'vsource';
  id: string;
  /** Terminal negativo. */
  a: string;
  /** Terminal positivo: v(b) − v(a) = volts. */
  b: string;
  volts: number;
}

export interface Capacitor {
  kind: 'capacitor';
  id: string;
  a: string;
  b: string;
  farads: number;
}

export type Component = Resistor | VoltageSource | Capacitor;
export type Components = readonly Component[];

export interface Solution {
  /** Tensão de um nó em relação ao GND, em volts. */
  voltage(node: string): number;
  /** Corrente no componente, no sentido a → b, em amperes. */
  current(id: string): number;
}

export interface TransientOptions {
  seconds: number;
  dt: number;
  /** Tensão inicial (volts) de cada capacitor, por id. Padrão: 0. */
  initialV?: Record<string, number>;
}

export interface TransientResult {
  t: number[];
  /** Histórico da tensão de um nó (volts) em cada instante de `t`. */
  voltage(node: string): number[];
  /** Histórico da corrente de um componente (amperes, sentido a → b). */
  current(id: string): number[];
}

/**
 * Como cada capacitor é visto em um passo:
 * - `companion`: modelo de Euler implícito (C/dt em paralelo com a fonte histórica);
 * - `clamp`: travado numa tensão fixa — usado em t = 0, onde a tensão do
 *   capacitor é a condição inicial e não pode pular (continuidade física).
 */
type CapModel =
  | { kind: 'companion'; g: number; i: number }
  | { kind: 'clamp'; volts: number };

function validate(components: Components): void {
  const ids = new Set<string>();
  for (const c of components) {
    if (!c.id) throw new Error('componente sem id');
    if (ids.has(c.id)) throw new Error(`id duplicado: "${c.id}"`);
    ids.add(c.id);
    if (c.kind === 'resistor' && !(c.ohms > 0)) {
      throw new Error(`resistor "${c.id}": ohms deve ser > 0`);
    }
    if (c.kind === 'capacitor' && !(c.farads > 0)) {
      throw new Error(`capacitor "${c.id}": farads deve ser > 0`);
    }
  }
}

/** Eliminação de Gauss com pivô parcial. Lança erro se o sistema for singular. */
function gauss(a: number[][], z: number[]): number[] {
  const n = z.length;
  const m = a.map((row) => row.slice());
  const b = z.slice();
  for (let col = 0; col < n; col++) {
    // pivô parcial
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) {
      throw new Error(
        'circuito não solúvel (matriz singular): nó flutuante, fonte isolada ' +
          'ou duas fontes ideais em conflito',
      );
    }
    if (pivot !== col) {
      [m[pivot], m[col]] = [m[col], m[pivot]];
      [b[pivot], b[col]] = [b[col], b[pivot]];
    }
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / m[col][col];
      if (f === 0) continue;
      for (let c = col; c < n; c++) m[r][c] -= f * m[col][c];
      b[r] -= f * b[col];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r];
    for (let c = r + 1; c < n; c++) sum -= m[r][c] * x[c];
    x[r] = sum / m[r][r];
  }
  return x;
}

/**
 * Monta e resolve o sistema MNA.
 * `caps` é vazio em regime permanente (capacitor = circuito aberto) e traz o
 * modelo equivalente de cada capacitor no transitório.
 * `grounds` são os nós de referência: cada um vale 0 V e sai das incógnitas.
 */
function solveMna(components: Components, caps: Map<string, CapModel>, grounds: ReadonlySet<string>) {
  const nodeSet = new Set<string>();
  for (const c of components) {
    if (!grounds.has(c.a)) nodeSet.add(c.a);
    if (!grounds.has(c.b)) nodeSet.add(c.b);
  }
  const nodes = [...nodeSet].sort();
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const n = nodes.length;
  const at = (node: string) => (grounds.has(node) ? -1 : idx.get(node)!);

  // Ramos com incógnita de corrente: fontes de tensão + capacitores travados.
  const branches: { a: string; b: string; volts: number; id: string }[] = [];
  for (const c of components) {
    if (c.kind === 'vsource') branches.push({ a: c.a, b: c.b, volts: c.volts, id: c.id });
    else if (c.kind === 'capacitor' && caps.get(c.id)?.kind === 'clamp') {
      branches.push({ a: c.a, b: c.b, volts: (caps.get(c.id) as { volts: number }).volts, id: c.id });
    }
  }
  const size = n + branches.length;
  const a: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const z = new Array<number>(size).fill(0);

  for (const c of components) {
    const ia = at(c.a);
    const ib = at(c.b);
    if (c.kind === 'resistor') {
      const g = 1 / c.ohms;
      if (ia >= 0) a[ia][ia] += g;
      if (ib >= 0) a[ib][ib] += g;
      if (ia >= 0 && ib >= 0) {
        a[ia][ib] -= g;
        a[ib][ia] -= g;
      }
    } else if (c.kind === 'capacitor') {
      const comp = caps.get(c.id);
      if (!comp) continue; // regime permanente: circuito aberto
      if (comp.kind === 'clamp') continue; // tratado como ramo de tensão abaixo
      if (ia >= 0) {
        a[ia][ia] += comp.g;
        z[ia] += comp.i;
      }
      if (ib >= 0) {
        a[ib][ib] += comp.g;
        z[ib] -= comp.i;
      }
      if (ia >= 0 && ib >= 0) {
        a[ia][ib] -= comp.g;
        a[ib][ia] -= comp.g;
      }
    }
  }

  branches.forEach((c, k) => {
    const branch = n + k; // incógnita: corrente que sai do terminal positivo
    const ia = at(c.a);
    const ib = at(c.b);
    if (ia >= 0) {
      a[ia][branch] += 1; // corrente sai do nó negativo e entra na fonte
      a[branch][ia] -= 1;
    }
    if (ib >= 0) {
      a[ib][branch] -= 1; // corrente entra no nó positivo vinda da fonte
      a[branch][ib] += 1;
    }
    z[branch] = c.volts; // v(b) − v(a) = volts
  });

  const x = gauss(a, z);
  const nodeV = new Map(nodes.map((node, i) => [node, x[i]]));
  const branchI = new Map(branches.map((c, k) => [c.id, x[n + k]]));
  return { nodeV, branchI, nodes };
}

function makeVoltageGetter(nodeV: Map<string, number>, grounds: ReadonlySet<string>) {
  return (node: string): number => {
    if (grounds.has(node)) return 0;
    const v = nodeV.get(node);
    if (v === undefined) throw new Error(`nó desconhecido: "${node}"`);
    return v;
  };
}

function makeCurrentGetter(
  components: Components,
  nodeV: Map<string, number>,
  branchI: Map<string, number>,
  grounds: ReadonlySet<string>,
) {
  const byId = new Map(components.map((c) => [c.id, c]));
  const v = makeVoltageGetter(nodeV, grounds);
  return (id: string): number => {
    const c = byId.get(id);
    if (!c) throw new Error(`componente desconhecido: "${id}"`);
    if (c.kind === 'resistor') return (v(c.a) - v(c.b)) / c.ohms;
    if (c.kind === 'vsource') return branchI.get(id)!;
    if (branchI.has(id)) return branchI.get(id)!; // capacitor travado em t = 0
    return 0; // capacitor em regime permanente = circuito aberto
  };
}

/**
 * Resolve o regime permanente (DC): capacitores abertos, indutores curtos (não há).
 * `grounds` permite mais de um nó de referência — cada parte isolada do circuito
 * tem tensão absoluta indefinida e ganha a sua própria (isso evita matriz singular
 * numa montagem ainda pela metade, sem introduzir resistências fictícias).
 */
export function solveDC(components: Components, grounds: Grounds = [GND]): Solution {
  validate(components);
  const set = new Set<string>(grounds);
  set.add(GND);
  const { nodeV, branchI } = solveMna(components, new Map(), set);
  return {
    voltage: makeVoltageGetter(nodeV, set),
    current: makeCurrentGetter(components, nodeV, branchI, set),
  };
}

/**
 * Simula o transitório com Euler implícito (companion model do capacitor).
 * Incondicionalmente estável: não "explode" com dt grande (só fica impreciso).
 * Em t = 0 cada capacitor é travado na condição inicial (tensão é contínua).
 */
export function simulate(
  components: Components,
  opts: TransientOptions,
  grounds: Grounds = [GND],
): TransientResult {
  validate(components);
  const { seconds, dt, initialV = {} } = opts;
  if (!(dt > 0)) throw new Error('dt deve ser > 0');
  if (!(seconds > 0)) throw new Error('seconds deve ser > 0');

    const gnds = new Set<string>(grounds);
    gnds.add(GND);
    const caps = components.filter((c): c is Capacitor => c.kind === 'capacitor');
  // v anterior de cada capacitor (sentido a → b)
  const prev = new Map(caps.map((c) => [c.id, initialV[c.id] ?? 0]));
  const nodeSet = new Set<string>();
  for (const c of components) {
    if (!gnds.has(c.a)) nodeSet.add(c.a);
    if (!gnds.has(c.b)) nodeSet.add(c.b);
  }
  const nodes = [...nodeSet].sort();

  const steps = Math.max(1, Math.round(seconds / dt));
  const t: number[] = [];
  const histV = new Map<string, number[]>(nodes.map((n) => [n, []]));
  const histI = new Map<string, number[]>(components.map((c) => [c.id, []]));

  for (let s = 0; s <= steps; s++) {
    const eq = new Map<string, CapModel>(
      caps.map((c) => {
        const vab = prev.get(c.id) ?? 0; // tensão no sentido a → b
        return s === 0
          ? // t = 0: capacitor travado na condição inicial (o ramo exige v(b) − v(a)).
            [c.id, { kind: 'clamp', volts: -vab }]
          : [c.id, { kind: 'companion', g: c.farads / dt, i: (c.farads / dt) * vab }];
      }),
    );
    const { nodeV, branchI } = solveMna(components, eq, gnds);
    const v = makeVoltageGetter(nodeV, gnds);

    t.push(s * dt);
    for (const c of components) {
      const diff = v(c.a) - v(c.b);
      let amps: number;
      if (c.kind === 'resistor') amps = diff / c.ohms;
      else if (c.kind === 'vsource') amps = branchI.get(c.id)!;
      else {
        const model = eq.get(c.id)!;
        amps =
          model.kind === 'clamp'
            ? branchI.get(c.id)! // corrente que entra no capacitor para mantê-lo travado
            : model.g * (diff - (prev.get(c.id) ?? 0));
      }
      histI.get(c.id)!.push(amps);
      if (c.kind === 'capacitor') prev.set(c.id, diff); // v do passo atual vira a histórica
    }
    for (const node of nodes) histV.get(node)!.push(v(node));
  }

  return {
    t,
    voltage: (node) => {
      if (gnds.has(node)) return new Array<number>(t.length).fill(0);
      const h = histV.get(node);
      if (!h) throw new Error(`nó desconhecido: "${node}"`);
      return h;
    },
    current: (id) => {
      const h = histI.get(id);
      if (!h) throw new Error(`componente desconhecido: "${id}"`);
      return h;
    },
  };
}
