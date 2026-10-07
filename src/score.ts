import { STAGE_LENGTH } from './config';

/** Number of times the gap to the tortoise has been halved. */
export function stageFor(distance: number): number {
  return Math.max(0, Math.floor(distance / STAGE_LENGTH));
}

/** Fraction of the gap still left, in (0, 1]. Halves every STAGE_LENGTH. */
export function remainingGap(distance: number): number {
  return Math.pow(2, -Math.max(0, distance) / STAGE_LENGTH);
}

/** Fraction of the gap closed, in [0, 1). Approaches 1 but never reaches it. */
export function gapClosed(distance: number): number {
  return 1 - remainingGap(distance);
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

function superscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT[d] ?? d)
    .join('');
}

/** "0", "1/2", "3/4", … "65535/65536", then "1 − 2⁻¹⁷" once the numbers get silly. */
export function formatStageFraction(stage: number): string {
  if (stage <= 0) return '0';
  if (stage <= 16) {
    const den = 2 ** stage;
    return `${den - 1}/${den}`;
  }
  return `1 − 2⁻${superscript(stage)}`;
}

/**
 * Decimal readout of the gap closed. Shows enough digits that it keeps changing
 * as you run, and never rounds up to 1.
 */
export function formatGapDecimal(distance: number): string {
  const stage = stageFor(distance);
  const digits = Math.min(14, Math.max(4, Math.ceil((stage + 1) * 0.31) + 3));
  const value = gapClosed(distance);
  const factor = 10 ** digits;
  const truncated = Math.floor(value * factor) / factor;
  return truncated.toFixed(digits);
}

const TAUNTS = [
  'The tortoise has a head start. Catch it.',
  'Half the gap closed. Half remains.',
  'Three quarters there. The tortoise is unimpressed.',
  'Seven eighths. So close. Or is it?',
  'To get there, first you must get halfway.',
  'Motion is an illusion. Keep running anyway.',
  'Swift-footed Achilles, they call you.',
  'Every stride halves the gap. None of them end it.',
  'The tortoise has not looked back once.',
  'Somewhere, Zeno is smiling.',
  'An infinite number of steps. You have taken a few.',
  'Is the arrow moving? Are you?',
];

export function tauntFor(stage: number): string {
  if (stage < TAUNTS.length) return TAUNTS[stage];
  // After the scripted lines, cycle through the later ones.
  const loop = TAUNTS.slice(4);
  return loop[(stage - TAUNTS.length) % loop.length];
}
