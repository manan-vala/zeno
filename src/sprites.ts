import { PixelGrid } from './pixels';

export type Sprite = HTMLCanvasElement;

// ---------------------------------------------------------------------------
// Achilles: a hoplite in a crested Corinthian helmet, round shield and spear,
// facing right. Upper body is shared; legs change per pose.
// ---------------------------------------------------------------------------

export const ACHILLES_W = 22;
export const ACHILLES_H = 24;

const HEAD = [
  '......kkkkk.........',
  '....kkkkkkkkk.......',
  '...kkkkkkkkkkk......',
  '..kkk....kkkkkk.....',
  '..k.....kkkkkkkk....',
  '..k.....kkkkkkkkk...',
  '........kkkkkookkk..',
  '........kkkkkkkkkk..',
  '.........kkkkkk.kk..',
  '.........kkkkk......',
];

function upperBody(g: PixelGrid, ox: number, oy: number): void {
  // Spear first so the shield sits on top of it.
  g.line(ox + 21, oy + 7, ox + 1, oy + 17, 'k');
  g.set(ox + 21, oy + 6, 'k').set(ox + 20, oy + 6, 'k'); // spear head
  g.rows(HEAD, ox, oy);
  // Torso and spear arm.
  g.rect(ox + 9, oy + 10, 5, 8, 'k');
  g.line(ox + 13, oy + 11, ox + 16, oy + 11, 'k', 2);
  // Shield (aspis) with an incised rim and a white blazon.
  g.disc(ox + 9, oy + 13, 4.6, 'k');
  g.ring(ox + 9, oy + 13, 3.4, 'o');
  g.rect(ox + 8, oy + 12, 2, 2, 'w');
}

type Leg = [number, number, number, number, number, number]; // hip → knee → foot

function legs(g: PixelGrid, ox: number, oy: number, a: Leg, b: Leg): void {
  for (const [hx, hy, kx, ky, fx, fy] of [a, b]) {
    g.line(ox + hx, oy + hy, ox + kx, oy + ky, 'k', 2);
    g.line(ox + kx, oy + ky, ox + fx, oy + fy, 'k', 2);
    g.set(ox + fx + 1, oy + fy + 1, 'k'); // toes
    g.set(ox + Math.round((kx + fx) / 2), oy + Math.round((ky + fy) / 2), 'o'); // greave
  }
}

function achilles(legA: Leg, legB: Leg): Sprite {
  const g = new PixelGrid(ACHILLES_W, ACHILLES_H);
  upperBody(g, 0, 0);
  legs(g, 0, 0, legA, legB);
  return g.toCanvas();
}

function achillesDuck(): Sprite {
  const g = new PixelGrid(ACHILLES_W + 4, ACHILLES_H);
  const oy = 9;
  g.line(25, oy + 7, 2, oy + 12, 'k'); // spear held low
  g.set(25, oy + 6, 'k').set(24, oy + 6, 'k');
  g.rows(HEAD, 4, oy);
  g.rect(10, oy + 7, 6, 6, 'k');
  g.disc(15, oy + 9, 4.6, 'k');
  g.ring(15, oy + 9, 3.4, 'o');
  g.rect(14, oy + 8, 2, 2, 'w');
  legs(g, 0, 0, [11, 19, 15, 20, 13, 22], [10, 19, 7, 21, 4, 22]);
  return g.toCanvas();
}

function achillesFallen(): Sprite {
  // Knocked flat: rotate the standing pose 90° so he lies on his back.
  const g = new PixelGrid(ACHILLES_W, ACHILLES_H);
  upperBody(g, 0, 0);
  legs(g, 0, 0, [10, 17, 9, 20, 9, 22], [11, 17, 12, 20, 12, 22]);
  const out = new PixelGrid(ACHILLES_H, ACHILLES_W);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const c = g.get(x, y);
      if (c) out.set(y, ACHILLES_W - 1 - x, c);
    }
  }
  return out.toCanvas();
}

// ---------------------------------------------------------------------------
// The tortoise: always ahead, never caught.
// ---------------------------------------------------------------------------

const TORTOISE_SHELL = [
  '.....kkkkkk.......',
  '...kkkokkokkk.....',
  '..kkoookoookkk....',
  '.kkkkokkkkokkkk.kk',
  '.wwwwwwwwwwwwwwkkk',
  'kkkkkkkkkkkkkkkkok',
  '.kkkkkkkkkkkkkk...',
];

