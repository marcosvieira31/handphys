import { useSyncExternalStore } from 'react';

/**
 * TEMA CLARO / ESCURO — a escolha do aluno, guardada no aparelho.
 *
 * A parte de CIMA é pura (testável sem navegador): normaliza o que veio do
 * storage e decide o tema de abertura. A parte de BAIXO é o único pedaço com
 * estado — um singleton minúsculo, do mesmo jeito que o `localChannel` do
 * espelho: o tema é uma propriedade do DOCUMENTO (o CSS inteiro pende de
 * `[data-theme]` em `<html>`), não do circuito, então ele NÃO entra no store
 * do editor nem viaja no link compartilhado.
 *
 * O tema é aplicado ANTES do React montar (ver `main.tsx`): sem isso, quem
 * escolheu o claro veria um piscar escuro a cada recarga.
 */

export type Tema = 'escuro' | 'claro';

/** Chave no `localStorage` — versionada para não colidir com nada antigo. */
export const CHAVE_TEMA = 'handphys.tema';

/** Aceita só o que é tema de verdade (storage é texto livre, pode vir podre). */
export function temaValido(v: unknown): Tema | null {
  return v === 'claro' || v === 'escuro' ? v : null;
}

/**
 * Tema de abertura: a escolha do aluno vence; sem escolha, segue o sistema
 * (quem usa o PC no claro não leva um painel escuro na cara na primeira aula).
 */
export function temaInicial(salvo: unknown, prefereClaro: boolean): Tema {
  return temaValido(salvo) ?? (prefereClaro ? 'claro' : 'escuro');
}

/** O outro tema. */
export function alternarTema(t: Tema): Tema {
  return t === 'claro' ? 'escuro' : 'claro';
}

/**
 * Escreve o tema no documento. `color-scheme` junto: é o que faz barra de
 * rolagem, campos nativos e seleção de texto acompanharem o tema.
 */
export function aplicarTema(t: Tema, raiz: HTMLElement): void {
  raiz.dataset.theme = t;
  raiz.style.colorScheme = t === 'claro' ? 'light' : 'dark';
}

/** Lê o que o aparelho tem hoje, sem explodir em navegador que bloqueia storage. */
function lerSalvo(): Tema | null {
  try {
    return temaValido(localStorage.getItem(CHAVE_TEMA));
  } catch {
    return null;
  }
}

function gravar(t: Tema): void {
  try {
    localStorage.setItem(CHAVE_TEMA, t);
  } catch {
    /* aba privada / storage bloqueado: o tema vale só nesta sessão */
  }
}

function prefereClaro(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

let atual: Tema = 'escuro';
const ouvintes = new Set<() => void>();

/** Aplica o tema inicial no documento. Chamado uma vez, no boot. */
export function iniciarTema(raiz: HTMLElement): Tema {
  atual = temaInicial(lerSalvo(), prefereClaro());
  aplicarTema(atual, raiz);
  return atual;
}

/** Alterna, aplica, grava e avisa quem está ouvindo (o botão e todas as telas). */
export function trocarTema(): Tema {
  atual = alternarTema(atual);
  gravar(atual);
  aplicarTema(atual, document.documentElement);
  for (const avisar of ouvintes) avisar();
  return atual;
}

export function temaAtual(): Tema {
  return atual;
}

export function assinarTema(avisar: () => void): () => void {
  ouvintes.add(avisar);
  return () => ouvintes.delete(avisar);
}

/** O tema atual, como estado do React (o botão e o SVG do quadro re-renderizam). */
export function useTema(): Tema {
  return useSyncExternalStore(assinarTema, temaAtual, () => 'escuro' as Tema);
}

/** Só para os testes: volta o singleton ao estado de "ainda não bootou". */
export function reiniciarTema(): void {
  atual = 'escuro';
  ouvintes.clear();
}
