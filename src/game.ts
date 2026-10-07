import type { AudioEngine } from './audio';
import { inset, overlaps, type Box } from './collision';
import { DEATH, GROUND_Y, INSTANT, PHYSICS, PLAYER_X, SPEED, VIEW_W } from './config';
import { remainingGap, stageFor } from './score';
import type { SpriteSheet } from './sprites';
import { nightness } from './theme';

export type GameState = 'title' | 'running' | 'paused' | 'over' | 'reassembling';

export type ObstacleKind = 'amphora' | 'amphoraPair' | 'columnBroken' | 'columnTall' | 'owl';

export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Extra speed for things that move on their own (owls fly towards you). */
  vx: number;
  phase: number;
}

export interface Seed {
  x: number;
  y: number;
  phase: number;
}

/** Particle colours are roles; the renderer maps them to the current theme. */
export type Tone = 'figure' | 'white' | 'dust';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  tone: Tone;
}

export interface GameEvents {
  onStateChange(state: GameState): void;
  onStage(stage: number): void;
  onSeeds(count: number): void;
  onInstant(charge: number, active: boolean): void;
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
  | 'shatter'
  | 'reassemble'
  | 'gameOver'
  | 'start'
  | 'startMusic'
  | 'stopMusic'
  | 'setIntensity'
  | 'instant'
  | 'suspend'
  | 'resume'
>;

/** Only sizes are needed for the simulation; the renderer owns the pictures. */
type Sizes = Pick<SpriteSheet, 'amphora' | 'amphoraPair' | 'columnBroken' | 'columnTall' | 'owl'>;

export interface GameOptions {
  audio: GameAudio;
  events: GameEvents;
  best: number;
  /** Sprite sizes, used for obstacle hitboxes. */
  sprites: Sizes;
  /** Random source in [0, 1); injectable so tests are deterministic. */
  random?: () => number;
}

const STEP = 1 / 120;
const TITLE_SPEED = 70;
const STAND_Y = GROUND_Y - 24;

/**
 * The simulation. Everything public here is read by the renderer and tests;
 * only the game itself changes it.
 */
export class Game {
  state: GameState = 'title';
  distance = 0;
  best: number;
  seeds = 0;

  scroll = 0;
  /** Real seconds since the page loaded (not slowed by Instant). */
  time = 0;
  speed = SPEED.start;
  stage = 0;

  y = STAND_Y; // top of Achilles' sprite
  vy = 0;
  onGround = true;
  jumpHeld = false;
  duckHeld = false;
  runPhase = 0;

  obstacles: Obstacle[] = [];
  seedsOnField: Seed[] = [];
  particles: Particle[] = [];
  untilNextObstacle = 0;

  tortoiseHop = 0;
  shake = 0;

  /** Instant: 0..1 charge from seeds, and seconds left while active. */
  instantCharge = 0;
  instantLeft = 0;
  /** The arrow that crosses the sky during Instant. */
  arrow: { x: number; y: number } | null = null;

  /** Where Achilles hit; drives the cracking vase. */
  crash: { x: number; y: number } | null = null;
  overAt = 0;
  reassembleAt = 0;

  private audio: GameAudio;
  private events: GameEvents;
  private random: () => number;
  private sizes: Sizes;
  private dustTimer = 0;
  private streak = 0;
  private streakTimer = 0;
  private tortoiseVy = 0;
  private accumulator = 0;

  constructor(options: GameOptions) {
    this.audio = options.audio;
    this.events = options.events;
    this.best = options.best;
    this.random = options.random ?? Math.random;
    this.sizes = options.sprites;
  }

  // -- Input ----------------------------------------------------------------

