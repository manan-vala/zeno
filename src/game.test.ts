import { describe, expect, it } from 'vitest';
import { PHYSICS, SPEED, STAGE_LENGTH } from './config';
import { autopilot, clearField, GROUND_Y, makeGame, PLAYER_FRONT, run } from './testing/harness';

const STAND_Y = GROUND_Y - 24;

function started(seed = 1, best = 0) {
  const h = makeGame(seed, best);
  h.game.pressJump(); // title → running
  h.game.releaseJump();
  return h;
}

function placeObstacle(h: ReturnType<typeof started>, kind: string, w: number, h_: number, bottomAboveGround = 0) {
  clearField(h.g);
  h.g.obstacles.push({ kind, x: PLAYER_FRONT + 30, y: GROUND_Y - bottomAboveGround - h_, w, h: h_, vx: 0, phase: 0 });
}

describe('lifecycle', () => {
  it('starts on the title screen and begins a run on the first jump press', () => {
    const { game, audio, events } = makeGame();
    expect(game.state).toBe('title');
    game.pressJump();
    expect(game.state).toBe('running');
    expect(events.states).toEqual(['running']);
    expect(audio.calls).toEqual(['start', 'startMusic']);
  });

  it('does not advance the score on the title screen', () => {
    const { game } = makeGame();
    run(game, 3);
    expect(game.distance).toBe(0);
  });

  it('pauses and resumes', () => {
    const { game, audio } = started();
    run(game, 1);
    game.togglePause();
    expect(game.state).toBe('paused');
    const d = game.distance;
    run(game, 2);
    expect(game.distance).toBe(d);
    game.pressJump(); // resumes rather than jumping
    expect(game.state).toBe('running');
    expect(audio.calls).toContain('suspend');
    expect(audio.calls).toContain('resume');
  });

  it('only auto-pauses during a run', () => {
    const { game } = makeGame();
    game.pauseIfRunning();
    expect(game.state).toBe('title');
  });
});

describe('running', () => {
  it('accelerates and caps at max speed', () => {
    const h = started();
    clearField(h.g);
    run(h.game, 1, () => clearField(h.g));
    expect(h.g.speed).toBeGreaterThan(SPEED.start);
    run(h.game, 120, () => clearField(h.g));
    expect(h.g.speed).toBe(SPEED.max);
  });

  it('halves the gap every STAGE_LENGTH and plays the chord', () => {
    const h = started();
    run(h.game, 30, () => clearField(h.g));
    const expected = Math.floor(h.game.distance / STAGE_LENGTH);
    expect(expected).toBeGreaterThanOrEqual(2);
    expect(h.events.stages.slice(1)).toEqual(Array.from({ length: expected }, (_, i) => i + 1));
    expect(h.audio.calls.filter((c) => c === 'halve')).toHaveLength(expected);
  });
});

describe('jumping and ducking', () => {
  function peakHeight(holdSeconds: number): number {
    const h = started();
    clearField(h.g);
    h.game.pressJump();
    let peak = 0;
    let t = 0;
    run(h.game, 1.5, () => {
      if (t >= holdSeconds) h.game.releaseJump();
      t += 1 / 60;
      peak = Math.max(peak, STAND_Y - h.g.y);
      clearField(h.g);
    });
    expect(h.g.onGround).toBe(true);
    return peak;
  }

  it('jumps higher when the button is held', () => {
    const held = peakHeight(1);
    const tapped = peakHeight(0);
    expect(held).toBeGreaterThan(45);
    expect(held).toBeLessThan(55);
    expect(tapped).toBeLessThan(30);
  });

  it('lands and plays the landing sound', () => {
    const h = started();
    clearField(h.g);
    h.game.pressJump();
    expect(h.g.onGround).toBe(false);
    expect(h.g.vy).toBe(-PHYSICS.jumpVelocity);
    run(h.game, 1, () => clearField(h.g));
    expect(h.g.onGround).toBe(true);
    expect(h.g.y).toBe(STAND_Y);
    expect(h.audio.calls).toContain('land');
  });

  it('cannot double jump', () => {
    const h = started();
    clearField(h.g);
    h.game.pressJump();
    run(h.game, 0.2, () => clearField(h.g));
    const vy = h.g.vy;
    h.game.releaseJump();
    h.game.pressJump();
    expect(h.g.vy).toBe(vy);
    expect(h.audio.calls.filter((c) => c === 'jump')).toHaveLength(1);
  });

  it('cannot jump while ducking on the ground', () => {
    const h = started();
    h.game.setDuck(true);
    h.game.pressJump();
    expect(h.g.onGround).toBe(true);
  });

  it('falls faster when ducking in the air', () => {
    const airTime = (duck: boolean) => {
      const h = started();
      clearField(h.g);
      h.game.pressJump();
      run(h.game, 0.25, () => clearField(h.g));
      h.game.releaseJump();
      h.game.setDuck(duck);
      let frames = 0;
      while (!h.g.onGround && frames < 600) {
        run(h.game, 1 / 60, () => clearField(h.g));
        frames++;
      }
      return frames;
    };
    expect(airTime(true)).toBeLessThan(airTime(false));
  });
});

