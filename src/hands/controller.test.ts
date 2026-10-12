import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from '../editor/store';
import { HandsController, type HandPoint } from './controller';
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
