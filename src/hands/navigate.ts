/**
 * MUNDO NA MÃO — a navegação de UMA mão (pura, testável).
 *
 * O defeito que isto resolve: toda a vista além do pan era de DUAS mãos
 * (afastar as mãos = zoom, girar a linha = giro). No AR uma das mãos segura o
 * celular e nunca aparece no quadro — o zoom morria; e no seletor de uma mão
 * ("Direita"/"Esquerda"/"Travar") o zoom e o giro morriam mesmo sem AR.
 *
 * A metáfora é UMA: com a pinça fechada no VAZIO o aluno "pegou o mundo". O
 * mesmo aperto tem três canais ortogonais:
 *
 *   - deslocar a mão (x,y) .......... pan        (o controller mede em px)
 *   - aproximar/afastar da câmera ... zoom       (aqui, pelo tamanho aparente)
 *   - girar a mão no plano .......... giro 3D    (aqui, pelo eixo da palma)
 *
 * Por que o tamanho aparente da palma (pulso→metacarpal) é o canal certo:
 *   1. fechar a pinça converge as PONTAS dos dedos, não a palma — a pinça não
 *      contamina o canal (é por isso que não se usa a distância 4×8);
 *   2. girar a mão NO PLANO preserva o tamanho dos dois pontos (giram juntos),
 *      então zoom e giro não brigam;
 *   3. a webcam não mede distância, mede aparência: perto do aparelho o número
 *      cresce. Mão para DENTRO da tela (para perto da lente) = entrar na cena =
 *      zoom in, que é o gesto que o aluno já conhece de empurrar a vista.
 *
 * O que este módulo NÃO faz: nada de pan (o controller já tem o pan da pinça no
 * vazio, em px) e nada de mexer no store — devolve o que mudou e quem chama
 * aplica (`applyZoom`/`applyRoll`). Sem DOM, sem câmera, testável em node.
 *
 * Os números são CONSERVADORES de propósito: são um ponto de partida para a
 * medição no aparelho de verdade (a automação não sente o gesto). O acumulador
 * (ratchet) é o que faz um movimento LENTO contar mesmo com zona morta: a
 * referência só anda quando um passo é de fato aplicado.
 */

export interface MundoFrame {
  /** Pinça fechada NO VAZIO (o mundo está na mão). Em alvo, nunca é 'grabbing'. */
  grabbing: boolean;
  /** Tamanho aparente da palma (pulso→metacarpal, fração da imagem). */
  size: number;
  /** Ângulo do eixo da palma NO ESPAÇO DA TELA (rad) — o que o aluno vê girar. */
  ang: number;
}

export interface MundoDelta {
  /** Fator multiplicativo do zoom (1 = nada). > 1 aproxima, < 1 afasta. */
  zoom: number;
  /** Giro da bancada em radianos (0 = nada). Só a vista 3D aplica. */
  roll: number;
}

export interface MundoConfig {
  /** Variação de tamanho aparente que dispara um passo de zoom (fração). */
  zoomDead?: number;
  /** Expoente tamanho→zoom (> 1 deixa o gesto mais curto). */
  zoomGain?: number;
  /** Trava por quadro do zoom (detecção que pula não arremessa a câmera). */
  zoomStep?: number;
  /** Giro mínimo para disparar um passo (rad). ~0,015 = 0,9°. */
  rollDead?: number;
  /** Trava por quadro do giro (rad). */
  rollStep?: number;
}

const DEFAULTS: Required<MundoConfig> = {
  zoomDead: 0.04,
  zoomGain: 1.25,
  zoomStep: 0.04,
  rollDead: 0.015,
  rollStep: 0.25,
};

const NEUTRO: MundoDelta = { zoom: 1, roll: 0 };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Ângulo no intervalo (-π, π]. */
function wrapPi(a: number): number {
  let d = a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

export class MundoNaMao {
  private readonly cfg: Required<MundoConfig>;
  /** Tamanho após o último passo APLICADO (a régua do ratchet). */
  private refSize: number | null = null;
  /** Ângulo após o último passo APLICADO. */
  private refAng: number | null = null;

  constructor(cfg: MundoConfig = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };
  }

  /** O gesto está com o comando agora? (status/painel; não muda a matemática) */
  get active(): boolean {
    return this.refSize !== null || this.refAng !== null;
  }

  /** Soltou, trocou de mão, de vista ou de câmera: recomeça do zero (sem salto). */
  reset(): void {
    this.refSize = null;
    this.refAng = null;
  }

  update(f: MundoFrame): MundoDelta {
    if (!f.grabbing) {
      this.reset();
      return NEUTRO;
    }

    let zoom = 1;
    if (Number.isFinite(f.size) && f.size > 0) {
      if (this.refSize === null) {
        this.refSize = f.size; // primeiro quadro: só fixa a régua
      } else {
        const r = f.size / this.refSize;
        if (Math.abs(r - 1) >= this.cfg.zoomDead) {
          const alvo = Math.pow(r, this.cfg.zoomGain);
          zoom = clamp(alvo, 1 - this.cfg.zoomStep, 1 + this.cfg.zoomStep);
          this.refSize = f.size; // passo aplicado: a régua anda junto
        }
      }
    } else {
      this.refSize = null; // amostra inválida: a próxima re-fixa a régua
    }

    let roll = 0;
    if (Number.isFinite(f.ang)) {
      if (this.refAng === null) {
        this.refAng = f.ang;
      } else {
        const d = wrapPi(f.ang - this.refAng);
        if (Math.abs(d) >= this.cfg.rollDead) {
          roll = clamp(d, -this.cfg.rollStep, this.cfg.rollStep);
          this.refAng = f.ang;
        }
      }
    } else {
      // eixo degenerado (palma vista de perfil): não é amostra de giro
      this.refAng = null;
    }

    return { zoom, roll };
  }
}
