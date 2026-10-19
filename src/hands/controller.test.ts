import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definirAr, reiniciarAr } from '../editor/ar';
import { useEditor } from '../editor/store';
import { bindZoomTarget } from '../editor/zoom';
import { HandsController, cameraDasMaos, pontoNaTela, type HandPoint } from './controller';
import type { FrameHand } from './tracker';

/** Mão sintética: polegar e indicador onde se quer; a mão INTEIRA acompanha
 *  (movimento rígido — pulso e palma andam junto, como num braço de verdade;
 *  sem isso a mira travada na palma não acompanharia o arraste). */
function hand(side: string, tx: number, ix: number, y = 0.35): FrameHand {
  const pts = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const dx = tx - 0.8;
  pts[0] = { x: 0.5 + dx, y: 0.9, z: 0 };
  pts[9] = { x: 0.5 + dx, y: 0.5, z: 0 };
  pts[4] = { x: tx, y, z: 0 };
  pts[8] = { x: ix, y, z: 0 };
  return { side, pts, world: null };
}

// mira (já espelhada) => célula: grade 30x30 direta
const toCell = (p: HandPoint) => ({ x: Math.round(p.x * 29), y: Math.round(p.y * 29) });

/**
 * Mão sintética COMPACTA e ABERTA (razão 1,0) centrada em (cx,cy): serve para o
 * gesto de DUAS mãos. Identidade vem do centroide, então os dois centros ficam
 * a mais de 0,25 um do outro; e a pinça tem de ficar bem aberta para não virar
 * arraste no meio do gesto.
 */
function blob(side: string, cx: number, cy: number): FrameHand {
  const pts = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  pts[0] = { x: cx - 0.02, y: cy + 0.02, z: 0 };
  pts[9] = { x: cx - 0.02, y: cy - 0.02, z: 0 };
  pts[4] = { x: cx + 0.02, y: cy + 0.02, z: 0 };
  pts[8] = { x: cx + 0.02, y: cy - 0.02, z: 0 };
  return { side, pts, world: null };
}

/** A mesma mão compacta, mas com os dedos JÁ FECHADOS (razão ~0,25). */
function blobPinched(cx: number, cy: number, side = 'Left'): FrameHand {
  const h = blob(side, cx, cy);
  h.pts[4] = { x: cx + 0.01, y: cy + 0.005, z: 0 };
  h.pts[8] = { x: cx + 0.01, y: cy - 0.005, z: 0 };
  return h;
}

function resetDoc() {
  useEditor.setState({
    doc: {
      comps: [
        { id: 'bat1', kind: 'vsource', x: 4, y: 10, rot: 0, value: 9 },
        { id: 'lamp1', kind: 'lamp', x: 12, y: 10, rot: 0, value: 20 },
      ],
      wires: [],
    },
    placing: null,
    carry: null,
    wiring: false,
    draft: null,
    grip: null,
    selection: null,
    zoom: 1,
    pan: { x: 0, y: 0 },
    seq: 100,
    past: [],
  });
}

// costura de teste: mira fixa (sem DOM) na vista 2d + seletor no automático
// (o filtro persiste em localStorage e contaminaria os testes seguintes)
function wireUp(): HandsController {
  const ctl = new HandsController();
  ctl.setFilter('auto');
  ctl.bindSlot('2d', toCell);
  return ctl;
}

