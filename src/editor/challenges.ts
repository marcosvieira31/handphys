import type { CircuitDoc, CompReading, Reading } from '../core/netlist';

/**
 * DESAFIOS com verificação automática (Fase 4).
 *
 * Um desafio é uma função **pura** sobre o que o solver já calcula: devolve
 * `null` quando o aluno conseguiu e uma frase curta e acionável enquanto não
 * conseguiu ("a chave está ABERTA — clique nela", "o nó mais alto está em
 * 6,00 V — precisava de 4,50 V"). Nada de estado escondido e nada de regra
 * que o próprio circuito contradiga: a mesma bancada avaliada duas vezes dá o
 * mesmo resultado, então cada desafio vira teste de unidade — e o professor
 * pode confiar na marcação.
 */
export interface Challenge {
  id: string;
  titulo: string;
  enunciado: string;
  /** `null` = conseguiu; string = o próximo passo, dito como dica. */
  check(doc: CircuitDoc, reading: Reading): string | null;
}

/** Folga de leitura. O solver é exato; a folga é para o aluno ler "0,09" e aceitar. */
const TOL_V = 0.02;
const TOL_A = 0.002;

const br = (n: number, casas = 2) => n.toFixed(casas).replace('.', ',');

const mA = (a: number) => {
  const v = Math.abs(a) * 1000;
  return `${(v < 10 ? v.toFixed(1) : Math.round(v).toString()).replace('.', ',')} mA`;
};

const quantos = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

/** Resistores LIGADOS (com os dois terminais em nós conhecidos). */
function ligados(r: Reading): CompReading[] {
  return r.comps.filter((c) => c.kind === 'resistor' && !!c.netB);
}

/** Agrupa componentes pelo PAR DE NÓS, sem ordem: mesmo par = mesmo galho. */
function porPar(rs: CompReading[]): CompReading[][] {
  const mapa = new Map<string, CompReading[]>();
  for (const c of rs) {
    const k = [c.netA, c.netB ?? ''].sort().join(' × ');
    const g = mapa.get(k) ?? [];
    g.push(c);
    mapa.set(k, g);
  }
  return [...mapa.values()];
}

