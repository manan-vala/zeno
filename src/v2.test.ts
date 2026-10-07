import { describe, expect, it } from 'vitest';
import { musicLayers } from './audio';
import { INSTANT, NIGHT, STAGE_LENGTH } from './config';
import { fracture } from './shatter';
import { autopilot, clearField, GROUND_Y, makeGame, PLAYER_FRONT, run, seededRandom } from './testing/harness';
import { nightness } from './theme';

function started(seed = 1) {
  const h = makeGame(seed);
  h.game.pressJump();
  h.game.releaseJump();
  return h;
}

function feedSeeds(h: ReturnType<typeof started>, n: number) {
  for (let i = 0; i < n; i++) {
    h.g.seedsOnField.push({ x: PLAYER_FRONT - 4, y: GROUND_Y - 10, phase: 0 });
    run(h.game, 1 / 60, () => (h.g.untilNextObstacle = Infinity));
  }
}

describe('Instant (the arrow paradox)', () => {
  it('charges one eighth per seed and is ready after eight', () => {
    const h = started();
    clearField(h.g);
    feedSeeds(h, 7);
    expect(h.g.instantCharge).toBeCloseTo(7 / 8);
    expect(h.game.activateInstant()).toBe(false);
    feedSeeds(h, 1);
    expect(h.g.instantCharge).toBe(1);
    expect(h.events.instants.at(-1)).toEqual([1, false]);
  });

  it('does nothing without a full charge or outside a run', () => {
    const fresh = makeGame();
    expect(fresh.game.activateInstant()).toBe(false); // title screen
    const h = started();
    expect(h.game.activateInstant()).toBe(false);
    expect(h.audio.calls).not.toContain('instant(true)');
  });

  it('is bullet time: a jump covers the same ground, just more slowly', () => {
    // Ground covered while airborne, and how long it took in real seconds.
    const jump = (useInstant: boolean) => {
      const h = started();
      clearField(h.g);
      feedSeeds(h, 8);
      h.g.speed = 200;
      if (useInstant) {
        h.game.activateInstant();
        run(h.game, INSTANT.ease + 0.05, () => clearField(h.g));
      }
      h.g.speed = 200;
      const from = h.game.distance;
      h.game.pressJump();
      let frames = 0;
      while (!h.g.onGround && frames < 600) {
        run(h.game, 1 / 60, () => {
          clearField(h.g);
          h.g.speed = 200;
        });
        frames++;
      }
      return { ground: h.game.distance - from, seconds: frames / 60, h };
    };
    const normal = jump(false);
    const slow = jump(true);
    expect(slow.ground).toBeGreaterThan(normal.ground * 0.85);
    expect(slow.ground).toBeLessThan(normal.ground * 1.15);
    expect(slow.seconds).toBeGreaterThan(normal.seconds * 2);
    expect(slow.h.audio.calls).toContain('instant(true)');
  });

  it('uses up the charge, cannot stack, and wears off', () => {
    const h = started();
    clearField(h.g);
    feedSeeds(h, 8);
    expect(h.game.activateInstant()).toBe(true);
    expect(h.g.instantCharge).toBe(0);
    expect(h.game.activateInstant()).toBe(false);
    run(h.game, 0.5, () => clearField(h.g));
    expect(h.game.worldScale()).toBeCloseTo(INSTANT.worldScale);
    run(h.game, INSTANT.duration, () => clearField(h.g));
    expect(h.g.instantLeft).toBe(0);
    expect(h.game.worldScale()).toBe(1);
    expect(h.audio.calls).toContain('instant(false)');
    expect(h.events.instants.at(-1)).toEqual([0, false]);
  });

  it('eases in and out instead of snapping', () => {
    const h = started();
    clearField(h.g);
    feedSeeds(h, 8);
    h.game.activateInstant();
    run(h.game, INSTANT.ease / 2, () => clearField(h.g));
    const s = h.game.worldScale();
    expect(s).toBeGreaterThan(INSTANT.worldScale);
    expect(s).toBeLessThan(1);
  });

  it('ends cleanly if Achilles crashes while time is stopped', () => {
    const h = started();
    clearField(h.g);
    feedSeeds(h, 8);
    h.game.activateInstant();
    h.g.obstacles.push({ kind: 'amphora', x: PLAYER_FRONT - 6, y: GROUND_Y - 16, w: 10, h: 16, vx: 0, phase: 0 });
    run(h.game, 0.2);
    expect(h.game.state).toBe('over');
    expect(h.g.instantLeft).toBe(0);
    expect(h.audio.calls).toContain('instant(false)');
  });

  it('resets the charge on a new run', () => {
    const h = started();
    clearField(h.g);
    feedSeeds(h, 5);
    h.g.obstacles.push({ kind: 'amphora', x: PLAYER_FRONT - 6, y: GROUND_Y - 16, w: 10, h: 16, vx: 0, phase: 0 });
    run(h.game, 0.2);
    run(h.game, 1.1);
    h.game.pressJump();
    expect(h.g.instantCharge).toBe(0);
  });

  it('never makes the game harder: the autopilot survives using it whenever ready', () => {
    const h = started(3);
    const pilot = autopilot(h.game);
    run(h.game, 120, () => {
      pilot();
      if (h.g.instantCharge >= 1) h.game.activateInstant();
    });
    expect(h.game.state).toBe('running');
    expect(h.audio.calls.filter((c) => c === 'instant(true)').length).toBeGreaterThan(0);
  });
});

