import { describe, expect, it } from 'vitest';
import { VoxelWorld } from '../VoxelWorld';
import { VoxelWorldRenderer } from './VoxelWorldRenderer';

describe('VoxelWorldRenderer clean-frame result', () => {
  it('returns one stable empty result across consecutive clean flushes', () => {
    const world = new VoxelWorld({
      min: { x: 0, y: 0, z: 0 },
      width: 4,
      height: 4,
      depth: 4,
      regionSize: { x: 4, y: 4, z: 4 },
    });
    world.consumeDirtyRegions(Number.POSITIVE_INFINITY);
    const emptyRebuiltRegions: string[] = [];
    const renderer = Object.assign(Object.create(VoxelWorldRenderer.prototype), {
      world,
      emptyRebuiltRegions,
      lastRebuilt: [],
    }) as VoxelWorldRenderer;

    const first = renderer.flushDirtyRegions();
    const second = renderer.flushDirtyRegions();

    expect(first).toBe(emptyRebuiltRegions);
    expect(second).toBe(first);
    expect(second).toEqual([]);
  });
});
