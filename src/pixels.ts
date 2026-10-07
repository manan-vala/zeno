import { COLORS } from './config';

/**
 * Palette keys used by sprite definitions:
 *   k = ink (the black of black-figure painting)
 *   o = incised line (scratched through the ink, so it shows the clay)
 *   w = added white
 *   r = added red
 *   d = deep clay (for background silhouettes)
 */
const PALETTE: Record<string, string> = {
  k: COLORS.ink,
  o: COLORS.incise,
  w: COLORS.white,
  r: COLORS.red,
  d: COLORS.clayDeep,
};

/** A tiny paintable pixel grid that bakes down to an offscreen canvas. */
export class PixelGrid {
  readonly cells: (string | null)[];

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = new Array(w * h).fill(null);
  }

  set(x: number, y: number, c: string | null): this {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = c;
    return this;
  }

  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.cells[y * this.w + x];
  }

  /** Stamps rows of characters; '.' and ' ' are transparent. */
  rows(rows: string[], ox = 0, oy = 0): this {
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch !== '.' && ch !== ' ') this.set(ox + x, oy + y, ch);
      });
    });
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: string): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }

  /** Bresenham line, optionally thickened downwards/rightwards. */
  line(x0: number, y0: number, x1: number, y1: number, c: string, thick = 1): this {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      for (let t = 0; t < thick; t++) {
        this.set(x + (dx > -dy ? 0 : t), y + (dx > -dy ? t : 0), c);
      }
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    return this;
  }

  disc(cx: number, cy: number, r: number, c: string): this {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c);
      }
    }
    return this;
  }

  ring(cx: number, cy: number, r: number, c: string): this {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (Math.abs(d - r) < 0.5) this.set(x, y, c);
      }
    }
    return this;
  }

  /** Replaces every painted cell with one colour key (used for silhouettes). */
  recolor(c: string): this {
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i]) this.cells[i] = c;
    return this;
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d')!;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const key = this.cells[y * this.w + x];
        if (!key) continue;
        ctx.fillStyle = PALETTE[key] ?? key;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return canvas;
  }
}