describe('collisions', () => {
  it('ends the run on hitting an amphora and reports the result', () => {
    const h = started(1, 0);
    placeObstacle(h, 'amphora', 10, 16);
    run(h.game, 1);
    expect(h.game.state).toBe('over');
    expect(h.audio.calls).toEqual(expect.arrayContaining(['stopMusic', 'hit', 'gameOver']));
    expect(h.events.gameOvers).toHaveLength(1);
    const result = h.events.gameOvers[0];
    expect(result.previousBest).toBe(0);
    expect(result.best).toBe(h.game.distance);
  });

  it('keeps the previous best when the run is shorter', () => {
    const h = started(1, 999_999);
    placeObstacle(h, 'amphora', 10, 16);
    run(h.game, 1);
    expect(h.events.gameOvers[0].best).toBe(999_999);
    expect(h.game.best).toBe(999_999);
  });

  it('clears an amphora with a well-timed jump', () => {
    const h = started();
    placeObstacle(h, 'amphora', 10, 16);
    h.g.obstacles[0].x = PLAYER_FRONT + 22;
    h.game.pressJump();
    run(h.game, 1.2, () => {
      if (h.g.obstacles[0] && h.g.obstacles[0].x < -20) clearField(h.g);
      h.g.untilNextObstacle = Infinity;
    });
    expect(h.game.state).toBe('running');
  });

  it('ignores restart presses for half a second after dying', () => {
    const h = started();
    placeObstacle(h, 'amphora', 10, 16);
    while (h.game.state === 'running') run(h.game, 1 / 60);
    h.game.pressJump();
    expect(h.game.state).toBe('over');
    run(h.game, 0.6);
    h.game.pressJump();
    expect(h.game.state).toBe('running');
    expect(h.game.distance).toBe(0);
  });

  it.each([
    ['low owl, standing', 4, false, 'over'],
    ['middle owl, standing', 17, false, 'over'],
    ['middle owl, ducking', 17, true, 'running'],
    ['high owl, standing', 32, false, 'running'],
  ])('%s → %s', (_name, bottom, duck, expected) => {
    const h = started();
    placeObstacle(h, 'owl', 14, 10, bottom);
    h.game.setDuck(duck);
    run(h.game, 1.2, () => {
      h.g.untilNextObstacle = Infinity;
    });
    expect(h.game.state).toBe(expected);
  });
});

describe('seeds', () => {
  it('collects seeds and climbs the scale during a streak', () => {
    const h = started();
    clearField(h.g);
    h.g.seedsOnField.push({ x: PLAYER_FRONT - 4, y: GROUND_Y - 10, phase: 0 });
    run(h.game, 1 / 60);
    h.g.seedsOnField.push({ x: PLAYER_FRONT - 4, y: GROUND_Y - 10, phase: 0 });
    run(h.game, 1 / 60);
    expect(h.game.seeds).toBe(2);
    expect(h.audio.calls.filter((c) => c.startsWith('seed'))).toEqual(['seed(0)', 'seed(1)']);
    // The streak resets after a pause in pickups.
    run(h.game, 1.5, () => clearField(h.g));
    h.g.seedsOnField.push({ x: PLAYER_FRONT - 4, y: GROUND_Y - 10, phase: 0 });
    run(h.game, 1 / 60);
    expect(h.audio.calls.filter((c) => c.startsWith('seed')).at(-1)).toBe('seed(0)');
    expect(h.events.seeds.at(-1)).toBe(3);
  });

  it('ignores seeds out of reach', () => {
    const h = started();
    clearField(h.g);
    h.g.seedsOnField.push({ x: PLAYER_FRONT - 4, y: GROUND_Y - 70, phase: 0 });
    run(h.game, 1 / 60);
    expect(h.game.seeds).toBe(0);
  });
});

describe('spawning', () => {
  it('keeps owls out of the first two stages', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const h = started(seed);
      const kinds = new Set<string>();
      run(h.game, 60, () => {
        h.g.obstacles.forEach((o) => kinds.add(`${o.kind}@${h.g.stage}`));
        // Keep the run alive: remove anything about to hit.
        h.g.obstacles = h.g.obstacles.filter((o) => o.x > PLAYER_FRONT + 4);
      });
      for (const k of kinds) {
        const [kind, stage] = k.split('@');
        if (kind === 'owl') expect(Number(stage)).toBeGreaterThanOrEqual(2);
        if (kind === 'amphoraPair' || kind === 'columnTall') expect(Number(stage)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('always leaves room to land between obstacles', () => {
    const h = started(7);
    const spawned: { x: number; w: number }[] = [];
    let minClearance = Infinity;
    run(h.game, 120, () => {
      for (const o of h.g.obstacles) {
        if (spawned.includes(o)) continue;
        const prev = spawned.at(-1);
        // Both measured on the frame the new one appears, so they share a scroll offset.
        if (prev) minClearance = Math.min(minClearance, o.x - (prev.x + prev.w));
        spawned.push(o);
      }
      // Keep the run alive: drop anything about to hit.
      h.g.obstacles = h.g.obstacles.filter((o) => o.x > PLAYER_FRONT + 4);
    });
    expect(spawned.length).toBeGreaterThan(50);
    // A full jump covers about speed × 0.51 s; at top speed that's ~170 px.
    expect(minClearance).toBeGreaterThan(170);
  });
});

describe('fairness (autopilot)', () => {
  it.each([1, 2, 3, 4, 5])('seed %i: survives 10 minutes at full speed', (seed) => {
    const h = started(seed);
    const pilot = autopilot(h.game);
    run(h.game, 600, pilot);
    expect({ state: h.game.state, stage: h.g.stage }).toMatchObject({ state: 'running' });
    expect(h.g.stage).toBeGreaterThan(100);
  });
});
