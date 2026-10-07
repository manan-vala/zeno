// Test helpers: run the real game simulation in Node, without a browser.
import { GROUND_Y, PLAYER_X } from '../config';
import { Game, type GameAudio, type GameEvents, type GameState } from '../game';
import type { PixelGrid } from '../pixels';
import { buildSprites, type Sprite } from '../sprites';

/** Records every sound the game asks for, in order. */
export function recordingAudio(): GameAudio & { calls: string[] } {
  const calls: string[] = [];
  const log =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(args.length ? `${name}(${args.join(',')})` : name);
    };
  return {
    calls,
    unlock: () => {},
    jump: log('jump'),
    land: log('land'),
    duck: log('duck'),
    seed: log('seed'),
    halve: log('halve'),
    hit: log('hit'),
    shatter: log('shatter'),
    reassemble: log('reassemble'),
    instant: log('instant'),
    gameOver: log('gameOver'),
    start: log('start'),
    startMusic: log('startMusic'),
    stopMusic: log('stopMusic'),
    setIntensity: () => {},
    suspend: log('suspend'),
    resume: log('resume'),
  };
}

export interface RecordedEvents extends GameEvents {
  states: GameState[];
  stages: number[];
  seeds: number[];
  instants: [number, boolean][];
  gameOvers: Parameters<GameEvents['onGameOver']>[0][];
}

export function recordingEvents(): RecordedEvents {
  const e: RecordedEvents = {
    states: [],
    stages: [],
    seeds: [],
    instants: [],
    gameOvers: [],
    onStateChange: (s) => e.states.push(s),
    onStage: (s) => e.stages.push(s),
    onSeeds: (n) => e.seeds.push(n),
    onInstant: (charge, active) => e.instants.push([charge, active]),
    onGameOver: (r) => e.gameOvers.push(r),
  };
  return e;
}

/** Mulberry32: tiny, fast, seedable PRNG. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Real sprite sizes, no canvases. */
const sizeOnly = (g: PixelGrid) => ({ width: g.w, height: g.h }) as unknown as Sprite;

export interface Internals {
  obstacles: { kind: string; x: number; y: number; w: number; h: number; vx: number; phase: number }[];
  seedsOnField: { x: number; y: number; phase: number }[];
  y: number;
  vy: number;
  onGround: boolean;
  speed: number;
  stage: number;
  time: number;
  untilNextObstacle: number;
  instantCharge: number;
  instantLeft: number;
}

export function internals(game: Game): Internals {
  return game as unknown as Internals;
}

export function makeGame(seed = 1, best = 0) {
  const audio = recordingAudio();
  const events = recordingEvents();
  const game = new Game({ audio, events, best, sprites: buildSprites(sizeOnly), random: seededRandom(seed) });
  return { game, audio, events, g: internals(game) };
}

/** Advances the game by `seconds` in 60 Hz frames, like the browser loop. */
export function run(game: Game, seconds: number, eachFrame?: () => void): void {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    eachFrame?.();
    game.tick(1 / 60);
  }
}

/** Stops new obstacles from spawning for the rest of the run. */
export function clearField(g: Internals): void {
  g.obstacles.length = 0;
  g.seedsOnField.length = 0;
  g.untilNextObstacle = Number.POSITIVE_INFINITY;
}

export const PLAYER_FRONT = PLAYER_X + 16;
export { GROUND_Y };

/**
 * A simple, honest autopilot: it only reacts to what is on screen, the way a
 * player would. If it can't survive, a pattern is probably unfair.
 */
export function autopilot(game: Game): () => void {
  const g = internals(game);
  return () => {
    if (game.state !== 'running') return;
    const ahead = g.obstacles.filter((o) => o.x + o.w > PLAYER_X + 3).sort((a, b) => a.x - b.x)[0];
    let duck = false;
    if (ahead) {
      const dist = ahead.x - PLAYER_FRONT;
      const bottom = ahead.y + ahead.h;
      if (ahead.kind === 'owl' && bottom <= GROUND_Y - 30) {
        // High owl: stay on the ground and let it pass overhead.
      } else if (ahead.kind === 'owl' && bottom <= GROUND_Y - 15) {
        duck = dist < 30 + g.speed * 0.15;
      } else if (dist < g.speed * 0.12 + 6 && g.onGround) {
        game.pressJump();
      }
    }
    if (!g.onGround && g.vy > 0) game.releaseJump();
    game.setDuck(duck);
  };
}
