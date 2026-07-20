import { describe, expect, it } from 'vitest';
import { PickupPool } from './PickupPool';

describe('fixed pickup pool', () => {
  it('collects each active pickup exactly once and reuses entries', () => {
    const pool = new PickupPool(2);
    expect(pool.spawn('builder-block', 1, { x: 0, y: 1, z: 0 })).toBe(0);
    expect(pool.nearbyIndices({ x: 0, y: 1, z: 0 }, 0.5)).toEqual([0]);
    expect(pool.take(0)).toMatchObject({ item: 'builder-block', count: 1 });
    expect(pool.nearbyIndices({ x: 0, y: 1, z: 0 }, 0.5)).toHaveLength(0);
    expect(pool.spawn('builder-block', 1, { x: 0, y: 1, z: 0 })).toBe(0);
    expect(pool.stats().reused).toBe(1);
  });

  it('fails safely when saturated', () => {
    const pool = new PickupPool(1);
    pool.spawn('builder-block', 1, { x: 0, y: 1, z: 0 });
    expect(pool.spawn('builder-block', 1, { x: 1, y: 1, z: 0 })).toBeNull();
    expect(pool.stats()).toMatchObject({ active: 1, available: 0, capacity: 1 });
    expect(() => pool.nearbyIndices({ x: 0, y: 1, z: 0 }, Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});
