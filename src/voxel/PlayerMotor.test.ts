import { describe, expect, it } from 'vitest';
import { VoxelBlock } from './blocks';
import { movePlayer } from './PlayerMotor';
import { VoxelWorld } from './VoxelWorld';

function flatWorld() {
  const world = new VoxelWorld({
    min: { x: -6, y: 0, z: -6 },
    width: 12,
    height: 6,
    depth: 12,
    regionSize: { x: 6, y: 6, z: 6 },
  });
  for (let x = -6; x < 6; x += 1) {
    for (let z = -6; z < 6; z += 1) world.set({ x, y: 0, z }, VoxelBlock.Grass);
  }
  return world;
}

describe('voxel player motor', () => {
  it('climbs a half-block training step and settles on its surface', () => {
    const world = flatWorld();
    world.set({ x: 0, y: 1, z: 0 }, VoxelBlock.Step);
    const result = movePlayer(
      world,
      { x: 0, y: 0.5, z: 1.2 },
      { x: 0, z: -0.8 },
      { stepHeight: 0.55 },
    );
    expect(result.position.z).toBeLessThan(0.8);
    expect(result.position.y).toBeCloseTo(1);
    expect(result.stepped).toBe(true);
  });

  it('does not auto-step onto an ordinary full-height block', () => {
    const world = flatWorld();
    world.set({ x: 0, y: 1, z: 0 }, VoxelBlock.Stone);
    const result = movePlayer(
      world,
      { x: 0, y: 0.5, z: 1.2 },
      { x: 0, z: -0.8 },
      { stepHeight: 0.55 },
    );
    expect(result.position.z).toBeGreaterThan(0.7);
    expect(result.position.y).toBeCloseTo(0.5);
    expect(result.stepped).toBe(false);
    expect(result.blockedZ).toBe(true);
  });

  it('stops at a two-block barrier and slides along one axis', () => {
    const world = flatWorld();
    for (const y of [1, 2]) world.set({ x: 0, y, z: 0 }, VoxelBlock.Stone);
    const blocked = movePlayer(world, { x: 0, y: 0.5, z: 1.2 }, { x: 0, z: -1.4 });
    expect(blocked.position.z).toBeGreaterThan(0.7);
    expect(blocked.blockedZ).toBe(true);

    const sliding = movePlayer(world, { x: 0.7, y: 0.5, z: 1.2 }, { x: 0.6, z: -1 });
    expect(sliding.position.x).toBeGreaterThan(0.7);
  });

  it('cannot tunnel through a barrier on a large bounded movement', () => {
    const world = flatWorld();
    for (let x = -2; x <= 2; x += 1) {
      world.set({ x, y: 1, z: 0 }, VoxelBlock.Stone);
      world.set({ x, y: 2, z: 0 }, VoxelBlock.Stone);
    }
    const result = movePlayer(world, { x: 0, y: 0.5, z: 3 }, { x: 0, z: -6 }, { maxSubstep: 0.1 });
    expect(result.position.z).toBeGreaterThan(0.7);
  });

  it.each([
    [{ maxSubstep: 0 }, { x: 0, z: 1 }],
    [{ maxSubstep: Number.POSITIVE_INFINITY }, { x: 0, z: 1 }],
    [{ radius: -1 }, { x: 0, z: 1 }],
    [{ stepHeight: Number.NaN }, { x: 0, z: 1 }],
    [{ maxSubstep: 0.01 }, { x: 0, z: 1000 }],
  ])('rejects unsafe options or unbounded sweeps', (options, delta) => {
    expect(() => movePlayer(flatWorld(), { x: 0, y: 0.5, z: 3 }, delta, options)).toThrow(
      RangeError,
    );
  });
});
