import type { AudioEngine } from './audio';
import { Background } from './background';
import { inset, overlaps, type Box } from './collision';
import { COLORS, GROUND_Y, PHYSICS, PLAYER_X, SPEED, VIEW_H, VIEW_W } from './config';
import { remainingGap, stageFor } from './score';
import { buildSprites, type Sprite, type SpriteSheet } from './sprites';

export type GameState = 'title' | 'running' | 'paused' | 'over';

type ObstacleKind = 'amphora' | 'amphoraPair' | 'columnBroken' | 'columnTall' | 'owl';

interface Obstacle {
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Extra speed for things that move on their own (owls fly towards you). */
  vx: number;
  phase: number;
}

interface Seed {
  x: number;
  y: number;
  phase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface GameEvents {
  onStateChange(state: GameState): void;
  onStage(stage: number): void;
  onSeeds(count: number): void;
  onGameOver(result: { distance: number; seeds: number; best: number; previousBest: number }): void;
}

/** The slice of the audio engine the game drives; tests pass a stub. */
export type GameAudio = Pick<
  AudioEngine,
  | 'unlock'
  | 'jump'
  | 'land'
  | 'duck'
  | 'seed'
  | 'halve'
  | 'hit'
  | 'gameOver'
  | 'start'
  | 'startMusic'
  | 'stopMusic'
  | 'setIntensity'
  | 'suspend'
  | 'resume'
>;

export interface GameOptions {
  audio: GameAudio;
  events: GameEvents;
  best: number;
  /** Pre-built sprites; defaults to baking them onto canvases. */
  sprites?: SpriteSheet;
  /** Random source in [0, 1); injectable so tests are deterministic. */
  random?: () => number;
}

const STEP = 1 / 120;
const TITLE_SPEED = 70;

export class Game {
  state: GameState = 'title';
  distance = 0;
  best: number;
  seeds = 0;

  private sprites: SpriteSheet;
  private background: Background | null = null;
  private audio: GameAudio;
  private events: GameEvents;
  private random: () => number;
  private scroll = 0;
  private time = 0;
  private speed = SPEED.start;
  private stage = 0;

  private y = GROUND_Y - 24; // top of Achilles' sprite
  private vy = 0;
  private onGround = true;
  private jumpHeld = false;
  private duckHeld = false;
  private runPhase = 0;
  private dustTimer = 0;

  private obstacles: Obstacle[] = [];
  private seedsOnField: Seed[] = [];
  private particles: Particle[] = [];
  private untilNextObstacle = 0;
  private streak = 0;
  private streakTimer = 0;

  private tortoiseHop = 0;
  private tortoiseVy = 0;
  private shake = 0;
  private overAt = 0;
  private accumulator = 0;

  constructor(options: GameOptions) {
    this.audio = options.audio;
    this.events = options.events;
    this.best = options.best;
    this.random = options.random ?? Math.random;
    this.sprites = options.sprites ?? buildSprites();
  }

  // -- Input ----------------------------------------------------------------

  /** Space / up / tap. Starts or restarts the game outside of a run. */
  pressJump(): void {
    this.audio.unlock();
    if (this.state === 'title') return this.start();
    if (this.state === 'paused') return this.togglePause();
    if (this.state === 'over') {
      if (this.time - this.overAt > 0.5) this.start();
      return;
    }
    this.jumpHeld = true;
    if (this.onGround && !this.duckHeld) {
      this.vy = -PHYSICS.jumpVelocity;
      this.onGround = false;
      this.audio.jump();
    }
  }

  releaseJump(): void {
    this.jumpHeld = false;
  }

  setDuck(down: boolean): void {
    if (down && !this.duckHeld && this.state === 'running' && this.onGround) this.audio.duck();
    this.duckHeld = down;
  }

  togglePause(): void {
    if (this.state === 'running') {
      this.setState('paused');
      this.audio.suspend();
    } else if (this.state === 'paused') {
      this.setState('running');
      this.audio.resume();
    }
  }

