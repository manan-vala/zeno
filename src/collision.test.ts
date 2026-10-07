import { describe, expect, it } from 'vitest';
import { inset, overlaps } from './collision';

describe('collision', () => {
  it('detects overlapping boxes', () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  it('treats touching edges as a miss', () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it('shrinks boxes evenly and never below zero', () => {
    expect(inset({ x: 0, y: 0, w: 10, h: 10 }, 2)).toEqual({ x: 2, y: 2, w: 6, h: 6 });
    expect(inset({ x: 0, y: 0, w: 2, h: 2 }, 5).w).toBe(0);
  });
});
