export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Shrinks a box on every side; used to make hitboxes a little forgiving. */
export function inset(box: Box, amount: number): Box {
  return {
    x: box.x + amount,
    y: box.y + amount,
    w: Math.max(0, box.w - amount * 2),
    h: Math.max(0, box.h - amount * 2),
  };
}
