import { describe, expect, it } from 'vitest';
import { TITULOS, viewDaHash } from './rotas';

describe('rotas do app (hash)', () => {
  it('sem hash, ou só barra, abre a bancada (a casa)', () => {
    expect(viewDaHash('')).toBe('bancada');
    expect(viewDaHash('#')).toBe('bancada');
    expect(viewDaHash('#/')).toBe('bancada');
  });

  it('reconhece espelho e ajuda (com os apelidos de gente)', () => {
    expect(viewDaHash('#/espelho')).toBe('espelho');
    expect(viewDaHash('#/ajuda')).toBe('ajuda');
    expect(viewDaHash('#/sala')).toBe('ajuda');
    expect(viewDaHash('#/inicio')).toBe('ajuda');
  });

  it('rota desconhecida cai na bancada (link podre não vira tela em branco)', () => {
    expect(viewDaHash('#/qualquercoisa')).toBe('bancada');
  });

  it('caixa não mata o link (alguém digita/#/ESPelho no chat)', () => {
    expect(viewDaHash('#/ESPelho')).toBe('espelho');
    expect(viewDaHash('#/Ajuda')).toBe('ajuda');
  });

  it('query dentro do hash não confunde a rota', () => {
    expect(viewDaHash('#/espelho?sala=K7QW3')).toBe('espelho');
  });

  it('cada vista tem seu título, todos distintos', () => {
    for (const v of ['bancada', 'espelho', 'ajuda'] as const) {
      expect(TITULOS[v]).toMatch(/^handphys/);
    }
    expect(new Set(Object.values(TITULOS)).size).toBe(3);
  });
});
