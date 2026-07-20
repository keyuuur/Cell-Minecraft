import { describe, expect, it } from 'vitest';
import { VoxelBlock } from './blocks';
import { raycastVoxel } from './raycastVoxel';
import { VoxelWorld } from './VoxelWorld';

function worldWithBlock(x = 0, y = 1, z = 0) {
  const world = new VoxelWorld({
    min: { x: -4, y: 0, z: -4 },
    width: 8,
    height: 8,
    depth: 8,
    regionSize: { x: 4, y: 8, z: 4 },
  });
  world.set({ x, y, z }, VoxelBlock.Stone);
  return world;
}

describe('voxel DDA raycast', () => {
  it.each([
    [
      { x: 4, y: 1, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ],
    [
      { x: -4, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
    ],
    [
      { x: 0, y: 5, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
    [
      { x: 0, y: 1, z: 4 },
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: 1 },
    ],
  ])('returns the entered face and adjacent cell', (origin, direction, normal) => {
    const hit = raycastVoxel(worldWithBlock(), origin, direction);
    expect(hit?.cell).toEqual({ x: 0, y: 1, z: 0 });
    expect(hit?.normal).toEqual(normal);
    expect(hit?.adjacent).toEqual({
      x: normal.x,
      y: 1 + normal.y,
      z: normal.z,
    });
  });

  it('handles diagonal ties deterministically and remains bounded', () => {
    const world = worldWithBlock(1, 1, 1);
    const hit = raycastVoxel(world, { x: 3, y: 1, z: 3 }, { x: -1, y: 0, z: -1 });
    expect(hit?.cell).toEqual({ x: 1, y: 1, z: 1 });
    expect(hit?.distance).toBeLessThanOrEqual(5);
  });

  it('returns a zero-distance hit when the origin begins inside a solid', () => {
    const hit = raycastVoxel(worldWithBlock(), { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(hit).toMatchObject({
      cell: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: 0 },
      distance: 0,
    });
  });

  it('respects maximum reach and rejects non-finite input', () => {
    const world = worldWithBlock();
    expect(
      raycastVoxel(world, { x: 0, y: 1, z: 6 }, { x: 0, y: 0, z: -1 }, { maxDistance: 5 }),
    ).toBeNull();
    expect(raycastVoxel(world, { x: Number.NaN, y: 1, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
  });

  it('does not let a half-height step occlude a ray passing above it', () => {
    const world = worldWithBlock(0, 1, 0);
    world.set({ x: 0, y: 1, z: 2 }, VoxelBlock.Step);
    const hit = raycastVoxel(world, { x: 0, y: 1.4, z: 4 }, { x: 0, y: 0, z: -1 });
    expect(hit?.cell).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('covers the remaining negative faces', () => {
    const world = worldWithBlock();
    expect(raycastVoxel(world, { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 })?.normal).toEqual({
      x: 0,
      y: -1,
      z: 0,
    });
    expect(raycastVoxel(world, { x: 0, y: 1, z: -4 }, { x: 0, y: 0, z: 1 })?.normal).toEqual({
      x: 0,
      y: 0,
      z: -1,
    });
  });

  it.each([
    [{ maxDistance: Number.POSITIVE_INFINITY }],
    [{ maxDistance: 6 }],
    [{ maxSteps: Number.POSITIVE_INFINITY }],
    [{ maxSteps: 65 }],
    [{ maxSteps: 0 }],
  ])('rejects unsafe traversal options without entering the loop', (options) => {
    expect(() =>
      raycastVoxel(worldWithBlock(), { x: 0, y: 1, z: 4 }, { x: 0, y: 0, z: -1 }, options),
    ).toThrow(RangeError);
  });
});
