/**
 * OS NOMES DOS COMPONENTES — num lugar só.
 *
 * Cada peça da bancada tem um rótulo curto (`KIND_LABEL`, o que aparece nas
 * tabelas e no HUD do cardboard) e uma explicação de UMA linha (`KIND_HINT`,
 * o que a peça FAZ — para quem está começando). Antes disso o rótulo estava
 * copiado em cinco arquivos (painel, espelho, projeção, Kirchhoff e cardboard):
 * renomear um componente exigia acertar os cinco, e um deles sempre escapava.
 *
 * Módulo puro de propósito: o cardboard (vanilla, fora do React) também importa
 * daqui.
 */

import type { CompKind } from './netlist';

/** Rótulo curto: é o substantivo da peça ("Fonte", "Resistor"). */
export const KIND_LABEL: Record<CompKind, string> = {
  vsource: 'Fonte',
  resistor: 'Resistor',
  capacitor: 'Capacitor',
  lamp: 'Lâmpada',
  switch: 'Chave',
  ground: 'Terra',
};

/** O que a peça faz, em uma linha — para o aluno que está conhecendo. */
export const KIND_HINT: Record<CompKind, string> = {
  vsource: 'empurra a corrente: mantém a tensão entre os terminais',
  resistor: 'segura a corrente e derruba a tensão',
  capacitor: 'guarda carga: enche e esvazia com o tempo',
  lamp: 'acende mais quanto mais corrente passa',
  switch: 'abre e fecha o caminho',
  ground: 'o zero de referência (0 V)',
};
