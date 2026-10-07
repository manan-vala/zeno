// The vase cracking and falling apart, and flying back together.

type Point = [number, number];

export interface Shard {
  points: Point[];
  cx: number; // centroid
  cy: number;
  vx: number;
  vy: number;
  spin: number;
  delay: number;
}

export interface Fracture {
  /** Jagged crack lines radiating from the impact. */
  cracks: Point[][];
  shards: Shard[];
}

const GRAVITY = 520;

/** Where a ray from (cx, cy) at `angle` leaves the w×h rectangle. */
function edgePoint(cx: number, cy: number, angle: number, w: number, h: number): Point {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (w - cx) / dx);
  if (dx < -1e-9) t = Math.min(t, -cx / dx);
  if (dy > 1e-9) t = Math.min(t, (h - cy) / dy);
  if (dy < -1e-9) t = Math.min(t, -cy / dy);
  return [cx + dx * t, cy + dy * t];
}

function centroid(points: Point[]): Point {
  const sx = points.reduce((a, p) => a + p[0], 0);
  const sy = points.reduce((a, p) => a + p[1], 0);
  return [sx / points.length, sy / points.length];
}

/**
 * Splits a w×h picture into wedge-shaped shards around an impact point, each
 * wedge cut again into an inner and outer piece.
 */
export function fracture(cx: number, cy: number, w: number, h: number, random: () => number): Fracture {
  const n = 11;
  const start = random() * Math.PI * 2;
  const angles: number[] = [];
  for (let i = 0; i < n; i++) angles.push(start + ((i + 0.2 + random() * 0.6) / n) * Math.PI * 2);

  const corners: Point[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const angleOf = (p: Point) => Math.atan2(p[1] - cy, p[0] - cx);
  const relative = (a: number, from: number) => {
    let d = a - from;
    while (d < 0) d += Math.PI * 2;
    while (d >= Math.PI * 2) d -= Math.PI * 2;
    return d;
  };

  const shards: Shard[] = [];
  const cracks: Point[][] = [];
  for (let i = 0; i < n; i++) {
    const a0 = angles[i];
    const a1 = angles[(i + 1) % n];
    const span = relative(a1, a0);
    const e0 = edgePoint(cx, cy, a0, w, h);
    const e1 = edgePoint(cx, cy, a1, w, h);
    const between = corners
      .filter((c) => relative(angleOf(c), a0) < span)
      .sort((p, q) => relative(angleOf(p), a0) - relative(angleOf(q), a0));
    // Keep the inner ring inside the picture, even for impacts near an edge.
    const reach = Math.min(Math.hypot(e0[0] - cx, e0[1] - cy), Math.hypot(e1[0] - cx, e1[1] - cy));
    const r = Math.min(16 + random() * 26, reach * 0.7);
    const i0: Point = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r];
    const i1: Point = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];

    const pieces: Point[][] = [
      [[cx, cy], i0, i1],
      [i0, e0, ...between, e1, i1],
    ];
    for (const points of pieces) {
      const [px, py] = centroid(points);
      const out = Math.atan2(py - cy, px - cx);
      shards.push({
        points,
        cx: px,
        cy: py,
        vx: Math.cos(out) * (30 + random() * 50),
        vy: -40 - random() * 80,
        spin: (random() - 0.5) * 3,
        delay: random() * 0.12,
      });
    }

    // A jagged crack along this wedge's edge.
    const len = Math.hypot(e0[0] - cx, e0[1] - cy);
    const crack: Point[] = [[cx, cy]];
    for (let d = 6; d < len; d += 6) {
      const jitter = (random() - 0.5) * 3;
      crack.push([cx + Math.cos(a0) * d - Math.sin(a0) * jitter, cy + Math.sin(a0) * d + Math.cos(a0) * jitter]);
    }
    crack.push(e0);
    cracks.push(crack);
    cracks.push([i0, i1]); // ring crack between the inner and outer pieces
  }
  return { cracks, shards };
}

/** Draws the cracks, each grown to `progress` (0..1) of its length. */
export function drawCracks(ctx: CanvasRenderingContext2D, f: Fracture, progress: number, color: string): void {
  if (progress <= 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const crack of f.cracks) {
    // Ring cracks appear late, once the radial ones are under way.
    const isRing = crack.length === 2;
    const p = isRing ? Math.max(0, (progress - 0.5) * 2) : progress;
    if (p <= 0) continue;
    const count = Math.max(2, Math.ceil(crack.length * p));
    ctx.moveTo(crack[0][0] + 0.5, crack[0][1] + 0.5);
    for (let i = 1; i < count && i < crack.length; i++) ctx.lineTo(crack[i][0] + 0.5, crack[i][1] + 0.5);
  }
  ctx.stroke();
}

/**
 * Draws `picture` broken into shards, `t` seconds into their fall. Run t
 * backwards to reassemble.
 */
export function drawShards(
  ctx: CanvasRenderingContext2D,
  picture: CanvasImageSource,
  f: Fracture,
  t: number,
  edge: string,
): void {
  for (const s of f.shards) {
    const tau = Math.max(0, t - s.delay);
    const dx = s.vx * tau;
    const dy = s.vy * tau + 0.5 * GRAVITY * tau * tau;
    ctx.save();
    ctx.translate(s.cx + dx, s.cy + dy);
    ctx.rotate(s.spin * tau);
    ctx.translate(-s.cx, -s.cy);
    ctx.beginPath();
    s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.drawImage(picture, 0, 0);
    ctx.restore();
    if (tau > 0) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
}
