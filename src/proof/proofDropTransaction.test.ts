import { describe, expect, it } from 'vitest';
import { VoxelBlock } from '../voxel/blocks';
import { inventoryCount } from '../voxel/HotbarInventory';
import { PickupPool } from '../voxel/PickupPool';
import { voxelKey } from '../voxel/types';
import { VoxelWorld } from '../voxel/VoxelWorld';
import { advanceProofMining, initialProofState, type ProofState } from './proofState';
import { commitMinedProofBlock } from './proofDropTransaction';

const minedCell = { x: 0, y: 1, z: 0 };

function createWorld(): VoxelWorld {
  const world = new VoxelWorld({
    min: { x: -4, y: 0, z: -4 },
    width: 8,
    height: 6,
    depth: 8,
    regionSize: { x: 4, y: 6, z: 4 },
  });
  world.set(minedCell, VoxelBlock.Builder);
  return world;
}

function fullBuilderHotbar(state: ProofState): ProofState {
  return {
    ...state,
    inventory: {
      ...state.inventory,
      slots: state.inventory.slots.map((slot, index) =>
        index === 1 ? { item: 'builder-block' as const, count: 99 } : { ...slot },
      ),
    },
  };
}

function saturatedPool(): PickupPool {
  const pool = new PickupPool(1);
  pool.spawn('builder-block', 1, { x: 2, y: 1, z: 2 });
  return pool;
}

describe('mined proof-block transaction', () => {
  it('restores a supply voxel and counters when no drop destination can accept it', () => {
    const world = createWorld();
    const pickupPool = saturatedPool();
    const before = fullBuilderHotbar(initialProofState);
    const mined = advanceProofMining(before, 'supply', 1);
    const poolBefore = pickupPool.snapshot();

    const result = commitMinedProofBlock({
      world,
      pickupPool,
      installedCells: new Set(),
      minedCell,
      event: 'supply-broken',
      previousState: before,
      minedState: mined.state,
    });

    expect(result.route).toBe('rejected');
    expect(world.get(minedCell)).toBe(VoxelBlock.Builder);
    expect(result.state.suppliesMined).toBe(before.suppliesMined);
    expect(result.state.repairStarted).toBe(false);
    expect(inventoryCount(result.state.inventory, 'builder-block')).toBe(99);
    expect(pickupPool.snapshot()).toEqual(poolBefore);
  });

  it('restores an installed voxel, membership, and repair state on rejection', () => {
    const world = createWorld();
    const pickupPool = saturatedPool();
    const before = fullBuilderHotbar({
      ...initialProofState,
      suppliesMined: 3,
      pickupsCollected: 3,
      blocksPlaced: 3,
    });
    const mined = advanceProofMining(before, 'placed-block', 1);
    const installedCells = new Set([voxelKey(minedCell)]);
    const poolBefore = pickupPool.snapshot();

    const result = commitMinedProofBlock({
      world,
      pickupPool,
      installedCells,
      minedCell,
      event: 'block-removed',
      previousState: before,
      minedState: mined.state,
    });

    expect(result.route).toBe('rejected');
    expect(world.get(minedCell)).toBe(VoxelBlock.Builder);
    expect(result.state.blocksPlaced).toBe(3);
    expect(result.state.repairStarted).toBe(false);
    expect(inventoryCount(result.state.inventory, 'builder-block')).toBe(99);
    expect(pickupPool.snapshot()).toEqual(poolBefore);
    expect(installedCells.has(voxelKey(minedCell))).toBe(true);
  });
});
