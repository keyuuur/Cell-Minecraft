import { describe, expect, it } from 'vitest';
import { VoxelBlock } from './blocks';
import { createHotbar } from './HotbarInventory';
import {
  createVoxelRuntimeSnapshot,
  migrateVoxelRuntimeSnapshot,
  validateVoxelRuntimeSnapshot,
} from './runtimeSnapshot';
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

describe('future voxel runtime snapshot contract', () => {
  it('round-trips plain serializable V1 data without persistence coupling', () => {
    const world = createWorld();
    const snapshot = createVoxelRuntimeSnapshot(
      world,
      [{ position: { x: 0, y: 1, z: 0 }, block: VoxelBlock.Builder }],
      { x: 0, y: 0.5, z: 8, yaw: 0, pitch: 0 },
      createHotbar(),
      [
        {
          item: 'builder-block',
          count: 1,
          position: { x: 0, y: 1, z: 4 },
          spawnSequence: 1,
        },
      ],
    );
    expect(validateVoxelRuntimeSnapshot(snapshot, world)).toBe(true);
    const roundTrip = JSON.parse(JSON.stringify(snapshot));
    expect(migrateVoxelRuntimeSnapshot(roundTrip, world)).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).not.toContain('Uint8Array');
  });

  it('rejects out-of-bounds edits and malformed versions', () => {
    const world = createWorld();
    const snapshot = createVoxelRuntimeSnapshot(
      world,
      [],
      { x: 0, y: 0.5, z: 8, yaw: 0, pitch: 0 },
      createHotbar(),
      [],
    );
    expect(validateVoxelRuntimeSnapshot({ ...snapshot, version: 2 }, world)).toBe(false);
    expect(
      validateVoxelRuntimeSnapshot(
        {
          ...snapshot,
          worldEdits: [{ position: { x: 99, y: 1, z: 0 }, block: VoxelBlock.Builder }],
        },
        world,
      ),
    ).toBe(false);
    expect(
      validateVoxelRuntimeSnapshot({ ...snapshot, player: { ...snapshot.player, x: 99 } }, world),
    ).toBe(false);
    expect(
      validateVoxelRuntimeSnapshot(
        {
          ...snapshot,
          activePickups: [
            {
              item: 'builder-block',
              count: 1,
              position: { x: 99, y: 1, z: 0 },
              spawnSequence: 1,
            },
          ],
        },
        world,
      ),
    ).toBe(false);
  });

  it('rejects duplicate edits, duplicate pickup sequences, and pool overflow', () => {
    const world = createWorld();
    const base = createVoxelRuntimeSnapshot(
      world,
      [],
      { x: 0, y: 0.5, z: 8, yaw: 0, pitch: 0 },
      createHotbar(),
      [],
    );
    const edit = { position: { x: 0, y: 1, z: 0 }, block: VoxelBlock.Builder };
    expect(validateVoxelRuntimeSnapshot({ ...base, worldEdits: [edit, edit] }, world)).toBe(false);
    const pickup = {
      item: 'builder-block' as const,
      count: 1,
      position: { x: 0, y: 1, z: 0 },
      spawnSequence: 1,
    };
    expect(validateVoxelRuntimeSnapshot({ ...base, activePickups: [pickup, pickup] }, world)).toBe(
      false,
    );
    expect(
      validateVoxelRuntimeSnapshot(
        {
          ...base,
          activePickups: Array.from({ length: 9 }, (_, index) => ({
            ...pickup,
            spawnSequence: index + 1,
          })),
        },
        world,
      ),
    ).toBe(false);
  });
});