describe('HandsController sem câmera (ingest)', () => {
  beforeEach(resetDoc);

  // cursor em (5,10): meio não-espelhado (0,8167; 0,35) => polegar+indicador fechados
  const atBat = () => hand('Right', 0.8, 0.8334);
  const atMid = () => hand('Right', 0.72, 0.7534);
  const atLamp = () => hand('Right', 0.6, 0.6334);
  const openAtLamp = () => hand('Right', 0.45, 0.7867, 0.35);

  it('pinça fecha no terminal, arrasta e solta no alvo: cria o fio no store', () => {
    const ctl = wireUp();
    let now = 0;
    const feed = (h: FrameHand, n = 8) => {
      for (let i = 0; i < n; i++) {
        now += 33;
        ctl.ingest([h], 5, now);
      }
    };
    feed(atBat()); // fecha em (5,10): press => draft
    expect(useEditor.getState().draft).not.toBeNull();
    feed(atMid()); // move com aperto
    feed(atLamp()); // chega em (11,10)
    feed(openAtLamp(), 12); // abre de verdade: converge + 3 quadros de debounce => release => fio
    const after = useEditor.getState();
    expect(after.doc.wires).toHaveLength(1);
    expect(after.doc.wires[0]).toMatchObject({ from: { x: 5, y: 10 }, to: { x: 11, y: 10 } });
    expect(after.draft).toBeNull();
  });

  it('soltar com a mira em cima da LIXEIRA apaga o item que estava na mão', () => {
    const ctl = wireUp();
    // tudo em cima da tela "é" a lixeira: a soltura enxerga o alvo (o check é
    // de DOM — em node ele só existe graças a este stub)
    vi.stubGlobal('window', { innerWidth: 1000, innerHeight: 800 });
    vi.stubGlobal('document', {
      elementFromPoint: () => ({ closest: (sel: string) => (sel === '[data-hand="trash"]' ? {} : null) }),
    });
    try {
      let now = 0;
      const feed = (h: FrameHand, n = 8) => {
        for (let i = 0; i < n; i++) {
          now += 33;
          ctl.ingest([h], 5, now);
        }
      };
      feed(hand('Right', 0.57, 0.6)); // pinça no CORPO da lâmpada (12,10): segura
      expect(useEditor.getState().grip?.id).toBe('lamp1');
      feed(hand('Right', 0.72, 0.7534)); // leva para longe
      feed(hand('Right', 0.45, 0.7867), 12); // abre: solta em cima da lixeira
      const after = useEditor.getState();
      expect(after.doc.comps.find((c) => c.id === 'lamp1')).toBeUndefined();
      expect(after.doc.comps.find((c) => c.id === 'bat1')).toBeDefined(); // a fonte fica
      expect(after.grip).toBeNull();
      expect(after.selection).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('troca de etiqueta Left/Right no meio do arraste não reinicia o fio', () => {
    const ctl = wireUp();
    let now = 0;
    const feed = (h: FrameHand, n = 8) => {
      for (let i = 0; i < n; i++) {
        now += 33;
        ctl.ingest([h], 5, now);
      }
    };
    feed(hand('Left', 0.8, 0.8334)); // fecha em (5,10) como "Left": press
    expect(useEditor.getState().draft).not.toBeNull();
    feed(hand('Left', 0.72, 0.7534)); // move até (8,10)
    // o classificador troca a etiqueta com a mão parada: mesma posição, outro nome
    feed(hand('Right', 0.72, 0.7534));
    feed(hand('Right', 0.6, 0.6334)); // continua até (11,10) sem re-press
    feed(hand('Right', 0.45, 0.7867), 12); // abre: solta
    const after = useEditor.getState();
    expect(after.doc.wires).toHaveLength(1);
    // origem preservada da primeira pinçada (sem estabilidade, recomeçaria em (8,10))
    expect(after.doc.wires[0]).toMatchObject({ from: { x: 5, y: 10 }, to: { x: 11, y: 10 } });
  });

  it('mão que some agarrando solta o aperto depois da graça', () => {
    const ctl = wireUp();
    let now = 0;
    // fecha no CENTRO da lâmpada (12,10): segura o componente (grip)
    const atCenter = hand('Right', 0.5667, 0.6);
    for (let i = 0; i < 3; i++) {
      now += 33;
      ctl.ingest([atCenter], 5, now);
    }
    expect(useEditor.getState().grip?.id).toBe('lamp1');
    now += 500; // some por mais que a graça (400 ms)
    ctl.ingest([], 5, now);
    expect(useEditor.getState().grip).toBeNull();
  });

  it('BUG: dedos convergindo com a mão PARADA não deslocam a mira', () => {
    const ctl = wireUp();
    let now = 0;
    const feed = (h: FrameHand, n = 6) => {
      for (let i = 0; i < n; i++) {
        now += 33;
        ctl.ingest([h], 5, now);
      }
    };
    // mão ABERTA sobre a lâmpada: a mira é crua, no ponto médio dos dedos
    feed(hand('Right', 0.45, 0.7867));
    expect(ctl.getSnapshot().cursor).not.toBeNull();
    // a mão NÃO anda: só os dedos fecham (razão 0,84 -> 0,08)
    feed(hand('Right', 0.45, 0.4834));
    const travada = ctl.getSnapshot().cursor!;
    // e seguem fechando, ainda sem a mão andar
    feed(hand('Right', 0.45, 0.46));
    const depois = ctl.getSnapshot().cursor!;
    // os dedos andaram de verdade (sem a trava a mira escorreria junto) ...
    expect(1 - (0.45 + 0.46) / 2).not.toBeCloseTo(1 - (0.45 + 0.4834) / 2, 4);
    // ... e a mira ficou redondinha onde estava
    expect(depois.x).toBeCloseTo(travada.x, 6);
    expect(depois.y).toBeCloseTo(travada.y, 6);
  });

  it('mão INTEIRA andando durante a pinça move a mira (o arraste continua)', () => {
    const ctl = wireUp();
    let now = 0;
    const feed = (h: FrameHand, n = 14) => {
      for (let i = 0; i < n; i++) {
        now += 33;
        ctl.ingest([h], 5, now);
      }
    };
    feed(hand('Right', 0.45, 0.4834)); // já fechada: trava no 1º quadro
    const a = ctl.getSnapshot().cursor!;
    feed(hand('Right', 0.7, 0.7334)); // mesma pinça, o braço andou +0,25
    const b = ctl.getSnapshot().cursor!;
    // espelhado: andar p/ a direita na mão desloca a mira p/ a esquerda na tela
    expect(b.x).toBeCloseTo(a.x - 0.25, 2);
    expect(b.y).toBeCloseTo(a.y, 2);
  });

  it('status acompanha mãos e pinça', () => {
    const ctl = wireUp();
    ctl.ingest([atBat()], 5, 0);
    ctl.ingest([atBat()], 5, 33);
    const s = ctl.getSnapshot();
    expect(s.hands).toBe(1);
    expect(s.pinched).toEqual(['Right']);
  });

  it('calibração cola o limiar no teto da fechada (não no meio)', () => {
    const ctl = wireUp();
    ctl.startCalibration();
    let now = 0;
    // fase fechada (razão ~0,08) por 2,6 s
    for (let i = 0; i < 26; i++) {
      now += 100;
      ctl.ingest([hand('Right', 0.5, 0.5334)], 5, now);
    }
    expect(ctl.getSnapshot().calibrating?.phase).toBe('open');
    // fase aberta (razão ~0,84) por 2,6 s
    for (let i = 0; i < 26; i++) {
      now += 100;
      ctl.ingest([hand('Right', 0.33, 0.6668)], 5, now);
    }
    const s = ctl.getSnapshot();
    expect(s.calibrating).toBeNull();
    expect(s.error).toBeNull();
    // teto da fechada + 0,08 (bem abaixo do meio 0,46: responde sem exigir esmagar)
    expect(s.threshold).toBeGreaterThan(0.1);
    expect(s.threshold).toBeLessThan(0.3);
    expect(s.lastCalib).toMatch(/→/);
  });

  it('calibração sem separação MANTÉM o limiar antigo (não piora)', () => {
    const ctl = wireUp();
    ctl.startCalibration();
    let now = 0;
    for (let i = 0; i < 52; i++) {
      now += 100;
      ctl.ingest([hand('Right', 0.5, 0.5334)], 5, now); // sempre igual
    }
    const s = ctl.getSnapshot();
    expect(s.calibrating).toBeNull();
    expect(s.threshold).toBe(0.45);
    expect(s.error).toMatch(/separação|confusa|Nenhuma/i);
  });

  it('ajuste manual do limiar persiste na sessão', () => {
    const ctl = wireUp();
    ctl.nudgeThreshold(0.05);
    expect(ctl.getSnapshot().threshold).toBe(0.5);
    ctl.nudgeThreshold(-0.4);
    expect(ctl.getSnapshot().threshold).toBe(0.2); // trava no mínimo
  });

  it('prévia: anexa o elemento (mesmo montado depois) e limpa ao parar', () => {
    const ctl = wireUp();
    const fake = {
      muted: false,
      srcObject: null as unknown,
      play: () => Promise.resolve(),
    };
    ctl.attachPreview(fake as unknown as HTMLVideoElement);
    expect(fake.muted).toBe(true);
    ctl.attachPreview(null); // desmontou
    ctl.stop(); // sem câmera: não quebra e não deixa aperto
    expect(useEditor.getState().grip).toBeNull();
  });

  it('vista 3D tem prioridade sobre a 2D na mira da pinça', () => {
    const ctl = new HandsController();
    ctl.bindSlot('2d', () => ({ x: 1, y: 1 }));
    ctl.bindSlot('3d', () => ({ x: 7, y: 8 }));
    expect(ctl.resolveCell({ x: 0.5, y: 0.5 })).toEqual({ x: 7, y: 8 });
    ctl.unbindSlot('3d');
    expect(ctl.resolveCell({ x: 0.5, y: 0.5 })).toEqual({ x: 1, y: 1 });
  });

  it('sem vista aplicável a pinça não age (não quebra)', () => {
    const ctl = new HandsController();
    ctl.bindSlot('2d', () => null);
    expect(ctl.resolveCell({ x: 0.5, y: 0.5 })).toBeNull();
  });

  it('DUAS mãos abrindo dão zoom; juntando, afastam (gesto de zoom)', () => {
    const ctl = wireUp();
    let now = 0;
    // separação VERTICAL: os centroides ficam a mais de 0,25 (identidades distintas)
    const pair = (gap: number) => [
      blob('Right', 0.5, 0.5 - gap / 2),
      blob('Left', 0.5, 0.5 + gap / 2),
    ];
    const feed = (hs: FrameHand[], n = 3) => {
      for (let i = 0; i < n; i++) {
        now += 33;
        ctl.ingest(hs, 5, now);
      }
    };
    feed(pair(0.4)); // as duas mãos aparecem
    expect(useEditor.getState().zoom).toBe(1);
    for (let g = 0.45; g <= 0.62; g += 0.05) feed(pair(g)); // afasta
    const z = useEditor.getState().zoom;
    expect(z).toBeGreaterThan(1.5);
    for (let g = 0.6; g >= 0.4; g -= 0.05) feed(pair(g)); // junta
    expect(useEditor.getState().zoom).toBeLessThan(z);
  });

  describe('duas mãos completo: enquadramento e giro de Z', () => {
    afterEach(() => {
      bindZoomTarget(null);
      useEditor.setState({ view: '2d' });
      vi.unstubAllGlobals();
    });

    /** Par de mãos COMPACTAS a `gap` de distância, com o MEIO em `my`. */
    const pairAt = (gap: number, my: number, mx = 0.5): FrameHand[] => [
      blob('Right', mx, my - gap / 2),
      blob('Left', mx, my + gap / 2),
    ];

    const feeder = (ctl: HandsController) => {
      let now = 0;
      return (hs: FrameHand[], n = 3) => {
        for (let i = 0; i < n; i++) {
          now += 33;
          ctl.ingest(hs, 5, now);
        }
      };
    };

    it('o MEIO das mãos posiciona o enquadramento (vertical e horizontal)', () => {
      const ctl = wireUp();
      vi.stubGlobal('window', { innerWidth: 1000, innerHeight: 800 });
      const feed = feeder(ctl);
      feed(pairAt(0.4, 0.5)); // as duas mãos aparecem
      for (let g = 0.45; g <= 0.6; g += 0.05) feed(pairAt(g, 0.5)); // afasta => zoom > 1
      expect(useEditor.getState().zoom).toBeGreaterThan(1);
      const antes = { ...useEditor.getState().pan };
      // desce com o MEIO (distância fixa: zoom neutro, só o enquadramento anda)
      for (let my = 0.55; my <= 0.75; my += 0.05) feed(pairAt(0.6, my));
      const dep = useEditor.getState().pan;
      expect(dep.y).toBeLessThan(antes.y); // mãos p/ baixo: a vista olha mais p/ cima
      expect(dep.x).toBeCloseTo(antes.x, 1); // sem movimento lateral, nada muda em x
      // e o eixo horizontal: no CRUDO p/ a direita = no ESPPELHO (o que o
      // usuário vê) p/ a esquerda — o enquadramento anda em x do mesmo jeito
      const antesX = { ...useEditor.getState().pan };
      for (let mx = 0.54; mx <= 0.7; mx += 0.04) feed(pairAt(0.6, 0.75, mx));
      expect(useEditor.getState().pan.x).toBeGreaterThan(antesX.x);
    });

    it('a ROTAÇÃO das mãos gira o eixo Z na bancada 3D (mão horária leva o conteúdo)', () => {
      const ctl = wireUp();
      const rolls: number[] = [];
      const dollies: number[] = [];
      const pans: number[] = [];
      bindZoomTarget({
        dolly: (f) => dollies.push(f),
        panBy: (dx) => pans.push(dx),
        rollBy: (r) => rolls.push(r),
        frameTo: () => {},
        resetView: () => {},
      });
      useEditor.setState({ view: '3d' });
      const feed = feeder(ctl);
      // par girando ao redor do MEIO com distância FIXA (zoom neutro, meio parado):
      // horário no ESPPELHO (o que o usuário vê) = anti-horário no crudo (x vira 1-x)
      const R = 0.25;
      const spin = (alpha: number): FrameHand[] => [
        blob('Right', 0.5 + R * Math.cos(alpha), 0.5 + R * Math.sin(alpha)),
        blob('Left', 0.5 - R * Math.cos(alpha), 0.5 - R * Math.sin(alpha)),
      ];
      feed(spin(0)); // par aparece parado
      let alpha = 0;
      for (let i = 0; i < 12; i++) {
        alpha -= Math.PI / 18; // 10° por passo (cabe na trava por quadro)
        feed(spin(alpha), 2);
      }
      expect(rolls.length).toBeGreaterThan(0);
      expect(rolls.every((r) => r > 0)).toBe(true); // mão horária => rad > 0
      const total = rolls.reduce((s, r) => s + r, 0);
      expect(total).toBeGreaterThan(1.5); // ≈ 120° = 2,09 rad (a suavização lagging)
      expect(total).toBeLessThan(2.4);
      // a distância é fixa na conta crua; o que sobra é o tremor da suavização
      // (< 1%: nada visível) — nunca zoom de verdade durante o giro
      expect(dollies.every((f) => Math.abs(f - 1) < 0.01)).toBe(true);
      expect(pans.length).toBe(0); // meio fixo: enquadramento parado

      // no 2D o gesto continua vivo, mas o esquemático é diagrama e NÃO gira
      useEditor.setState({ view: '2d', zoom: 2, pan: { x: 0, y: 0 } });
      rolls.length = 0;
      for (let i = 0; i < 6; i++) {
        alpha -= Math.PI / 18;
        feed(spin(alpha), 2);
      }
      expect(rolls.length).toBe(0);
    });

    it('par trocado no meio do gesto não arremessa (sem salto de π)', () => {
      const ctl = wireUp();
      const rolls: number[] = [];
      bindZoomTarget({
        dolly: () => {},
        panBy: () => {},
        rollBy: (r) => rolls.push(r),
        frameTo: () => {},
        resetView: () => {},
      });
      useEditor.setState({ view: '3d' });
      const feed = feeder(ctl);
      const R = 0.25;
      const spin = (alpha: number): FrameHand[] => [
        blob('Right', 0.5 + R * Math.cos(alpha), 0.5 + R * Math.sin(alpha)),
        blob('Left', 0.5 - R * Math.cos(alpha), 0.5 - R * Math.sin(alpha)),
      ];
      feed(spin(0));
      let alpha = 0;
      for (let i = 0; i < 4; i++) {
        alpha -= Math.PI / 18;
        feed(spin(alpha), 2);
      }
      const antes = rolls.length;
      expect(antes).toBeGreaterThan(0);
      // uma mão some e outra chega LONGE (> 0,25 = id novo): o par é outro
      feed([spin(alpha)[0], blob('Left', 0.12, 0.15)], 1);
      expect(rolls.length).toBe(antes); // o quadro da troca não gira nada
      // o par novo firma e o gesto continua limpo (sem salto de π)
      for (let i = 0; i < 3; i++) {
        alpha -= Math.PI / 18;
        feed([spin(alpha)[0], blob('Left', 0.12, 0.15)], 2);
      }
      expect(rolls.length).toBeGreaterThan(antes); // o gesto recomeça limpo
      expect(rolls.every((r) => Math.abs(r) <= 0.25)).toBe(true); // nunca π de salto
    });
  });

  it('UMA mão só não mexe no zoom (não é gesto)', () => {
    const ctl = wireUp();
    let now = 0;
    for (let i = 0; i < 20; i++) {
      now += 33;
      ctl.ingest([blob('Right', 0.5, 0.2 + i * 0.02)], 5, now);
    }
    expect(useEditor.getState().zoom).toBe(1);
  });

  it('quem está PINÇANDO não dá zoom (está agarrando algo)', () => {
    const ctl = wireUp();
    let now = 0;
    const pinchBlob = (cy: number): FrameHand => {
      const h = blob('Left', 0.3, cy);
      h.pts[4] = { x: 0.3, y: cy + 0.005, z: 0 };
      h.pts[8] = { x: 0.3, y: cy - 0.005, z: 0 }; // razão ~0,25: pinçada
      return h;
    };
    const feed = (hs: FrameHand[], n = 3) => {
      for (let i = 0; i < n; i++) {
        now += 33;
        ctl.ingest(hs, 5, now);
      }
    };
    feed([blob('Right', 0.5, 0.2), pinchBlob(0.8)]);
    for (let g = 0.25; g <= 0.4; g += 0.05) feed([blob('Right', 0.5, g), pinchBlob(1 - g)]);
    expect(useEditor.getState().zoom).toBe(1);
  });

  it('diagnóstico: diz se a pinça tem profundidade (3D) ou só imagem (2D)', () => {
    const ctl = wireUp();
    ctl.ingest([atBat()], 5, 0);
    expect(ctl.getSnapshot().prof).toBe('2D'); // sem coordenadas de mundo
    // coordenadas de MUNDO (metros) => a razão passa a ter o eixo Z
    const world = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    world[9] = { x: 0, y: 0.09, z: 0 };
    world[4] = { x: 0.08, y: 0.09, z: 0 };
    world[8] = { x: 0.08, y: 0, z: 0 }; // d(4,8) == d(0,9): mão aberta
    ctl.ingest([{ ...atBat(), world }], 5, 33);
    expect(ctl.getSnapshot().prof).toBe('3D');
  });

  it('tamanho aparente é a profundidade que a webcam entrega (perto = maior)', () => {
    // mesma mão a 100% e a 40% do tamanho: o esqueleto tem de refletir isso
    const shrunk = () => {
      const h = hand('Right', 0.45, 0.7867);
      for (const p of h.pts) {
        p.x = 0.5 + (p.x - 0.5) * 0.4;
        p.y = 0.5 + (p.y - 0.5) * 0.4;
      }
      return h;
    };
    const perto = wireUp();
    const longe = wireUp();
    let now = 0;
    for (let i = 0; i < 8; i++) {
      now += 33;
      perto.ingest([hand('Right', 0.45, 0.7867)], 5, now);
      longe.ingest([shrunk()], 5, now);
    }
    const a = perto.drawFrame().hands[0]?.size ?? 0;
    const b = longe.drawFrame().hands[0]?.size ?? 0;
    expect(a).toBeGreaterThan(b * 2);
  });

  it('seletor em DIREITA: a mão esquerda não comanda nada', () => {
    const ctl = wireUp();
    ctl.setFilter('right');
    let now = 0;
    const feed = (hs: FrameHand[], n = 6) => {
      for (let i = 0; i < n; i++) {
        now += 33;
        ctl.ingest(hs, 5, now);
      }
    };
    // a ESQUERDA pinça em cima do terminal da bateria: nada pode acontecer
    feed([hand('Left', 0.8, 0.8334)]);
    expect(useEditor.getState().draft).toBeNull();
    expect(ctl.getSnapshot().pinched).toEqual([]); // pinçou, mas não comanda
    expect(ctl.getSnapshot().handSide).toBe('–');
    // a DIREITA faz o MESMO gesto: aí sim
    feed([hand('Right', 0.8, 0.8334)]);
    expect(useEditor.getState().draft).not.toBeNull();
    expect(ctl.getSnapshot().pinched).toEqual(['Right']);
    expect(ctl.getSnapshot().handSide).toBe('right');
  });

  it('seletor em ESQUERDA inverte: a direita é a que é ignorada', () => {
    const ctl = wireUp();
    ctl.setFilter('left');
    let now = 0;
    const feed = (hs: FrameHand[], n = 6) => {
      for (let i = 0; i < n; i++) {
        now += 33;
        ctl.ingest(hs, 5, now);
      }
    };
    feed([hand('Right', 0.8, 0.8334)]);
    expect(useEditor.getState().draft).toBeNull();
    feed([hand('Left', 0.8, 0.8334)]);
    expect(useEditor.getState().draft).not.toBeNull();
  });

  it('modo TRAVAR: gruda na primeira mão; a outra, mesmo pinçando, não comanda', () => {
    const ctl = wireUp();
    ctl.setFilter('lock');
    let now = 0;
    const feed = (hs: FrameHand[], n = 6) => {
      for (let i = 0; i < n; i++) {
        now += 33;
        ctl.ingest(hs, 5, now);
      }
    };
    // ABERTA com o ponto médio das pontas EXATAMENTE onde vai ficar a pinça
    // (é o que a mão real faz: os dedos fecham em volta do alvo — se a pose
    // mudasse de lugar, a trava de mira congelaria o apontar no meio do salto)
    feed([hand('Right', 0.7, 0.9334), blob('Left', 0.2, 0.8)]);
    expect(ctl.getSnapshot().ignored).toBe(1);
    // a IGNORADA passa a pinçar: o store não pode mexer
    feed([hand('Right', 0.7, 0.9334), blobPinched(0.2, 0.8)]);
    expect(useEditor.getState().draft).toBeNull();
    expect(useEditor.getState().grip).toBeNull();
    expect(ctl.getSnapshot().pinched).toEqual([]);
    // a grudada pinça no terminal da bateria: aí sim agarra
    feed([hand('Right', 0.8, 0.8334), blobPinched(0.2, 0.8)]);
    expect(useEditor.getState().draft).not.toBeNull();
  });

  it('trocar o seletor solta o que a mão estava segurando', () => {
    const ctl = wireUp();
    let now = 0;
    for (let i = 0; i < 6; i++) {
      now += 33;
      ctl.ingest([hand('Right', 0.5667, 0.6)], 5, now);
    }
    expect(useEditor.getState().grip?.id).toBe('lamp1');
    ctl.setFilter('right');
    expect(useEditor.getState().grip).toBeNull();
    expect(ctl.getSnapshot().filter).toBe('right');
  });

  it('status diz o filtro, quem comanda e quantas mãos foram ignoradas', () => {
    const ctl = wireUp();
    let now = 0;
    const duas = () => [blob('Right', 0.5, 0.3), blob('Left', 0.5, 0.7)];
    for (let i = 0; i < 3; i++) {
      now += 33;
      ctl.ingest(duas(), 5, now);
    }
    expect(ctl.getSnapshot().filter).toBe('auto');
    expect(ctl.getSnapshot().ignored).toBe(0);
    ctl.setFilter('left');
    for (let i = 0; i < 3; i++) {
      now += 33;
      ctl.ingest(duas(), 5, now);
    }
    const s = ctl.getSnapshot();
    expect(s.filter).toBe('left');
    expect(s.ignored).toBe(1);
    expect(s.handSide).toBe('left');
    // e o quadro de desenho marca a ignorada (a camada desenha apagada)
    const usadas = ctl.drawFrame().hands.map((h) => h.used);
    expect(usadas).toEqual([false, true]);
  });

  it('com o seletor de UMA mão, as duas mãos NÃO dão zoom (a outra não interage)', () => {
    const ctl = wireUp();
    let now = 0;
    const pair = (gap: number) => [
      blob('Right', 0.5 - gap / 2, 0.35),
      blob('Left', 0.5 + gap / 2, 0.75),
    ];
    const feed = (hs: FrameHand[], n = 3) => {
      for (let i = 0; i < n; i++) {
        now += 33;
        ctl.ingest(hs, 5, now);
      }
    };
    const abrir = () => {
      feed(pair(0.1));
      for (let g = 0.15; g <= 0.3; g += 0.05) feed(pair(g));
    };

    // em "Qualquer mão comanda" o gesto vale (serve de prova de que não quebrou)
    abrir();
    expect(useEditor.getState().zoom).toBeGreaterThan(1);

    // escolhida UMA mão: o MESMO gesto não mexe mais a vista
    ctl.setFilter('right');
    useEditor.setState({ zoom: 1, pan: { x: 0, y: 0 } });
    abrir();
    expect(useEditor.getState().zoom).toBe(1);
    expect(ctl.getSnapshot().ignored).toBe(1);

    // e voltar para "Qualquer" devolve o gesto
    ctl.setFilter('auto');
    useEditor.setState({ zoom: 1, pan: { x: 0, y: 0 } });
    abrir();
    expect(useEditor.getState().zoom).toBeGreaterThan(1);
  });
});

describe('pinca e puxa = pan da vista (controller)', () => {
  beforeEach(() => {
    resetDoc();
    // zoom > 1: em zoom 1 o quadro inteiro cabe e o clamp CENTRALIZA (pan é
    // no-op por design — só dá para deslocar vista ampliada)
    useEditor.setState({ zoom: 2, pan: { x: 0, y: 0 }, panning: false });
    // px de tela em jogo: o pan mede a mira em fracao da janela
    vi.stubGlobal('window', { innerWidth: 1000, innerHeight: 800 });
  });
  afterEach(() => vi.unstubAllGlobals());

  const feed = (ctl: HandsController, h: FrameHand, n = 8, start = { now: 0 }) => {
    for (let i = 0; i < n; i++) {
      start.now += 33;
      ctl.ingest([h], 5, start.now);
    }
    return start;
  };

  it('pinca no VAZIO e puxa: a vista acompanha a mao, sem tocar em componente', () => {
    const ctl = wireUp();
    // ponta espelhada (1-0.3, 0.15) => celula (20,4): longe dos comps (4,10)/(12,10)
    const clk = feed(ctl, hand('Right', 0.3, 0.3, 0.15));
    expect(useEditor.getState().panning).toBe(true);
    const comps0 = JSON.stringify(useEditor.getState().doc.comps);
    // puxa p/ a direita (espelha: tx menor = mira mais p/ a direita)
    feed(ctl, hand('Right', 0.15, 0.15, 0.25), 8, clk);
    const pan = useEditor.getState().pan;
    expect(pan.x).not.toBe(0); // andou (o eixo Y da mira prende na palma: x basta)
    expect(JSON.stringify(useEditor.getState().doc.comps)).toBe(comps0);
    expect(useEditor.getState().grip).toBeNull();
    expect(useEditor.getState().draft).toBeNull();
    // abrir a mao solta o aperto-vazio
    feed(ctl, hand('Right', 0.15, 0.45, 0.25), 12, clk);
    expect(useEditor.getState().panning).toBe(false);
  });

  it('pinca no TERMINAL: o fio vai na mao, a vista fica parada', () => {
    const ctl = wireUp();
    const clk = feed(ctl, hand('Right', 0.8, 0.8334)); // cursor em (5,10): terminal
    expect(useEditor.getState().panning).toBe(false);
    expect(useEditor.getState().draft).not.toBeNull();
    feed(ctl, hand('Right', 0.7, 0.8334), 8, clk); // arrasta o fio p/ a direita
    expect(useEditor.getState().pan).toEqual({ x: 0, y: 0 }); // nao deslocou a vista
    expect(useEditor.getState().draft).not.toBeNull();
  });
});

describe('mãos com a câmera de TRÁS (o AR ligado): a mesa como o aluno vê', () => {
  beforeEach(() => {
    resetDoc();
    reiniciarAr(); // a chave do AR é do APARELHO e sobrevive ao teste se não zerar
  });
  afterEach(() => reiniciarAr()); // e a assinatura do controller vai junto

  /** Pinça fechada em x e arrasta a mão INTEIRA +0,25: devolve a mira antes/depois. */
  const anda = (ctl: HandsController) => {
    let now = 0;
    const feed = (h: FrameHand, n: number) => {
      for (let i = 0; i < n; i++) {
        now += 33;
        ctl.ingest([h], 5, now);
      }
    };
    feed(hand('Right', 0.45, 0.4834), 20); // fecha: a mira trava no ponto médio
    const antes = ctl.getSnapshot().cursor!;
    feed(hand('Right', 0.7, 0.7334), 20); // o braço anda (a pinça continua)
    return { antes, depois: ctl.getSnapshot().cursor! };
  };

  it('sem AR a câmera é a frontal e a mira é espelhada, como um selfie', () => {
    const ctl = wireUp();
    expect(ctl.getSnapshot().camera).toBe('frontal');
    expect(cameraDasMaos(false)).toBe('frontal');
    const { antes, depois } = anda(ctl);
    // mão p/ a direita => mira p/ a ESQUERDA na tela
    expect(depois.x).toBeCloseTo(antes.x - 0.25, 2);
  });

  it('com AR as mãos nascem na câmera de trás e a mira anda JUNTO com a mão', () => {
    definirAr(true);
    const ctl = wireUp(); // nasce já na câmera de trás (o AR já estava ligado)
    expect(ctl.getSnapshot().camera).toBe('traseira');
    expect(cameraDasMaos(true)).toBe('traseira');
    const { antes, depois } = anda(ctl);
    // sem espelho: a mão andou p/ a direita, a mira anda p/ a direita
    expect(depois.x).toBeCloseTo(antes.x + 0.25, 2);
    expect(depois.y).toBeCloseTo(antes.y, 2);
  });

  it('ligar o AR com as mãos JÁ ligadas troca a câmera (e o espelho vai junto)', async () => {
    const ctl = wireUp();
    const { antes, depois } = anda(ctl);
    expect(depois.x).toBeCloseTo(antes.x - 0.25, 2); // frontal: espelhado

    definirAr(true);
    await Promise.resolve(); // o aviso do AR chega fora do render
    expect(ctl.getSnapshot().camera).toBe('traseira');
    const agora = anda(ctl);
    expect(agora.depois.x).toBeGreaterThan(agora.antes.x); // agora anda junto
  });

  it('desligar o AR devolve as mãos para a frontal', async () => {
    definirAr(true);
    const ctl = wireUp();
    expect(ctl.getSnapshot().camera).toBe('traseira');
    definirAr(false);
    await Promise.resolve();
    expect(ctl.getSnapshot().camera).toBe('frontal');
    expect(ctl.getSnapshot().active).toBe(false); // sem sessão, só guarda a escolha
  });

  it('com sessão viva a troca reabre a câmera e solta o que a mão segurava', async () => {
    // costura sem câmera (node não tem getUserMedia): o que a troca de AR usa é
    // um stream vivo para reabrir, e isso aqui é um vídeo e um tracker de mentira
    const ctl = wireUp();
    const trocas: boolean[] = [];
    const interno = ctl as unknown as {
      hiddenVideo: unknown;
      status: Record<string, unknown>;
      tracker: { trocarCamera: (v: unknown, t: boolean) => Promise<void> };
    };
    interno.hiddenVideo = { srcObject: null, muted: false, play: () => Promise.resolve() };
    interno.tracker = {
      trocarCamera: (_v, traseira) => {
        trocas.push(traseira);
        return Promise.resolve();
      },
    };
    interno.status = { ...interno.status, active: true };

    useEditor.getState().pressAt({ x: 5, y: 10 }); // fio na mão (draft)
    expect(useEditor.getState().draft).not.toBeNull();

    definirAr(true);
    await Promise.resolve();
    // a imagem que vem agora é OUTRA: nada pode continuar agarrado na mão
    expect(trocas).toEqual([true]);
    expect(useEditor.getState().draft).toBeNull();
    expect(ctl.getSnapshot().camera).toBe('traseira');

    definirAr(false); // e a volta (sair do AR) reabre na frontal
    await Promise.resolve();
    expect(trocas).toEqual([true, false]);
    expect(ctl.getSnapshot().camera).toBe('frontal');
  });
});

describe('mira do fundo do AR: o ponto do vídeo na caixa desenhada (cover)', () => {
  const caixa = { x: 100, y: 50, w: 400, h: 400 };

  it('o centro do quadro cai no centro da caixa', () => {
    expect(pontoNaTela(0.5, 0.5, { w: 1280, h: 720 }, caixa)).toEqual({ x: 300, y: 250 });
  });

  it('vídeo e caixa do mesmo formato: o quadro inteiro cabe, sem recorte', () => {
    expect(pontoNaTela(0.25, 0.75, { w: 400, h: 400 }, caixa)).toEqual({ x: 200, y: 350 });
  });

  it('quadro 16:9 num quadrado: as sobras laterais são CORTADAS (não estica)', () => {
    // escala = 400/720 => a imagem desenhada tem 711 px de largura: 155 de cada
    // lado ficam fora da caixa (é o que o `object-fit: cover` faz)
    const bordaEsquerda = 155.5556 / 711.1111; // ≈ 0,2188 do quadro
    const dentro = pontoNaTela(bordaEsquerda, 0.5, { w: 1280, h: 720 }, caixa);
    expect(dentro.x).toBeCloseTo(100, 1);
    // além da borda o ponto cai FORA da caixa (aquela parte da imagem não aparece)
    expect(pontoNaTela(0, 0.5, { w: 1280, h: 720 }, caixa).x).toBeLessThan(100);
    // em y não sobra nada: o topo e o pé do quadro coincidem com a caixa
    expect(pontoNaTela(0.5, 0, { w: 1280, h: 720 }, caixa).y).toBeCloseTo(50, 6);
    expect(pontoNaTela(0.5, 1, { w: 1280, h: 720 }, caixa).y).toBeCloseTo(450, 6);
  });

  it('caixa degenerada (sem layout) não vira NaN', () => {
    expect(pontoNaTela(0.5, 0.5, { w: 1280, h: 720 }, { x: 0, y: 0, w: 0, h: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});
