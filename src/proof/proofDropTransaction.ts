import { VoxelBlock } from '../voxel/blocks';
import type { PickupPool } from '../voxel/PickupPool';
import type { VoxelPoint } from '../voxel/types';
import { voxelKey } from '../voxel/types';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import { collectProofDrop, type MiningTransition, type ProofState } from './proofState';

type BrokenBlockEvent = Exclude<MiningTransition['event'], 'none'>;

export interface MinedDropTransactionInput {
  world: VoxelWorld;
  pickupPool: PickupPool;
  installedCells: Set<string>;
  minedCell: VoxelPoint;
  event: BrokenBlockEvent;
  previousState: ProofState;
  minedState: ProofState;
}

export interface MinedDropTransactionResult {
  state: ProofState;
  route: 'pooled' | 'inventory' | 'rejected';
}

export function commitMinedProofBlock({
  world,
  pickupPool,
  installedCells,
  minedCell,
  event,
  previousState,
  minedState,
}: MinedDropTransactionInput): MinedDropTransactionResult {
  world.set(minedCell, VoxelBlock.Air);
  installedCells.delete(voxelKey(minedCell));

  const pickupIndex = pickupPool.spawn('builder-block', 1, minedCell);
  if (pickupIndex !== null) return { state: minedState, route: 'pooled' };

  const hotbarFallback = collectProofDrop(minedState);
  if (hotbarFallback.accepted) {
    return {
      state: {
        ...hotbarFallback.state,
        feedback: 'Pickup pool full: the block returned safely to the hotbar.',
      },
      route: 'inventory',
    };
  }

  world.set(minedCell, VoxelBlock.Builder);
  if (event === 'block-removed') installedCells.add(voxelKey(minedCell));
  return {
    state: {
      ...previousState,
      miningProgress: 0,
      miningTarget: null,
      feedback: 'No pickup or hotbar space. The Builder Block stayed safely in the yard.',
    },
    route: 'rejected',
  };
}
