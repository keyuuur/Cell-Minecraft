import { describe, expect, it } from 'vitest';
import { VoxelBlock } from './blocks';
import { VoxelWorld } from './VoxelWorld';

function createWorld() {
  return new VoxelWorld({
    min: { x: -12, y: 0, z: -12 },
    width: 24,
    height: 12,
    depth: 24,
    regionSize: { x: 8, y: 12, z: 8 },
  });
}

describe('VoxelWorld', () => {
  it('keeps a fixed typed volume with nine render regions', () => {
    const world = createWorld();
    expect(world.cells).toBeInstanceOf(Uint8Array);
    expect(world.cells).toHaveLength(24 * 12 * 24);
    expect(world.regionCounts).toEqual({ x: 3, y: 1, z: 3 });
    expect(world.consumeDirtyRegions()).toHaveLength(9);
  });

  it('marks only the owning region and a face neighbor at a region edge', () => {
    const world = createWorld();
    world.consumeDirtyRegions();
    world.set({ x: -4, y: 1, z: 0 }, VoxelBlock.Builder);
    expect(world.peekDirtyRegionKeys().sort()).toEqual(['0:0:1', '1:0:1']);
  });

  it('marks both face neighbors at an x/z region intersection without a diagonal region', () => {
    const world = createWorld();
    world.consumeDirtyRegions();
    world.set({ x: -4, y: 1, z: -4 }, VoxelBlock.Builder);
    expect(world.peekDirtyRegionKeys().sort()).toEqual(['0:0:1', '1:0:0', '1:0:1']);
  });

  it('rejects out-of-bounds coordinates and unknown blocks', () => {
    const world = createWorld();
    expect(() => world.get({ x: 12, y: 0, z: 0 })).toThrow(RangeError);
    expect(() => world.set({ x: 0, y: 0, z: 0 }, 255 as VoxelBlock)).toThrow(RangeError);
  });
});
