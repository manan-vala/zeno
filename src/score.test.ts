import { describe, expect, it } from 'vitest';
import { STAGE_LENGTH } from './config';
import { formatGapDecimal, formatStageFraction, gapClosed, remainingGap, stageFor, tauntFor } from './score';

describe('score', () => {
  it('halves the remaining gap every stage', () => {
    expect(remainingGap(0)).toBe(1);
    expect(remainingGap(STAGE_LENGTH)).toBeCloseTo(0.5);
    expect(remainingGap(STAGE_LENGTH * 3)).toBeCloseTo(0.125);
  });

  it('never closes the gap completely', () => {
    expect(gapClosed(STAGE_LENGTH * 40)).toBeLessThan(1);
    expect(formatGapDecimal(STAGE_LENGTH * 40).startsWith('0.')).toBe(true);
  });

  it('counts completed halvings as stages', () => {
    expect(stageFor(0)).toBe(0);
    expect(stageFor(STAGE_LENGTH - 1)).toBe(0);
    expect(stageFor(STAGE_LENGTH)).toBe(1);
    expect(stageFor(-5)).toBe(0);
  });

  it('formats stage fractions', () => {
    expect(formatStageFraction(0)).toBe('0');
    expect(formatStageFraction(1)).toBe('1/2');
    expect(formatStageFraction(3)).toBe('7/8');
    expect(formatStageFraction(16)).toBe('65535/65536');
    expect(formatStageFraction(19)).toBe('1 − 2⁻¹⁹');
  });

  it('truncates the decimal instead of rounding up', () => {
    expect(formatGapDecimal(0)).toBe('0.0000');
    expect(formatGapDecimal(STAGE_LENGTH)).toBe('0.5000');
    expect(formatGapDecimal(STAGE_LENGTH * 10)).toBe('0.9990234');
  });

  it('always has a taunt', () => {
    for (let s = 0; s < 100; s++) expect(tauntFor(s)).toBeTruthy();
  });
});

describe('very long runs', () => {
  it.each([53, 54, 60, 200, 2000])('never shows 1 or more after %i halvings', (stage) => {
    const text = formatGapDecimal(STAGE_LENGTH * stage + 1);
    expect(text.startsWith('0.')).toBe(true);
    expect(Number(text)).toBeLessThan(1);
  });
});
