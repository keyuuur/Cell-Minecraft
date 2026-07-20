import { describe, expect, it } from 'vitest';
import { VoxelBlock } from './blocks';
import { buildVoxelRegionGeometry } from './regionGeometry';
import { VoxelWorld } from './VoxelWorld';

function createWorld() {
  return new VoxelWorld({
    min: { x: 0, y: 0, z: 0 },
    width: 8,
    height: 8,
    depth: 8,
    regionSize: { x: 8, y: 8, z: 8 },
  });
}

describe('regional exposed-face geometry', () => {
  it('culls the shared face between adjacent full voxels', () => {
    const world = createWorld();
    world.set({ x: 2, y: 2, z: 2 }, VoxelBlock.Stone);
    expect(buildVoxelRegionGeometry(world, { x: 0, y: 0, z: 0 }).faceCount).toBe(6);
    world.set({ x: 3, y: 2, z: 2 }, VoxelBlock.Stone);
    const geometry = buildVoxelRegionGeometry(world, { x: 0, y: 0, z: 0 });
    expect(geometry.faceCount).toBe(10);
    expect(geometry.positions).toHaveLength(10 * 4 * 3);
  });

  it('clears without stale geometry', () => {
    const world = createWorld();
    world.set({ x: 2, y: 2, z: 2 }, VoxelBlock.Stone);
    world.set({ x: 2, y: 2, z: 2 }, VoxelBlock.Air);
    expect(buildVoxelRegionGeometry(world, { x: 0, y: 0, z: 0 }).faceCount).toBe(0);
  });

  it('renders only the exposed upper side beside a half-height step', () => {
    const world = createWorld();
    world.set({ x: 2, y: 2, z: 2 }, VoxelBlock.Stone);
    world.set({ x: 3, y: 2, z: 2 }, VoxelBlock.Step);
    const geometry = buildVoxelRegionGeometry(world, { x: 0, y: 0, z: 0 });
    const positiveXFaceY: number[] = [];
    for (let index = 0; index < geometry.positions.length; index += 3) {
      const x = geometry.positions[index];
      const y = geometry.positions[index + 1];
      const normalX = geometry.normals[index];
      if (x === 2.5 && normalX === 1) positiveXFaceY.push(y);
    }
    expect(positiveXFaceY).toHaveLength(4);
    expect(Math.min(...positiveXFaceY)).toBe(2);
    expect(Math.max(...positiveXFaceY)).toBe(2.5);
  });

  it('culls a shared face across a render-region boundary', () => {
    const world = new VoxelWorld({
      min: { x: -8, y: 0, z: 0 },
      width: 16,
      height: 8,
      depth: 8,
      regionSize: { x: 8, y: 8, z: 8 },
    });
    world.set({ x: -1, y: 2, z: 2 }, VoxelBlock.Stone);
    world.set({ x: 0, y: 2, z: 2 }, VoxelBlock.Stone);
    expect(buildVoxelRegionGeometry(world, { x: 0, y: 0, z: 0 }).faceCount).toBe(5);
    expect(buildVoxelRegionGeometry(world, { x: 1, y: 0, z: 0 }).faceCount).toBe(5);
  });

  it('culls a shared face across a z render-region boundary', () => {
    const world = new VoxelWorld({
      min: { x: 0, y: 0, z: -8 },
      width: 8,
      height: 8,
      depth: 16,
      regionSize: { x: 8, y: 8, z: 8 },
    });
    world.set({ x: 2, y: 2, z: -1 }, VoxelBlock.Stone);
    world.set({ x: 2, y: 2, z: 0 }, VoxelBlock.Stone);
    expect(buildVoxelRegionGeometry(world, { x: 0, y: 0, z: 0 }).faceCount).toBe(5);
    expect(buildVoxelRegionGeometry(world, { x: 0, y: 0, z: 1 }).faceCount).toBe(5);
  });
});
