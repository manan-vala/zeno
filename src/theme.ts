import { COLORS, NIGHT, STAGE_LENGTH } from './config';

/** Colours for one painting style. Night is red-figure: figures and ground swap. */
export interface Theme {
  night: boolean;
  sky: string;
  glow: string; // sun or moon
  hills: string;
  silhouettes: string; // temples and trees
  figure: string; // Achilles, obstacles, bands
  dust: string;
}

export const DAY: Theme = {
  night: false,
  sky: COLORS.clay,
  glow: COLORS.clayLight,
  hills: COLORS.clayDark,
  silhouettes: COLORS.clayDeep,
  figure: COLORS.ink,
  dust: COLORS.clayDeep,
};

export const NIGHT_THEME: Theme = {
  night: true,
  sky: COLORS.ink,
  glow: COLORS.clay,
  hills: '#2a1813',
  silhouettes: '#3b231a',
  figure: COLORS.clay,
  dust: '#5a3424',
};

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * How much of the red-figure night is showing, from 0 (day) to 1 (night).
 * Day for the first few halvings, then night, then day again, with a
 * cross-fade at each change.
 */
export function nightness(distance: number): number {
  const phaseLength = NIGHT.stagesPerPhase * STAGE_LENGTH;
  const phase = Math.floor(Math.max(0, distance) / phaseLength);
  if (phase === 0) return 0;
  const into = distance - phase * phaseLength;
  const target = phase % 2;
  const t = smooth(Math.min(1, into / NIGHT.fade));
  return (1 - target) + (target - (1 - target)) * t;
}