  /** Space / up / tap. Starts or restarts the game outside of a run. */
  pressJump(): void {
    this.audio.unlock();
    if (this.state === 'title') return this.start();
    if (this.state === 'paused') return this.togglePause();
    if (this.state === 'over') {
      if (this.time - this.overAt >= DEATH.restartAfter) this.reassemble();
      return;
    }
    if (this.state !== 'running') return;
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

  /** Stops time (nearly): bullet time for the whole world. Needs a full charge. */
  activateInstant(): boolean {
    if (this.state !== 'running' || this.instantCharge < 1 || this.instantLeft > 0) return false;
    this.instantCharge = 0;
    this.instantLeft = INSTANT.duration;
    this.arrow = { x: -20, y: 30 };
    this.audio.instant(true);
    this.events.onInstant(0, true);
    return true;
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

  /** First run from the title screen. */
  start(): void {
    this.resetRun();
    this.beginRun();
  }

  /** After a crash: reset, then let the vase fly back together before running. */
  private reassemble(): void {
    this.resetRun();
    this.reassembleAt = this.time;
    this.setState('reassembling');
    this.audio.reassemble();
  }

  private resetRun(): void {
    this.distance = 0;
    this.speed = SPEED.start;
    this.stage = 0;
    this.seeds = 0;
    this.streak = 0;
    this.y = STAND_Y;
    this.vy = 0;
    this.onGround = true;
    this.jumpHeld = false;
    this.obstacles = [];
    this.seedsOnField = [];
    this.particles = [];
    this.untilNextObstacle = 220;
    this.shake = 0;
    this.instantCharge = 0;
    this.instantLeft = 0;
    this.arrow = null;
    this.events.onStage(0);
    this.events.onSeeds(0);
    this.events.onInstant(0, false);
  }

  private beginRun(): void {
    this.crash = null;
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
    this.crash = { x: PLAYER_X + 12, y: this.y + 12 };
    this.shake = 0.35;
    if (this.instantLeft > 0) {
      this.instantLeft = 0;
      this.audio.instant(false);
    }
    this.audio.stopMusic();
    this.audio.hit();
    this.audio.shatter(DEATH.shatterAt);
    this.audio.gameOver();
    for (let i = 0; i < 14; i++) {
      this.particles.push({
        x: this.crash.x,
        y: this.crash.y,
        vx: (this.random() - 0.3) * 160,
        vy: -60 - this.random() * 140,
        gravity: 520,
        life: 0.6,
        maxLife: 0.6,
        size: this.random() < 0.4 ? 2 : 1,
        tone: this.random() < 0.8 ? 'figure' : 'white',
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

  /** How fast the world moves relative to Achilles: 1 normally, ~0.15 in Instant. */
  worldScale(): number {
    if (this.instantLeft <= 0) return 1;
    const elapsed = INSTANT.duration - this.instantLeft;
    const f = Math.min(1, elapsed / INSTANT.ease, this.instantLeft / INSTANT.ease);
    return 1 + (INSTANT.worldScale - 1) * f;
  }

  /** 0 for black-figure day, 1 for red-figure night. */
  nightness(): number {
    return this.state === 'title' ? 0 : nightness(this.distance);
  }

  private update(dt: number): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.updateTortoise(dt);

    if (this.state === 'title') {
      this.updateParticles(dt);
      this.scroll += TITLE_SPEED * dt;
      this.runPhase += dt * 8;
      return;
    }
    if (this.state === 'reassembling') {
      if (this.time - this.reassembleAt >= DEATH.reassembleTime) this.beginRun();
      return;
    }
    if (this.state !== 'running') {
      this.updateParticles(dt);
      return;
    }

    // Instant is bullet time: the whole world, Achilles included, runs slow,
    // so every jump covers the same ground but you get far longer to react.
    const wdt = dt * this.worldScale();
    this.updateParticles(wdt);

    this.speed = Math.min(SPEED.max, this.speed + SPEED.accel * wdt);
    const dx = this.speed * wdt;
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
    this.audio.setIntensity((this.speed - SPEED.start) / (SPEED.max - SPEED.start), this.seeds);

    this.updatePlayer(wdt);
    this.updateObstacles(wdt, dx);
    if (this.state !== 'running') return;
    this.updateSeeds(dx);
    this.updateInstant(dt, wdt);

    this.streakTimer -= dt;
    if (this.streakTimer <= 0) this.streak = 0;
  }

  private updateInstant(dt: number, wdt: number): void {
    if (this.arrow) {
      this.arrow.x += 420 * wdt;
      if (this.arrow.x > VIEW_W + 20) this.arrow = null;
    }
    if (this.instantLeft <= 0) return;
    this.instantLeft -= dt;
    if (this.instantLeft <= 0) {
      this.instantLeft = 0;
      this.audio.instant(false);
      this.events.onInstant(this.instantCharge, false);
    }
  }

  private updatePlayer(dt: number): void {
    if (!this.onGround) {
      let g = PHYSICS.gravityReleased;
      if (this.duckHeld) g = PHYSICS.gravityFastFall;
      else if (this.jumpHeld && this.vy < 0) g = PHYSICS.gravity;
      this.vy += g * dt;
      this.y += this.vy * dt;
      if (this.y >= STAND_Y) {
        this.y = STAND_Y;
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
          tone: 'dust',
        });
      }
    }
  }

  isDucking(): boolean {
    return this.duckHeld && this.onGround;
  }

  private playerBox(): Box {
    if (this.isDucking()) return inset({ x: PLAYER_X + 6, y: GROUND_Y - 12, w: 16, h: 12 }, 1);
    return inset({ x: PLAYER_X + 5, y: this.y + 3, w: 11, h: 21 }, 1);
  }

  private updateObstacles(wdt: number, dx: number): void {
    this.untilNextObstacle -= dx;
    if (this.untilNextObstacle <= 0) this.spawnObstacle();

    const player = this.playerBox();
    for (const o of this.obstacles) {
      o.x -= dx + o.vx * wdt;
      o.phase += wdt;
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

  owlBob(o: Obstacle): number {
    return Math.round(Math.sin(o.phase * 6) * 1.5);
  }

  private spawnObstacle(): void {
    const pool: ObstacleKind[] = ['amphora', 'amphora', 'columnBroken'];
    if (this.stage >= 1) pool.push('amphoraPair', 'columnTall');
    if (this.stage >= 2) pool.push('owl', 'owl');
    const kind = pool[Math.floor(this.random() * pool.length)];

    const size = kind === 'owl' ? this.sizes.owl[0] : this.sizes[kind];
    const o: Obstacle = {
      kind,
      x: VIEW_W + 8,
      y: GROUND_Y - size.height,
      w: size.width,
      h: size.height,
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
        this.collectSeed(s);
        return false;
      }
      return s.x > -10;
    });
  }

  private collectSeed(s: Seed): void {
    this.seeds++;
    this.audio.seed(this.streak);
    this.streak++;
    this.streakTimer = 1.2;
    this.events.onSeeds(this.seeds);
    this.sparkle(s.x, s.y, 4);
    if (this.instantCharge < 1) {
      this.instantCharge = Math.min(1, this.instantCharge + 1 / INSTANT.seedsToFill);
      // Snap away float error so the last seed makes exactly a full charge.
      if (this.instantCharge > 0.999) this.instantCharge = 1;
      this.events.onInstant(this.instantCharge, this.instantLeft > 0);
    }
  }

  tortoiseX(): number {
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
        tone: 'dust',
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
        tone: 'white',
      });
    }
  }
}