  /** Pauses only if a run is in progress (used when the tab loses focus). */
  pauseIfRunning(): void {
    if (this.state === 'running') this.togglePause();
  }

  // -- Lifecycle ------------------------------------------------------------

  start(): void {
    this.distance = 0;
    this.speed = SPEED.start;
    this.stage = 0;
    this.seeds = 0;
    this.streak = 0;
    this.y = GROUND_Y - 24;
    this.vy = 0;
    this.onGround = true;
    this.jumpHeld = false;
    this.obstacles = [];
    this.seedsOnField = [];
    this.particles = [];
    this.untilNextObstacle = 220;
    this.shake = 0;
    this.events.onStage(0);
    this.events.onSeeds(0);
    this.setState('running');
    this.audio.start();
    this.audio.startMusic();
  }

  private setState(state: GameState): void {
    this.state = state;
    this.events.onStateChange(state);
  }

  private die(): void {
    this.setState('over');
    this.overAt = this.time;
    this.shake = 0.35;
    this.audio.stopMusic();
    this.audio.hit();
    this.audio.gameOver();
    // Pottery shards.
    for (let i = 0; i < 18; i++) {
      this.particles.push({
        x: PLAYER_X + 12,
        y: this.y + 12,
        vx: (this.random() - 0.3) * 160,
        vy: -60 - this.random() * 140,
        gravity: 520,
        life: 1.2,
        maxLife: 1.2,
        size: this.random() < 0.4 ? 2 : 1,
        color: this.random() < 0.8 ? COLORS.ink : COLORS.white,
      });
    }
    const previousBest = this.best;
    this.best = Math.max(this.best, this.distance);
    this.events.onGameOver({ distance: this.distance, seeds: this.seeds, best: this.best, previousBest });
  }

  // -- Simulation -----------------------------------------------------------

  /** Advance by real elapsed seconds; runs the simulation at a fixed rate. */
  tick(dt: number): void {
    if (this.state === 'paused') return;
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator >= STEP) {
      this.update(STEP);
      this.accumulator -= STEP;
    }
  }

  private update(dt: number): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.updateParticles(dt);
    this.updateTortoise(dt);

    if (this.state === 'title') {
      this.scroll += TITLE_SPEED * dt;
      this.runPhase += dt * 8;
      return;
    }
    if (this.state !== 'running') return;

    this.speed = Math.min(SPEED.max, this.speed + SPEED.accel * dt);
    const dx = this.speed * dt;
    this.scroll += dx;
    this.distance += dx;

    const stage = stageFor(this.distance);
    if (stage > this.stage) {
      this.stage = stage;
      this.events.onStage(stage);
      this.audio.halve();
      this.tortoiseVy = -70;
      this.sparkle(this.tortoiseX() + 9, GROUND_Y - 10);
    }
    this.audio.setIntensity((this.speed - SPEED.start) / (SPEED.max - SPEED.start), this.stage);

    this.updatePlayer(dt);
    this.updateObstacles(dt, dx);
    if (this.state !== 'running') return;
    this.updateSeeds(dx);

