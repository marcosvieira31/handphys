import { KIND_LABEL } from '../core/kinds';
import type { CircuitDoc, CompKind } from '../core/netlist';
import type { Selection } from './store';

/**
 * A DICA DO MOMENTO — uma frase, em cima do quadro, dizendo o que o gesto
 * seguinte vai fazer.
 *
 * A bancada tem vários modos escondidos no mesmo clique (item armado, fio na
 * mão, modo fio, peça segurada, chave que alterna no clique) e nenhum deles se
 * anunciava: o aluno armava o resistor, não via nada acontecer e clicava de
 * novo no trilho, desarmando. Aqui cada estado ganha a sua frase — o mesmo
 * papel do "status" de um programa de desenho. Função pura do estado.
 */
export interface EstadoDica {
  doc: CircuitDoc;
  placing: CompKind | null;
  wiring: boolean;
  draft: { moved: boolean } | null;
  grip: { moved: boolean } | null;
  selection: Selection | null;
  /** Aparelho de toque (sem teclado): a frase não cita tecla. */
  toque?: boolean;
}

export interface Dica {
  texto: string;
  /** `acao` = há um gesto em curso (destaque); `info` = orientação de repouso. */
  tom: 'acao' | 'info';
}

export function dicaDoMomento(s: EstadoDica): Dica | null {
  const t = !!s.toque;
  if (s.placing)
    return {
      tom: 'acao',
      texto: `${t ? 'Toque' : 'Clique'} no quadro onde a peça vai ficar: ${KIND_LABEL[s.placing]} (${
        t ? 'toque de novo no trilho para desistir' : 'Esc cancela'
      })`,
    };
  if (s.draft?.moved)
    return {
      tom: 'acao',
      texto: `Fio na mão: ${t ? 'toque' : 'clique'} na bolinha de outra peça para ligar (${
        t ? 'a Lixeira desiste' : 'Esc solta'
      })`,
    };
  if (s.draft) return { tom: 'acao', texto: 'Arraste até a bolinha de outra peça e solte para ligar' };
  if (s.wiring)
    return {
      tom: 'acao',
      texto: t
        ? 'Modo fio: toque numa bolinha (terminal) e depois noutra — Conectar de novo para sair'
        : 'Modo fio: clique numa bolinha (terminal) e depois noutra — F ou Esc para sair',
    };
  if (s.grip?.moved) return { tom: 'acao', texto: 'Solte onde quiser — os fios acompanham a peça' };
  if (!s.doc.comps.length) return null; // quadro vazio: quem fala é o convite do quadro
  if (s.selection?.kind === 'wire')
    return { tom: 'info', texto: t ? 'Fio selecionado: a Lixeira apaga' : 'Fio selecionado: Delete ou a Lixeira apaga' };
  if (s.selection?.kind === 'comp') {
    const c = s.doc.comps.find((k) => k.id === s.selection!.id);
    if (c?.kind === 'switch')
      return {
        tom: 'info',
        texto: `${t ? 'Toque' : 'Clique'} na chave para abrir/fechar · arraste para mover`,
      };
    if (c)
      return {
        tom: 'info',
        texto: t
          ? 'Arraste para mover · girar, apagar e mudar o valor ficam no Painel'
          : 'Arraste para mover · R gira · Delete apaga · o valor muda no painel',
      };
  }
  if (!s.doc.wires.length)
    return { tom: 'info', texto: 'Para ligar: arraste de uma bolinha (terminal) até a de outra peça' };
  return { tom: 'info', texto: `${t ? 'Toque' : 'Clique'} numa peça para ver tensão e corrente nela` };
}