function tortoise(step: number): Sprite {
  const g = new PixelGrid(18, 9);
  g.rows(TORTOISE_SHELL);
  const legRows = step === 0 ? ['..kk......kk......', '..kk......kk......'] : ['....kk......kk....', '...kk......kk.....'];
  g.rows(legRows, 0, 7);
  return g.toCanvas();
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------

const AMPHORA = [
  '..kkkkkk..',
  '...kkkk...',
  '.kkkkkkkk.',
  'k..kkkk..k',
  'k.kkkkkk.k',
  '.kkkkkkkk.',
  'kkkkkkkkkk',
  'kooooooook',
  'kkkkkkkkkk',
  'kkwkkkkwkk',
  'kkkkkkkkkk',
  'kokkokkokk',
  '.kkkkkkkk.',
  '..kkkkkk..',
  '...kkkk...',
  '..kkkkkk..',
];

function amphora(): Sprite {
  return new PixelGrid(10, 16).rows(AMPHORA).toCanvas();
}

function amphoraPair(): Sprite {
  const g = new PixelGrid(22, 16);
  g.rows(AMPHORA, 0, 0);
  g.rows(AMPHORA, 12, 0);
  return g.toCanvas();
}

function column(w: number, h: number, broken: boolean): Sprite {
  const g = new PixelGrid(w, h);
  const shaftTop = broken ? 2 : 4;
  // Capital (abacus + echinus) on intact columns.
  if (!broken) {
    g.rect(0, 0, w, 2, 'k');
    g.rect(1, 2, w - 2, 2, 'k');
    g.set(0, 2, 'k').set(w - 1, 2, 'k');
  }
  // Shaft with incised flutes.
  g.rect(1, shaftTop, w - 2, h - shaftTop - 2, 'k');
  for (let x = 2; x < w - 2; x += 2) g.line(x, shaftTop + 1, x, h - 4, 'o');
  // Base.
  g.rect(0, h - 2, w, 2, 'k');
  if (broken) {
    // Jagged break across the top.
    const jag = [0, 2, 1, 3, 0, 2, 1, 0, 2, 1];
    for (let x = 1; x < w - 1; x++) {
      for (let y = 0; y < shaftTop + jag[x % jag.length]; y++) g.set(x, y, null);
    }
    for (let x = 1; x < w - 1; x++) g.set(x, shaftTop + jag[x % jag.length], 'k');
  }
  return g.toCanvas();
}

const OWL_UP = [
  'kk..........kk',
  'kkk........kkk',
  '.kkk.k..k.kkk.',
  '..kkkkkkkkkk..',
  '...kwkkkkwk...',
  '...kkkkkkkk...',
  '....kkookk....',
  '....kokkok....',
  '.....kkkk.....',
  '.....k..k.....',
];

const OWL_DOWN = [
  '..............',
  '.....k..k.....',
  '....kkkkkk....',
  '...kwkkkkwk...',
  '.kkkkkkkkkkkk.',
  'kkk.kkookk.kkk',
  'kk..kokkok..kk',
  'k...kkkkkk...k',
  '.....kkkk.....',
  '.....k..k.....',
];

function owl(up: boolean): Sprite {
  return new PixelGrid(14, 10).rows(up ? OWL_UP : OWL_DOWN).toCanvas();
}

// ---------------------------------------------------------------------------
// Background silhouettes (painted in deep clay, behind the action).
// ---------------------------------------------------------------------------

function temple(): Sprite {
  const g = new PixelGrid(40, 26);
  // Pediment.
  for (let y = 0; y < 7; y++) g.rect(20 - y * 3, y, y * 6 + 1, 1, 'd');
  g.rect(0, 7, 40, 2, 'd');
  // Columns.
  for (let x = 2; x < 38; x += 6) g.rect(x, 9, 3, 14, 'd');
  // Steps.
  g.rect(0, 23, 40, 1, 'd');
  g.rect(-1, 24, 42, 2, 'd');
  return g.toCanvas();
}

function oliveTree(seed: number): Sprite {
  const g = new PixelGrid(22, 26);
  g.line(11, 25, 10, 14, 'd', 2);
  g.line(10, 16, 6, 11, 'd');
  g.line(11, 15, 15, 10, 'd');
  const blobs: [number, number, number][] = [
    [6, 9, 4],
    [11, 6, 5],
    [16, 9, 4],
    [9, 12, 3],
    [14, 13, 3],
  ];
  blobs.forEach(([x, y, r], i) => g.disc(x + ((seed + i) % 2), y, r, 'd'));
  // Leaves poke out as single pixels.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + seed;
    g.set(11 + Math.cos(a) * 9, 9 + Math.sin(a) * 6, 'd');
  }
  return g.toCanvas();
}

function cypress(): Sprite {
  const g = new PixelGrid(8, 28);
  for (let y = 0; y < 26; y++) {
    const half = Math.min(3, 0.5 + y * 0.28) - Math.max(0, (y - 20) * 0.4);
    g.rect(Math.round(4 - half), y, Math.max(1, Math.round(half * 2)), 1, 'd');
  }
  g.rect(3, 26, 2, 2, 'd');
  return g.toCanvas();
}

// ---------------------------------------------------------------------------

export interface SpriteSheet {
  run: Sprite[];
  jump: Sprite;
  duck: Sprite;
  fallen: Sprite;
  tortoise: Sprite[];
  amphora: Sprite;
  amphoraPair: Sprite;
  columnBroken: Sprite;
  columnTall: Sprite;
  owl: Sprite[];
  temple: Sprite;
  olives: Sprite[];
  cypress: Sprite;
}

export function buildSprites(): SpriteSheet {
  return {
    run: [
      achilles([10, 17, 7, 20, 3, 22], [11, 17, 14, 20, 16, 22]),
      achilles([10, 17, 9, 20, 7, 22], [11, 17, 14, 19, 12, 21]),
      achilles([10, 17, 6, 19, 4, 22], [11, 17, 15, 19, 17, 21]),
      achilles([11, 17, 10, 20, 9, 22], [10, 17, 12, 19, 10, 21]),
    ],
    jump: achilles([10, 17, 13, 19, 10, 21], [10, 17, 7, 19, 5, 21]),
    duck: achillesDuck(),
    fallen: achillesFallen(),
    tortoise: [tortoise(0), tortoise(1)],
    amphora: amphora(),
    amphoraPair: amphoraPair(),
    columnBroken: column(10, 20, true),
    columnTall: column(11, 29, false),
    owl: [owl(true), owl(false)],
    temple: temple(),
    olives: [oliveTree(0), oliveTree(1), oliveTree(2)],
    cypress: cypress(),
  };
}
