import type { ReactElement, ReactNode } from 'react';
import type { CompKind } from '../core/netlist';

/**
 * ÍCONES — desenhados à mão em SVG, sem biblioteca e sem asset externo.
 *
 * Regras de desenho (é o que mantém o conjunto com a mesma cara):
 * - grade de 24 × 24, traço de 1,7 na cor do texto (`currentColor`);
 * - nada de preenchimento: o ícone é recolorido pelo tema, sem variante escura;
 * - canto arredondado e ponta redonda (`stroke-linecap/linejoin`);
 * - `aria-hidden`: o ícone NUNCA é a informação — quem lê em voz alta é o
 *   rótulo de texto (nome do componente, título da seção). Ícone é enfeite
 *   com função de reconhecimento rápido.
 *
 * Os ícones de componente seguem o SÍMBOLO CLÁSSICO dos livros (pilha, zigue,
 * placas do capacitor, chave faca, terra em três traços) para o aluno ligar a
 * peça da tela à figura do caderno.
 */

export interface IcoProps {
  /** Lado em px (a altura da linha de texto ao lado costuma ser 20). */
  size?: number;
  className?: string;
}

function Base({ size = 20, className, children }: IcoProps & { children: ReactNode }): ReactElement {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* ---------- peças da bancada (o símbolo do livro) ---------- */

/** Pilha: placas longa/curta e os terminais + e −. */
export const IcoFonte = (p: IcoProps) => (
  <Base {...p}>
    <path d="M3 12h4M17 12h4" />
    <path d="M7 7v10M10 9.5v5" />
    <path d="M14 9.5v5M17 7v10" />
    <path d="M11.4 5.2h1.2M12 4.6v1.2" opacity="0.9" />
  </Base>
);

/** Resistor: o zigue do esquemático. */
export const IcoResistor = (p: IcoProps) => (
  <Base {...p}>
    <path d="M2 12h3l1.8-4 2.4 8 2.4-8 2.4 8 1.8-4h4.2" />
  </Base>
);

/** Capacitor: duas placas iguais — o desenho que separa carga. */
export const IcoCapacitor = (p: IcoProps) => (
  <Base {...p}>
    <path d="M3 12h6M15 12h6" />
    <path d="M10 6.5v11M14 6.5v11" />
    <path d="M9 4.4v1.1M15 4.4v1.1" opacity="0.9" />
  </Base>
);

/** Lâmpada: bulbo, casquilho e os raios de luz. */
export const IcoLampada = (p: IcoProps) => (
  <Base {...p}>
    <path d="M9.2 15.5a5.2 5.2 0 1 1 5.6 0v1.6H9.2v-1.6Z" />
    <path d="M9.6 20h4.8" />
    <path d="M19.6 4.9 20.6 3.9M4.4 4.9 3.4 3.9M21.4 11h1.2M1.4 11h1.2" opacity="0.85" />
  </Base>
);

/** Chave: a faca levantada, como no livro. */
export const IcoChave = (p: IcoProps) => (
  <Base {...p}>
    <path d="M3 16h4M17 16h4" />
    <path d="M7 16 16.4 8.2" />
    <path d="M7 13.6v4.8M17 13.6v4.8" />
    <circle cx="7" cy="16" r="1.1" />
    <circle cx="17" cy="16" r="1.1" />
  </Base>
);

/** Terra: os três traços que encolhem. */
export const IcoTerra = (p: IcoProps) => (
  <Base {...p}>
    <path d="M12 3v9" />
    <path d="M5 12h14M7.5 15.5h9M10 19h4" />
  </Base>
);

/** Fio: o traço que liga (com o nó no meio). */
export const IcoFio = (p: IcoProps) => (
  <Base {...p}>
    <path d="M2 12h5M17 12h5" />
    <circle cx="12" cy="12" r="2.4" />
  </Base>
);

/* ---------- o app ---------- */

/** A bancada: o quadro com o traço do circuito e a lâmpada acesa. */
export const IcoBancada = (p: IcoProps) => (
  <Base {...p}>
    <rect x="2.6" y="4.6" width="18.8" height="14" rx="2.4" />
    <path d="M6.2 8.8h3.4M6.2 12h5.8M6.2 15.2h3.4" />
    <circle cx="16.8" cy="11.4" r="2.3" />
    <path d="M16.8 7.8v1.3M20.2 8.6l-.9.9M13.4 8.6l.9.9" opacity="0.85" />
  </Base>
);

/** Medições: mostrador com ponteiro (o "instrumento" da bancada). */
export const IcoMedir = (p: IcoProps) => (
  <Base {...p}>
    <path d="M3.6 18a9.5 9.5 0 1 1 16.8 0" />
    <path d="M12 18 16 11" />
    <circle cx="12" cy="18" r="1.3" />
  </Base>
);

/** Desafio: alvo com flecha. */
export const IcoAlvo = (p: IcoProps) => (
  <Base {...p}>
    <circle cx="11" cy="13" r="7.5" />
    <circle cx="11" cy="13" r="3" />
    <path d="M16.4 7.6 21 3M21 3h-4.2M21 3v4.2" />
  </Base>
);

/** Questão da aula: o ponto de interrogação na lousa. */
export const IcoPergunta = (p: IcoProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.4 9.2a2.7 2.7 0 1 1 3.6 2.5c-.7.3-1 .9-1 1.7v.4" />
    <circle cx="12" cy="17" r="0.35" fill="currentColor" stroke="none" />
  </Base>
);

/** Nó: três ramos chegando no mesmo ponto (1ª lei). */
export const IcoNo = (p: IcoProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="2.2" />
    <path d="M12 9.8V4M9.8 12H4M14.2 12H20" />
  </Base>
);

/** Malha: a volta fechada com a seta do percurso (2ª lei). */
export const IcoMalha = (p: IcoProps) => (
  <Base {...p}>
    <rect x="4" y="5.5" width="16" height="13" rx="2.5" />
    <path d="M8.6 15.2h5.2" />
    <path d="m13.8 15.2-1.9-1.9M13.8 15.2l-1.9 1.9" />
  </Base>
);

/** Carga/descarga: a exponencial com a marca do τ. */
export const IcoTau = (p: IcoProps) => (
  <Base {...p}>
    <path d="M3 20h18M3 20V4" />
    <path d="M4 19c3.4-.2 6.6-2.6 8.4-6.2C14.2 9.4 16 7 20 6.6" />
    <path d="M9.5 19V7.6" strokeDasharray="2.6 2.4" />
  </Base>
);

/** Editar: o lápis. */
export const IcoLapis = (p: IcoProps) => (
  <Base {...p}>
    <path d="M4 20h4.2L20 8.2a2.1 2.1 0 0 0-3-3L5.2 17 4 20Z" />
    <path d="M15.4 6.6l2.9 2.9" />
  </Base>
);

/** Mãos: a palma com a pinça. */
export const IcoMao = (p: IcoProps) => (
  <Base {...p}>
    <path d="M9 12V5.6a1.4 1.4 0 0 1 2.8 0V11" />
    <path d="M11.8 11V4.9a1.4 1.4 0 0 1 2.8 0V11" />
    <path d="M14.6 11.2V6.8a1.4 1.4 0 0 1 2.8 0v6.4c0 3.5-2.2 6.3-5.4 6.3-2.3 0-3.7-1-4.9-2.6L5.6 14a1.4 1.4 0 0 1 2.3-1.6L9 13.6" />
  </Base>
);

/** Desfazer: a flecha que volta. */
export const IcoDesfazer = (p: IcoProps) => (
  <Base {...p}>
    <path d="M4 9h9.4a5.6 5.6 0 0 1 0 11.2H8" />
    <path d="m7.6 5.4L4 9l3.6 3.6" />
  </Base>
);

/** Aviso: o triângulo com a exclamação. */
export const IcoAlerta = (p: IcoProps) => (
  <Base {...p}>
    <path d="M12 3.8 21 20H3l9-16.2Z" />
    <path d="M12 10v4.2" />
    <circle cx="12" cy="17" r="0.35" fill="currentColor" stroke="none" />
  </Base>
);

/** Aprovado: o visto no círculo. */
export const IcoOk = (p: IcoProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.4 2.7 2.6L16 9.4" />
  </Base>
);

/** Sol — o tema claro. */
export const IcoSol = (p: IcoProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.2M12 19.2v2.2M4.3 4.3l1.6 1.6M18.1 18.1l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.3 19.7l1.6-1.6M18.1 5.9l1.6-1.6" />
  </Base>
);

/** Lua — o tema escuro. */
export const IcoLua = (p: IcoProps) => (
  <Base {...p}>
    <path d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4Z" />
  </Base>
);

/** Vista quadrada do quadro (o botão 2D). */
export const Ico2d = (p: IcoProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2.5" />
    <path d="M9 12h6M12 9v6" opacity="0.75" />
  </Base>
);

/** Cubo (o botão 3D). */
export const Ico3d = (p: IcoProps) => (
  <Base {...p}>
    <path d="M12 3.4 20 7.7v8.6L12 20.6 4 16.3V7.7l8-4.3Z" />
    <path d="M4 7.7 12 12l8-4.3M12 12v8.6" />
  </Base>
);

/** Cor por tensão: gotas de tinta. */
export const IcoCores = (p: IcoProps) => (
  <Base {...p}>
    <path d="M12 3.5c3.1 3.6 4.7 6.2 4.7 8.2a4.7 4.7 0 0 1-9.4 0c0-2 1.6-4.6 4.7-8.2Z" />
  </Base>
);

/** Corrente nos fios: a gota em movimento com as ondas. */
export const IcoCorrente = (p: IcoProps) => (
  <Base {...p}>
    <path d="M2 9.5c2.6-2.6 5.4 2.6 8 0s5.4 2.6 8 0M2 14.5c2.6-2.6 5.4 2.6 8 0s5.4 2.6 8 0" />
  </Base>
);

/** Lixeira. */
export const IcoLixeira = (p: IcoProps) => (
  <Base {...p}>
    <path d="M4 7h16M9.5 7V4.8h5V7M6.4 7l.9 12.2h9.4L17.6 7" />
    <path d="M10.2 10.6v5.6M13.8 10.6v5.6" opacity="0.7" />
  </Base>
);

/** Zoom +/−: a lupa com o sinal. */
export const IcoMais = (p: IcoProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IcoMenos = (p: IcoProps) => (
  <Base {...p}>
    <path d="M5 12h14" />
  </Base>
);

/** Enquadrar: as quatro setas para dentro. */
export const IcoEnquadrar = (p: IcoProps) => (
  <Base {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    <rect x="9.4" y="9.4" width="5.2" height="5.2" rx="1.3" opacity="0.75" />
  </Base>
);

/** Compartilhar: o nó que se abre em três (link/QR). */
export const IcoCompartilhar = (p: IcoProps) => (
  <Base {...p}>
    <circle cx="18" cy="5.6" r="2.6" />
    <circle cx="6" cy="12" r="2.6" />
    <circle cx="18" cy="18.4" r="2.6" />
    <path d="m8.3 10.7 7.4-3.8M8.3 13.3l7.4 3.8" />
  </Base>
);

/** Espelhar: quadro pequeno projetando no grande. */
export const IcoEspelho = (p: IcoProps) => (
  <Base {...p}>
    <rect x="2.6" y="4.6" width="10" height="7.4" rx="1.6" />
    <path d="M7.6 12v1.6M5.6 15.4h4" />
    <path d="M15.4 8.6h6v10.8h-6z" opacity="0.85" />
  </Base>
);

/** Baixar arquivo (CSV/JSON). */
export const IcoBaixar = (p: IcoProps) => (
  <Base {...p}>
    <path d="M12 3.6v11M7.6 10.2 12 14.6l4.4-4.4M4.4 19.6h15.2" />
  </Base>
);

/** Ajuda: o livro aberto. */
export const IcoAjuda = (p: IcoProps) => (
  <Base {...p}>
    <path d="M3.4 5.2h6.2c1.3 0 2.4.7 2.4 1.8v11c0-1.1-1.1-1.8-2.4-1.8H3.4V5.2Z" />
    <path d="M20.6 5.2h-6.2c-1.3 0-2.4.7-2.4 1.8v11c0-1.1 1.1-1.8 2.4-1.8h6.2V5.2Z" />
  </Base>
);

/**
 * A carinha de cada tipo de componente — a mesma do painel, dos trilhos e do
 * relatório. `Record<CompKind, …>`: esquecer um tipo novo não compila.
 */
export const KIND_ICON: Record<CompKind, (p: IcoProps) => ReactElement> = {
  vsource: IcoFonte,
  resistor: IcoResistor,
  capacitor: IcoCapacitor,
  lamp: IcoLampada,
  switch: IcoChave,
  ground: IcoTerra,
};

/** Todos os ícones, para os testes varrerem de uma vez. */
export const ICONES = {
  IcoBancada,
  IcoFonte,
  IcoResistor,
  IcoCapacitor,
  IcoLampada,
  IcoChave,
  IcoTerra,
  IcoFio,
  IcoMedir,
  IcoAlvo,
  IcoPergunta,
  IcoNo,
  IcoMalha,
  IcoTau,
  IcoLapis,
  IcoMao,
  IcoDesfazer,
  IcoAlerta,
  IcoOk,
  IcoSol,
  IcoLua,
  Ico2d,
  Ico3d,
  IcoCores,
  IcoCorrente,
  IcoLixeira,
  IcoMais,
  IcoMenos,
  IcoEnquadrar,
  IcoCompartilhar,
  IcoEspelho,
  IcoBaixar,
  IcoAjuda,
} as const;
