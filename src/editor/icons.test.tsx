import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CompKind } from '../core/netlist';
import { ICONES, KIND_ICON } from './icons';

const KINDS: CompKind[] = ['vsource', 'resistor', 'capacitor', 'lamp', 'switch', 'ground'];

describe('ícones — desenhados à mão, sem biblioteca e sem asset', () => {
  it('todo ícone sai como SVG decorativo: quem lê em voz alta é o texto ao lado', () => {
    for (const [nome, Ico] of Object.entries(ICONES)) {
      const svg = renderToStaticMarkup(<Ico />);
      expect(svg, nome).toContain('<svg');
      expect(svg, nome).toContain('aria-hidden="true"');
      expect(svg, nome).toContain('stroke="currentColor"'); // recolore com o tema
      expect(svg, nome).not.toContain('<text'); // nada de letra dentro do ícone
      expect(svg, nome).toContain('</svg>');
    }
  });

  it('nenhum par de ícones é o mesmo desenho (copiar-colar acidental)', () => {
    const vistos = new Map<string, string>();
    for (const [nome, Ico] of Object.entries(ICONES)) {
      const svg = renderToStaticMarkup(<Ico />);
      const gemeo = vistos.get(svg);
      expect(gemeo, `${nome} e ${gemeo ?? '?'} têm o MESMO desenho`).toBeUndefined();
      vistos.set(svg, nome);
    }
    expect(vistos.size).toBe(Object.keys(ICONES).length);
  });

  it('o tamanho cabe na linha de texto e é ajustável por quem chama', () => {
    const padrao = renderToStaticMarkup(<ICONES.IcoMedir />);
    expect(padrao).toContain('width="20"');
    expect(padrao).toContain('height="20"');
    const grande = renderToStaticMarkup(<ICONES.IcoMedir size={22} />);
    expect(grande).toContain('width="22"');
  });

  it('toda peça da bancada tem a sua carinha (seis tipos, seis ícones)', () => {
    for (const k of KINDS) {
      const Ico = KIND_ICON[k];
      expect(Ico, k).toBeTypeOf('function');
      expect(renderToStaticMarkup(<Ico />), k).toContain('<svg');
    }
  });

  it('os ícones das peças são todos diferentes entre si (não trocar resistor com capacitor)', () => {
    const desenhos = KINDS.map((k) => {
      const Ico = KIND_ICON[k];
      return renderToStaticMarkup(<Ico />);
    });
    expect(new Set(desenhos).size).toBe(KINDS.length);
  });
});
