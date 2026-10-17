import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alternarTema,
  aplicarTema,
  assinarTema,
  CHAVE_TEMA,
  iniciarTema,
  reiniciarTema,
  temaAtual,
  temaInicial,
  temaValido,
  trocarTema,
} from './theme';

/** Um `<html>` de mentira: só o que `aplicarTema` toca. */
function raizFalsa() {
  const dataset: Record<string, string> = {};
  const style: Record<string, string> = {};
  return { dataset, style } as unknown as HTMLElement;
}

/** Um `localStorage` de mentira, com o que já estava guardado e o que foi gravado. */
function storageFalso(inicial: string | null = null) {
  const gravados: [string, string][] = [];
  const store = {
    getItem: (k: string) => (k === CHAVE_TEMA ? inicial : null),
    setItem: (k: string, v: string) => gravados.push([k, v]),
  };
  return { store, gravados };
}

afterEach(() => {
  vi.unstubAllGlobals();
  reiniciarTema();
});

describe('tema — funções puras', () => {
  it('aceita só claro/escuro: storage é texto livre e pode vir podre', () => {
    expect(temaValido('claro')).toBe('claro');
    expect(temaValido('escuro')).toBe('escuro');
    expect(temaValido('Claro')).toBeNull();
    expect(temaValido('')).toBeNull();
    expect(temaValido(null)).toBeNull();
    expect(temaValido(undefined)).toBeNull();
    expect(temaValido('{"tema":"claro"}')).toBeNull();
  });

  it('a escolha do aluno vence o sistema', () => {
    expect(temaInicial('claro', false)).toBe('claro');
    expect(temaInicial('escuro', true)).toBe('escuro');
  });

  it('sem escolha, segue o sistema — PC no claro não leva painel escuro na cara', () => {
    expect(temaInicial(null, true)).toBe('claro');
    expect(temaInicial(null, false)).toBe('escuro');
    expect(temaInicial('podre', true)).toBe('claro');
  });

  it('alternar só troca entre os dois e volta ao começo', () => {
    expect(alternarTema('claro')).toBe('escuro');
    expect(alternarTema('escuro')).toBe('claro');
    expect(alternarTema(alternarTema('claro'))).toBe('claro');
  });

  it('aplicar escreve os DOIS sinais no <html>: data-theme (pinta) e color-scheme (campos nativos)', () => {
    const raiz = raizFalsa();
    aplicarTema('claro', raiz);
    expect((raiz as unknown as { dataset: Record<string, string> }).dataset.theme).toBe('claro');
    expect((raiz.style as unknown as Record<string, string>).colorScheme).toBe('light');
    aplicarTema('escuro', raiz);
    expect((raiz as unknown as { dataset: Record<string, string> }).dataset.theme).toBe('escuro');
    expect((raiz.style as unknown as Record<string, string>).colorScheme).toBe('dark');
  });
});

describe('tema — o boot e o botão', () => {
  it('o boot aplica o que estava guardado, sem passar pelo React', () => {
    vi.stubGlobal('localStorage', storageFalso('claro').store);
    const raiz = raizFalsa();
    expect(iniciarTema(raiz)).toBe('claro');
    expect((raiz as unknown as { dataset: Record<string, string> }).dataset.theme).toBe('claro');
    expect(temaAtual()).toBe('claro');
  });

  it('storage bloqueado (aba privada) não derruba o boot: cai no tema do sistema', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const raiz = raizFalsa();
    expect(iniciarTema(raiz)).toBe('claro');
  });

  it('trocar alterna, aplica no documento, grava e avisa os ouvintes', () => {
    const { store, gravados } = storageFalso(null);
    vi.stubGlobal('localStorage', store);
    vi.stubGlobal('document', { documentElement: raizFalsa() });
    reiniciarTema();

    let avisos = 0;
    const parar = assinarTema(() => {
      avisos++;
    });

    expect(temaAtual()).toBe('escuro');
    expect(trocarTema()).toBe('claro');
    expect(grava(gravados)).toEqual([CHAVE_TEMA, 'claro']);
    expect(avisos).toBe(1);
    expect(temaAtual()).toBe('claro');

    // quem cancelou não é mais avisado
    parar();
    expect(trocarTema()).toBe('escuro');
    expect(avisos).toBe(1);
    expect(gravados).toEqual([
      [CHAVE_TEMA, 'claro'],
      [CHAVE_TEMA, 'escuro'],
    ]);
  });
});

/** O último par gravado no storage de mentira. */
const grava = (gravados: [string, string][]) => gravados[gravados.length - 1];
