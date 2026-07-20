import { describe, expect, it } from 'vitest';
import { VoxelBlock } from './blocks';
import { playerBodyAt } from './PlayerMotor';
import { validateTargetFacePlacement } from './placement';
import { raycastVoxel } from './raycastVoxel';
import { voxelKey } from './types';
import { VoxelWorld } from './VoxelWorld';

function setup() {
  const world = new VoxelWorld({
    min: { x: -4, y: 0, z: -4 },
    width: 8,
    height: 8,
    depth: 8,
    regionSize: { x: 4, y: 8, z: 4 },
  });
  world.set({ x: 0, y: 1, z: 0 }, VoxelBlock.Stone);
  const hit = raycastVoxel(world, { x: 0, y: 1, z: 3 }, { x: 0, y: 0, z: -1 });
  return { world, hit };
}

describe('target-face placement', () => {
  it('places only in the ray-adjacent allowed cell', () => {
    const { world, hit } = setup();
    const allowed = new Set([voxelKey({ x: 0, y: 1, z: 1 })]);
    expect(
      validateTargetFacePlacement(world, hit, playerBodyAt({ x: 0, y: 0.5, z: 3 }), allowed),
    ).toEqual({
      valid: true,
      destination: { x: 0, y: 1, z: 1 },
      failure: null,
    });
  });

  it('rejects wrong faces, occupied cells, and player overlap', () => {
    const { world, hit } = setup();
    expect(
      validateTargetFacePlacement(world, hit, playerBodyAt({ x: 0, y: 0.5, z: 3 }), new Set())
        .failure,
    ).toBe('wrong-face');
    world.set({ x: 0, y: 1, z: 1 }, VoxelBlock.Builder);
    expect(
      validateTargetFacePlacement(world, hit, playerBodyAt({ x: 0, y: 0.5, z: 3 })).failure,
    ).toBe('occupied');
    world.set({ x: 0, y: 1, z: 1 }, VoxelBlock.Air);
    expect(
      validateTargetFacePlacement(world, hit, playerBodyAt({ x: 0, y: 0.5, z: 1 })).failure,
    ).toBe('player-overlap');
  });
});