    this.streakTimer -= dt;
    if (this.streakTimer <= 0) this.streak = 0;
  }

  private updatePlayer(dt: number): void {
    if (!this.onGround) {
      let g = PHYSICS.gravityReleased;
      if (this.duckHeld) g = PHYSICS.gravityFastFall;
      else if (this.jumpHeld && this.vy < 0) g = PHYSICS.gravity;
      this.vy += g * dt;
      this.y += this.vy * dt;
      if (this.y >= GROUND_Y - 24) {
        this.y = GROUND_Y - 24;
        this.vy = 0;
        this.onGround = true;
        this.audio.land();
        this.puff(PLAYER_X + 10, GROUND_Y - 1, 6);
      }
    }
    this.runPhase += dt * (8 + this.speed / 30);

    if (this.onGround) {
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = 0.07;
        this.particles.push({
          x: PLAYER_X + 6,
          y: GROUND_Y - 1,
          vx: -this.speed * 0.25 - this.random() * 20,
          vy: -10 - this.random() * 25,
          gravity: 60,
          life: 0.35,
          maxLife: 0.35,
          size: 1,
          color: COLORS.clayDeep,
        });
      }
    }
  }

  private isDucking(): boolean {
    return this.duckHeld && this.onGround;
  }

  private playerBox(): Box {
    if (this.isDucking()) return inset({ x: PLAYER_X + 6, y: GROUND_Y - 12, w: 16, h: 12 }, 1);
    return inset({ x: PLAYER_X + 5, y: this.y + 3, w: 11, h: 21 }, 1);
  }

  private updateObstacles(dt: number, dx: number): void {
    this.untilNextObstacle -= dx;
    if (this.untilNextObstacle <= 0) this.spawnObstacle();

    const player = this.playerBox();
    for (const o of this.obstacles) {
      o.x -= dx + o.vx * dt;
      o.phase += dt;
      if (overlaps(player, this.obstacleBox(o))) {
        this.die();
        return;
      }
    }
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -20);
  }

  private obstacleBox(o: Obstacle): Box {
    switch (o.kind) {
      case 'owl':
        return { x: o.x + 2, y: o.y + this.owlBob(o) + 2, w: o.w - 4, h: o.h - 4 };
      case 'columnBroken':
      case 'columnTall':
        return { x: o.x + 1, y: o.y + 1, w: o.w - 2, h: o.h - 1 };
      default:
        return inset({ x: o.x, y: o.y, w: o.w, h: o.h }, 1);
    }
  }

  private owlBob(o: Obstacle): number {
    return Math.round(Math.sin(o.phase * 6) * 1.5);
  }

  private spawnObstacle(): void {
    const pool: ObstacleKind[] = ['amphora', 'amphora', 'columnBroken'];
    if (this.stage >= 1) pool.push('amphoraPair', 'columnTall');
    if (this.stage >= 2) pool.push('owl', 'owl');
    const kind = pool[Math.floor(this.random() * pool.length)];

    const sprite = this.spriteFor(kind, 0);
    const o: Obstacle = {
      kind,
      x: VIEW_W + 8,
      y: GROUND_Y - sprite.height,
      w: sprite.width,
      h: sprite.height,
      vx: 0,
      phase: this.random() * 6,
    };
    if (kind === 'owl') {
      // Low owls must be jumped, middle ones ducked under, high ones ignored.
      const bottoms = [4, 17, 32];
      const bottom = bottoms[Math.floor(this.random() * bottoms.length)];
      o.y = GROUND_Y - bottom - o.h;
      o.vx = 25;
    }
    this.obstacles.push(o);

    const minGap = this.speed * 0.7 + 64;
    const gap = minGap * (1 + this.random() * 0.8);
    this.untilNextObstacle = gap;

    // Seeds: an arc over the obstacle, or a line on the ground after it.
    const r = this.random();
    if (r < 0.35 && kind !== 'owl') {
      const apex = o.h + 16;
      for (let i = -2; i <= 2; i++) {
        const t = i / 2.6;
        this.seedsOnField.push({
          x: o.x + o.w / 2 + i * 13,
          y: GROUND_Y - 10 - apex * (1 - t * t),
          phase: this.random() * 6,
        });
      }
    } else if (r < 0.6) {
      const startX = o.x + o.w + gap * 0.3;
      for (let i = 0; i < 4; i++) {
        this.seedsOnField.push({ x: startX + i * 12, y: GROUND_Y - 9, phase: i * 0.7 });
      }
    }
  }

  private updateSeeds(dx: number): void {
    const box = this.playerBox();
    const reach = { x: box.x - 3, y: box.y - 3, w: box.w + 6, h: box.h + 6 };
    this.seedsOnField = this.seedsOnField.filter((s) => {
      s.x -= dx;
      if (overlaps(reach, { x: s.x - 1, y: s.y - 1, w: 3, h: 3 })) {
        this.seeds++;
        this.audio.seed(this.streak);
        this.streak++;
        this.streakTimer = 1.2;
        this.events.onSeeds(this.seeds);
        this.sparkle(s.x, s.y, 4);
        return false;
      }
      return s.x > -10;
    });
  }

  private tortoiseX(): number {
    const rem = this.state === 'title' ? 1 : remainingGap(this.distance);
    return PLAYER_X + 60 + 210 * Math.pow(rem, 0.4);
  }

  private updateTortoise(dt: number): void {
    if (this.tortoiseHop < 0 || this.tortoiseVy !== 0) {
      this.tortoiseVy += 500 * dt;
      this.tortoiseHop += this.tortoiseVy * dt;
      if (this.tortoiseHop >= 0) {
        this.tortoiseHop = 0;
        this.tortoiseVy = 0;
      }
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private puff(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x,
        y,
        vx: (this.random() - 0.5) * 60 - this.speed * 0.2,
        vy: -this.random() * 30,
        gravity: 80,
        life: 0.3,
        maxLife: 0.3,
        size: 1,
        color: COLORS.clayDeep,
      });
    }
  }

  private sparkle(x: number, y: number, n = 10): void {
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2;
      const v = 20 + this.random() * 50;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        gravity: 0,
        life: 0.5,
        maxLife: 0.5,
        size: 1,
        color: COLORS.white,
      });
    }
  }

  // -- Rendering ------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    if (this.shake > 0) {
      const m = Math.ceil(this.shake * 8);
      ctx.translate(Math.round((this.random() - 0.5) * m), Math.round((this.random() - 0.5) * m));
    }

    this.background ??= new Background(this.sprites);
    this.background.draw(ctx, this.scroll, this.time);
    this.drawTortoise(ctx);

    for (const s of this.seedsOnField) this.drawSeed(ctx, s);
    for (const o of this.obstacles) {
      const frame = Math.floor(o.phase * 8) % 2;
      const bob = o.kind === 'owl' ? this.owlBob(o) : 0;
      ctx.drawImage(this.spriteFor(o.kind, frame), Math.round(o.x), Math.round(o.y + bob));
    }

    this.drawPlayer(ctx);

    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, (p.life / p.maxLife) * 1.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (this.state === 'over') {
      ctx.fillStyle = 'rgba(28, 18, 16, 0.25)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  private spriteFor(kind: ObstacleKind, frame: number): Sprite {
    switch (kind) {
      case 'owl':
        return this.sprites.owl[frame];
      default:
        return this.sprites[kind];
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const s = this.sprites;
    if (this.state === 'over') {
      ctx.drawImage(s.fallen, PLAYER_X, GROUND_Y - s.fallen.height);
      return;
    }
    if (this.isDucking()) {
      ctx.drawImage(s.duck, PLAYER_X, GROUND_Y - s.duck.height);
      return;
    }
    const sprite = this.onGround ? s.run[Math.floor(this.runPhase) % s.run.length] : s.jump;
    ctx.drawImage(sprite, PLAYER_X, Math.round(this.y));
  }

  private drawTortoise(ctx: CanvasRenderingContext2D): void {
    const frame = Math.floor(this.time * 4) % 2;
    const sprite = this.sprites.tortoise[frame];
    const x = Math.round(this.tortoiseX());
    ctx.drawImage(sprite, x, GROUND_Y - sprite.height + Math.round(this.tortoiseHop));
  }

  private drawSeed(ctx: CanvasRenderingContext2D, s: Seed): void {
    const x = Math.round(s.x);
    const y = Math.round(s.y + Math.sin(this.time * 4 + s.phase));
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillRect(x - 1, y, 3, 1);
    if (Math.sin(this.time * 6 + s.phase) > 0.6) {
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}
