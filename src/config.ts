// Logical (low-res) canvas size. Everything is drawn at this size and scaled up
// with nearest-neighbour sampling so pixels stay crisp.
export const VIEW_W = 320;
export const VIEW_H = 120;

export const GROUND_Y = 100; // y of the line Achilles runs on
export const TOP_BAND_H = 12; // decorative meander band at the top of the vase

export const PLAYER_X = 30;

export const PHYSICS = {
  gravity: 1150, // px/s² while rising with jump held
  gravityReleased: 2300, // px/s² when jump is released or falling
  gravityFastFall: 4200, // px/s² when ducking in the air
  jumpVelocity: 340, // px/s
};

export const SPEED = {
  start: 140, // px/s
  max: 330,
  accel: 4, // px/s added per second of running
};

// Distance (px) it takes to close half of the remaining gap to the tortoise.
export const STAGE_LENGTH = 1300;

// Black-figure pottery palette.
export const COLORS = {
  clay: '#c8693c',
  clayLight: '#d67b4b',
  clayDark: '#b75b33',
  clayDeep: '#a24e2b',
  ink: '#1c1210',
  incise: '#e09466',
  white: '#f2e5cf',
  red: '#7d2a1c',
};