/** O maior grupo com a MESMA chave (`chave` deixa o critério à mostra). */
function maiorGrupo<T>(xs: T[], chave: (x: T) => string): T[] {
  const mapa = new Map<string, T[]>();
  for (const x of xs) {
    const k = chave(x);
    const g = mapa.get(k) ?? [];
    g.push(x);
    mapa.set(k, g);
  }
  return [...mapa.values()].sort((a, b) => b.length - a.length)[0] ?? [];
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'lampada',
    titulo: 'Acenda a lâmpada',
    enunciado: 'Uma fonte e uma lâmpada ligadas: a lâmpada tem de acender.',
    check: (doc, r) => {
      if (!doc.comps.some((c) => c.kind === 'vsource'))
        return 'Falta a fonte — pegue "Fonte" no trilho e clique no quadro.';
      if (!doc.comps.some((c) => c.kind === 'lamp'))
        return 'Falta a lâmpada — pegue "Lâmpada" no trilho.';
      if (r.error) return r.error;
      if (!r.comps.some((c) => c.kind === 'lamp' && c.glow > 0))
        return 'A lâmpada continua apagada: ligue os DOIS terminais dela aos da fonte (um fio de cada lado).';
      return null;
    },
  },
  {
    id: 'lei-de-ohm',
    titulo: 'Lei de Ohm',
    enunciado: 'Ligue uma fonte de 9 V a um resistor de 100 Ω — a corrente tem de ser 90 mA.',
    check: (doc, r) => {
      if (!doc.comps.some((c) => c.kind === 'vsource')) return 'Falta a fonte.';
      const alvos = doc.comps.filter((c) => c.kind === 'resistor' && Math.abs(c.value - 100) < 1e-9);
      if (!alvos.length)
        return 'Falta o resistor de 100 Ω — selecione um resistor e ajuste o Valor no painel.';
      if (r.error) return r.error;
      for (const alvo of alvos) {
        const rd = r.comps.find((c) => c.id === alvo.id);
        if (rd && Math.abs(Math.abs(rd.amps) - 0.09) < TOL_A) return null;
      }
      const rd = r.comps.find((c) => alvos.some((x) => x.id === c.id));
      return `O resistor de 100 Ω está com ${mA(rd?.amps ?? 0)} — 9 V em 100 Ω dá 90 mA. Falta tensão ou falta fechar o circuito.`;
    },
  },
  {
    id: 'divisor',
    titulo: 'Divisor de tensão',
    enunciado: 'Monte um divisor e faça um nó do circuito ficar com exatamente 4,50 V.',
    check: (doc, r) => {
      if (r.error) return r.error;
      if (doc.comps.filter((c) => c.kind === 'resistor').length < 2)
        return 'Um divisor é a fonte e DOIS resistores em série — faltam resistores.';
      if (r.nodes.some((n) => Math.abs(Math.abs(n.volts) - 4.5) < TOL_V)) return null;
      const altos = r.nodes
        .filter((n) => Math.abs(n.volts) > 0.01)
        .sort((a, b) => Math.abs(b.volts) - Math.abs(a.volts));
      return `O nó mais alto está em ${br(Math.abs(altos[0]?.volts ?? 0))} V — precisava de 4,50 V (a metade dos 9 V).`;
    },
  },
  {
    id: 'paralelo',
    titulo: 'Três em paralelo',
    enunciado: 'Ligue três resistores entre os MESMOS dois nós — cada um com o seu caminho.',
    check: (doc, r) => {
      const qtd = doc.comps.filter((c) => c.kind === 'resistor').length;
      if (qtd < 3) return `Só ${quantos(qtd, 'resistor', 'resistores')} na bancada — são precisos 3.`;
      if (r.error) return r.error;
      const max = Math.max(0, ...porPar(ligados(r)).map((g) => g.length));
      if (max >= 3) return null;
      return `O maior grupo entre o MESMO par de nós tem ${quantos(
        max,
        'resistor',
        'resistores',
      )} — precisava de 3 ligados entre os mesmos dois nós.`;
    },
  },
  {
    id: 'serie',
    titulo: 'Três em série',
    enunciado: 'Faça a MESMA corrente atravessar três resistores, um depois do outro.',
    check: (doc, r) => {
      const qtd = doc.comps.filter((c) => c.kind === 'resistor').length;
      if (qtd < 3) return `Só ${quantos(qtd, 'resistor', 'resistores')} na bancada — são precisos 3.`;
      if (r.error) return r.error;
      const rs = ligados(r);
      // Só corrente de verdade conta: 0 A em três resistores soltos não é série.
      const conduzindo = rs.filter((c) => Math.abs(c.amps) > TOL_A);
      if (!conduzindo.length)
        return 'Nenhum resistor está vendo corrente — feche o circuito (fonte, fios e volta).';
      // Em série a corrente é a mesma nos três; em paralelo seria o mesmo PAR DE
      // NÓS. Os dois juntos (mesma corrente + pares distintos) é a série.
      const iguais = maiorGrupo(conduzindo, (c) => c.amps.toFixed(5));
      if (iguais.length < 3)
        return `Só ${quantos(iguais.length, 'resistor', 'resistores')} estão vendo a mesma corrente — em série os três têm de ver a mesma.`;
      if (porPar(iguais).length < 3)
        return 'Esses três compartilham nós: estão em paralelo, não em série.';
      return null;
    },
  },
  {
    id: 'chave',
    titulo: 'A chave',
    enunciado: 'Monte um circuito com uma chave e feche-a para a corrente passar.',
    check: (_doc, r) => {
      const chaves = r.comps.filter((c) => c.kind === 'switch');
      if (!chaves.length) return 'Falta a chave — pegue "Chave" no trilho.';
      if (r.error) return r.error;
      // A chave NÃO é componente do solver: fechada ela vira união dos dois nós
      // (netA = netB) e a corrente anda pelo resto do laço. Então "passa pela
      // chave" = os dois terminais num nó só + corrente em algum lugar do fio.
      const passa = chaves.some(
        (c) => c.netA === c.netB && r.comps.some((x) => Math.abs(x.amps) > TOL_A),
      );
      if (passa) return null;
      const fechada = chaves.some((c) => c.netA === c.netB);
      return fechada
        ? 'A chave está fechada mas não passa corrente: falta fechar o circuito em volta dela.'
        : 'A chave está ABERTA — clique nela (sem arrastar) para fechar.';
    },
  },
];

/** Índice por id — usado para validar o que vem pelo espelho (fio não confiável). */
export const CHALLENGE_IDS: ReadonlySet<string> = new Set(CHALLENGES.map((c) => c.id));

export function challengeById(id: string | null): Challenge | null {
  if (!id) return null;
  return CHALLENGES.find((c) => c.id === id) ?? null;
}

/** Avalia e separa "conseguiu" de "o que falta" — é o que a UI mostra. */
export function evaluateChallenge(
  ch: Challenge,
  doc: CircuitDoc,
  reading: Reading,
): { ok: boolean; dica: string | null } {
  const falta = ch.check(doc, reading);
  return { ok: falta === null, dica: falta };
}