describe('red-figure night', () => {
  const phase = NIGHT.stagesPerPhase * STAGE_LENGTH;

  it('is day for the first few halvings', () => {
    expect(nightness(0)).toBe(0);
    expect(nightness(phase - 1)).toBe(0);
  });

  it('fades to night, stays, then fades back to day', () => {
    expect(nightness(phase + NIGHT.fade / 2)).toBeCloseTo(0.5, 1);
    expect(nightness(phase + NIGHT.fade)).toBe(1);
    expect(nightness(phase * 2 - 1)).toBe(1);
    expect(nightness(phase * 2 + NIGHT.fade)).toBe(0);
    expect(nightness(phase * 3 + NIGHT.fade)).toBe(1);
  });

  it('never jumps: neighbouring distances give neighbouring values', () => {
    let prev = nightness(0);
    for (let d = 0; d < phase * 4; d += 5) {
      const n = nightness(d);
      expect(Math.abs(n - prev)).toBeLessThan(0.03);
      prev = n;
    }
  });

  it('shows day on the title screen', () => {
    const h = makeGame();
    expect(h.game.nightness()).toBe(0);
  });
});

describe('music from millet seeds', () => {
  it('adds a layer at 10, 25 and 50 seeds', () => {
    expect(musicLayers(0)).toBe(1);
    expect(musicLayers(9)).toBe(1);
    expect(musicLayers(10)).toBe(2);
    expect(musicLayers(25)).toBe(3);
    expect(musicLayers(49)).toBe(3);
    expect(musicLayers(50)).toBe(4);
    expect(musicLayers(5000)).toBe(4);
  });
});

describe('the breaking vase', () => {
  const area = (pts: [number, number][]) =>
    Math.abs(pts.reduce((a, [x, y], i) => {
      const [nx, ny] = pts[(i + 1) % pts.length];
      return a + x * ny - nx * y;
    }, 0)) / 2;

  it.each([
    [42, 88],
    [160, 60],
    [5, 5],
    [310, 110],
  ])('shards from an impact at (%i, %i) tile the whole picture', (x, y) => {
    for (let seed = 1; seed <= 20; seed++) {
      const f = fracture(x, y, 320, 120, seededRandom(seed));
      const total = f.shards.reduce((a, s) => a + area(s.points), 0);
      expect(total).toBeCloseTo(320 * 120, 0);
      expect(f.shards).toHaveLength(22);
      expect(f.cracks.length).toBeGreaterThan(0);
    }
  });
});
