import { VoxelBlock } from './blocks';
import type { PlayerBody, VoxelPoint } from './types';
import { voxelKey } from './types';
import type { VoxelWorld } from './VoxelWorld';
import type { VoxelRaycastHit } from './raycastVoxel';

export type PlacementFailure =
  'no-target' | 'out-of-bounds' | 'occupied' | 'wrong-face' | 'player-overlap';

export interface PlacementResult {
  valid: boolean;
  destination: VoxelPoint | null;
  failure: PlacementFailure | null;
}

function playerOverlapsCell(player: PlayerBody, cell: VoxelPoint): boolean {
  const cellMin = { x: cell.x - 0.5, y: cell.y - 0.5, z: cell.z - 0.5 };
  const cellMax = { x: cell.x + 0.5, y: cell.y + 0.5, z: cell.z + 0.5 };
  return (
    player.position.x + player.radius > cellMin.x &&
    player.position.x - player.radius < cellMax.x &&
    player.position.y + player.height > cellMin.y &&
    player.position.y < cellMax.y &&
    player.position.z + player.radius > cellMin.z &&
    player.position.z - player.radius < cellMax.z
  );
}

export function validateTargetFacePlacement(
  world: VoxelWorld,
  hit: VoxelRaycastHit | null,
  player: PlayerBody,
  allowedDestinations?: ReadonlySet<string>,
): PlacementResult {
  if (!hit || (hit.normal.x === 0 && hit.normal.y === 0 && hit.normal.z === 0)) {
    return { valid: false, destination: null, failure: 'no-target' };
  }
  const destination = { ...hit.adjacent };
  if (!world.contains(destination)) {
    return { valid: false, destination, failure: 'out-of-bounds' };
  }
  if (world.get(destination) !== VoxelBlock.Air) {
    return { valid: false, destination, failure: 'occupied' };
  }
  if (allowedDestinations && !allowedDestinations.has(voxelKey(destination))) {
    return { valid: false, destination, failure: 'wrong-face' };
  }
  if (playerOverlapsCell(player, destination)) {
    return { valid: false, destination, failure: 'player-overlap' };
  }
  return { valid: true, destination, failure: null };
}
