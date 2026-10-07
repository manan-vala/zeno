import { GROUND_Y, TOP_BAND_H, VIEW_H, VIEW_W } from './config';
import type { SpriteSheet } from './sprites';
import type { Theme } from './theme';

// One 8×8 unit of a running Greek key. Units connect along the bottom row.
const MEANDER = [
  'xxxxxxx.',
  'x.....x.',
  'x.xxx.x.',
  'x.x.x.x.',
  'x.x...x.',
  'x.xxxxx.',
  'x.......',
  'xxxxxxxx',
];
const TILE = 8;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function paintMeander(ctx: CanvasRenderingContext2D, ox: number, oy: number, width: number, color: string): void {
  ctx.fillStyle = color;
  for (let tx = 0; tx < width; tx += TILE) {
    MEANDER.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === 'x') ctx.fillRect(ox + tx + x, oy + y, 1, 1);
      });
    });
  }
}

/** Deterministic pseudo-random numbers so the scenery is the same every run. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * The painted world behind the action, in one theme. Day is black-figure
 * (black bands on clay); night is red-figure, with the colours swapped.
 */
export class Background {
  private topBand: HTMLCanvasElement;
  private groundBand: HTMLCanvasElement;
  private hills: HTMLCanvasElement;
  private midground: HTMLCanvasElement;
  private stars: { x: number; y: number; phase: number }[] = [];
  private readonly hillsW = 800;
  private readonly midW = 1200;

  constructor(
    sprites: SpriteSheet,
    private theme: Theme,
  ) {
    // Top border of the vase.
    const [top, tctx] = makeCanvas(VIEW_W + TILE, TOP_BAND_H);
    tctx.fillStyle = theme.figure;
    tctx.fillRect(0, 0, top.width, TOP_BAND_H);
    paintMeander(tctx, 0, 2, top.width, theme.sky);
    this.topBand = top;

    // The ground: a line, a key pattern, then the foot band.
    const groundH = VIEW_H - GROUND_Y;
    const [ground, gctx] = makeCanvas(VIEW_W + TILE, groundH);
    gctx.fillStyle = theme.sky;
    gctx.fillRect(0, 0, ground.width, groundH);
    gctx.fillStyle = theme.figure;
    gctx.fillRect(0, 0, ground.width, 2);
    paintMeander(gctx, 0, 3, ground.width, theme.figure);
    gctx.fillRect(0, 12, ground.width, 2);
    gctx.fillRect(0, 14, ground.width, groundH - 14);
    gctx.fillStyle = theme.silhouettes;
    for (let x = 2; x < ground.width; x += 4) gctx.fillRect(x, 17, 1, 1);
    this.groundBand = ground;

    // Distant hills, tileable.
    const [hills, hctx] = makeCanvas(this.hillsW, GROUND_Y);
    hctx.fillStyle = theme.hills;
    const k = (Math.PI * 2) / this.hillsW;
    for (let x = 0; x < this.hillsW; x++) {
      const h = 18 + Math.sin(x * k * 2) * 9 + Math.sin(x * k * 5 + 1.3) * 5 + Math.sin(x * k * 11 + 0.4) * 2;
      hctx.fillRect(x, GROUND_Y - Math.round(h), 1, Math.round(h));
    }
    this.hills = hills;

    // Temples, olive groves and cypresses, tileable.
    const [mid, mctx] = makeCanvas(this.midW, GROUND_Y);
    const rand = rng(7);
    let x = 10;
    while (x < this.midW - 60) {
      const r = rand();
      let s: HTMLCanvasElement;
      if (r < 0.12) s = sprites.temple;
      else if (r < 0.4) s = sprites.cypress;
      else s = sprites.olives[Math.floor(rand() * sprites.olives.length)];
      mctx.drawImage(s, x, GROUND_Y - s.height);
      x += s.width + 6 + Math.floor(rand() * 60);
    }
    this.midground = mid;

    if (theme.night) {
      const sr = rng(11);
      for (let i = 0; i < 40; i++) {
        this.stars.push({ x: Math.floor(sr() * VIEW_W), y: TOP_BAND_H + 2 + Math.floor(sr() * 50), phase: sr() * 6 });
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, scroll: number, time: number): void {
    const t = this.theme;
    ctx.fillStyle = t.sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (t.night) {
      // Stars twinkle; the moon is a crescent cut out of a clay disc.
      ctx.fillStyle = t.figure;
      for (const s of this.stars) {
        if (Math.sin(time * 1.7 + s.phase) > -0.4) ctx.fillRect(s.x, s.y, 1, 1);
      }
      ctx.fillStyle = t.glow;
      ctx.beginPath();
      ctx.arc(240, 38, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.sky;
      ctx.beginPath();
      ctx.arc(246, 34, 11, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // The sun: a lighter disc ringed with dots, turning very slowly.
      const sx = 240;
      const sy = 38;
      ctx.fillStyle = t.glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 13, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + time * 0.05;
        ctx.fillRect(Math.round(sx + Math.cos(a) * 18), Math.round(sy + Math.sin(a) * 18), 1, 1);
      }
    }

    this.drawTiled(ctx, this.hills, this.hillsW, scroll * 0.12);
    this.drawTiled(ctx, this.midground, this.midW, scroll * 0.35);

    ctx.drawImage(this.topBand, -Math.floor((scroll * 0.2) % TILE), 0);
    ctx.drawImage(this.groundBand, -Math.floor(scroll % TILE), GROUND_Y);
  }

  private drawTiled(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, w: number, offset: number): void {
    const x = -Math.floor(offset % w);
    ctx.drawImage(img, x, 0);
    if (x + w < VIEW_W) ctx.drawImage(img, x + w, 0);
  }
}
