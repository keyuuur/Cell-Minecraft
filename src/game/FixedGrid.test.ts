import { describe, expect, it } from 'vitest';
import { FixedGrid } from './FixedGrid';

describe('fixed typed occupancy grid', () => {
  it('uses the approved 24 × 24 × 12 chamber without a chunk engine', () => {
    const grid = new FixedGrid(24, 12, 24);
    expect(grid.cells).toBeInstanceOf(Uint8Array);
    expect(grid.cells.length).toBe(24 * 24 * 12);
    grid.set(23, 11, 23, 2);
    expect(grid.get(23, 11, 23)).toBe(2);
  });

  it('rejects coordinates outside the bounded chamber', () => {
    const grid = new FixedGrid(24, 12, 24);
    expect(() => grid.set(24, 0, 0, 1)).toThrow(RangeError);
  });
});
