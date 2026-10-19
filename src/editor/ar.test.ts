import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { arAtual, assinarAr, definirAr, reiniciarAr, trocarAr } from './ar';

describe('AR de bolso: a chave da vista', () => {
  it('nasce desligado: a câmera nunca abre sozinha ao entrar na bancada', () => {
    reiniciarAr();
    expect(arAtual()).toBe(false);
  });

  it('liga, desliga e inverte', () => {
    reiniciarAr();
    expect(definirAr(true)).toBe(true);
    expect(arAtual()).toBe(true);
    expect(definirAr(false)).toBe(false);
    expect(arAtual()).toBe(false);
    expect(trocarAr()).toBe(true);
  });

  it('quem ouve é avisado — e só quando o valor MUDA de verdade', () => {
    reiniciarAr();
    const ouvir = vi.fn();
    const desassinar = assinarAr(ouvir);
    definirAr(true);
    definirAr(true); // repetir o mesmo valor não é mudança
    trocarAr();
    expect(ouvir).toHaveBeenCalledTimes(2);
    desassinar();
    definirAr(true);
    expect(ouvir).toHaveBeenCalledTimes(2);
  });

  it('sair da sala não deixa lixo: desassinar tira o ouvinte e reiniciar zera tudo', () => {
    reiniciarAr();
    const ouvir = vi.fn();
    const desassinar = assinarAr(ouvir);
    desassinar();
    definirAr(true);
    expect(ouvir).not.toHaveBeenCalled();
    reiniciarAr();
    expect(arAtual()).toBe(false);
  });

  it('é do APARELHO, não do circuito: não existe no protocolo do espelho', () => {
    // Dois aparelhos olham o mesmo documento — um com a mesa de verdade atrás,
    // outro no projetor. Se o AR viajasse no fio, o projetor pediria câmera.
    const protocolo = readFileSync(new URL('../mirror/protocol.ts', import.meta.url), 'utf8');
    const transmissor = readFileSync(new URL('../mirror/transmitter.ts', import.meta.url), 'utf8');
    for (const fonte of [protocolo, transmissor]) {
      expect(fonte).not.toMatch(/['"`]ar['"`]/);
      expect(fonte).not.toMatch(/arAtual|definirAr|trocarAr/);
    }
  });
});
