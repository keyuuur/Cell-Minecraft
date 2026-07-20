import { isVoxelBlock, VOXEL_PALETTE_VERSION, VoxelBlock } from './blocks';
import { cloneHotbar, validateHotbar, type HotbarSnapshot } from './HotbarInventory';
import { PICKUP_POOL_CAPACITY, type VoxelPickup } from './PickupPool';
import type { VoxelPoint } from './types';
import type { VoxelWorld } from './VoxelWorld';

export const VOXEL_RUNTIME_SNAPSHOT_VERSION = 1;
export const VOXEL_TEMPLATE_ID = 'builder-yard-v1';

export interface VoxelEdit {
  position: VoxelPoint;
  block: VoxelBlock;
}

export interface VoxelRuntimeSnapshotV1 {
  version: 1;
  templateId: typeof VOXEL_TEMPLATE_ID;
  paletteVersion: number;
  worldEdits: VoxelEdit[];
  player: VoxelPoint & { yaw: number; pitch: number };
  inventory: HotbarSnapshot;
  activePickups: Array<Pick<VoxelPickup, 'item' | 'count' | 'position' | 'spawnSequence'>>;
}

const MAX_WORLD_EDITS = 2048;
const PLAYER_RADIUS = 0.32;
const PLAYER_HEIGHT = 1.7;

function finitePoint(value: unknown): value is VoxelPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<VoxelPoint>;
  return [point.x, point.y, point.z].every((coordinate) => Number.isFinite(coordinate));
}

function pointInsideWorld(point: VoxelPoint, world: VoxelWorld): boolean {
  const { min, width, height, depth } = world.bounds;
  return (
    point.x >= min.x - 0.5 &&
    point.x <= min.x + width - 0.5 &&
    point.y >= min.y - 0.5 &&
    point.y <= min.y + height - 0.5 &&
    point.z >= min.z - 0.5 &&
    point.z <= min.z + depth - 0.5
  );
}

function playerInsideWorld(player: VoxelPoint, world: VoxelWorld): boolean {
  const { min, width, height, depth } = world.bounds;
  return (
    player.x - PLAYER_RADIUS >= min.x - 0.5 &&
    player.x + PLAYER_RADIUS <= min.x + width - 0.5 &&
    player.y >= min.y - 0.5 &&
    player.y + PLAYER_HEIGHT <= min.y + height - 0.5 &&
    player.z - PLAYER_RADIUS >= min.z - 0.5 &&
    player.z + PLAYER_RADIUS <= min.z + depth - 0.5
  );
}

export function createVoxelRuntimeSnapshot(
  world: VoxelWorld,
  worldEdits: VoxelEdit[],
  player: VoxelRuntimeSnapshotV1['player'],
  inventory: HotbarSnapshot,
  activePickups: VoxelRuntimeSnapshotV1['activePickups'],
): VoxelRuntimeSnapshotV1 {
  const snapshot: VoxelRuntimeSnapshotV1 = {
    version: VOXEL_RUNTIME_SNAPSHOT_VERSION,
    templateId: VOXEL_TEMPLATE_ID,
    paletteVersion: VOXEL_PALETTE_VERSION,
    worldEdits: worldEdits.map((edit) => ({
      position: { ...edit.position },
      block: edit.block,
    })),
    player: { ...player },
    inventory: cloneHotbar(inventory),
    activePickups: activePickups.map((pickup) => ({
      ...pickup,
      position: { ...pickup.position },
    })),
  };
  if (!validateVoxelRuntimeSnapshot(snapshot, world)) {
    throw new Error('Cannot create an invalid voxel runtime snapshot.');
  }
  return snapshot;
}

export function validateVoxelRuntimeSnapshot(
  value: unknown,
  world: VoxelWorld,
): value is VoxelRuntimeSnapshotV1 {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<VoxelRuntimeSnapshotV1>;
  if (
    snapshot.version !== VOXEL_RUNTIME_SNAPSHOT_VERSION ||
    snapshot.templateId !== VOXEL_TEMPLATE_ID ||
    snapshot.paletteVersion !== VOXEL_PALETTE_VERSION ||
    !Array.isArray(snapshot.worldEdits) ||
    snapshot.worldEdits.length > MAX_WORLD_EDITS ||
    !finitePoint(snapshot.player) ||
    !Number.isFinite(snapshot.player.yaw) ||
    !Number.isFinite(snapshot.player.pitch) ||
    !validateHotbar(snapshot.inventory) ||
    !Array.isArray(snapshot.activePickups) ||
    snapshot.activePickups.length > PICKUP_POOL_CAPACITY
  ) {
    return false;
  }
  if (!playerInsideWorld(snapshot.player, world)) return false;
  const editKeys = new Set<string>();
  for (const edit of snapshot.worldEdits) {
    if (
      !edit ||
      !finitePoint(edit.position) ||
      ![edit.position.x, edit.position.y, edit.position.z].every(Number.isInteger) ||
      !world.contains(edit.position) ||
      !isVoxelBlock(edit.block)
    ) {
      return false;
    }
    const key = `${edit.position.x},${edit.position.y},${edit.position.z}`;
    if (editKeys.has(key)) return false;
    editKeys.add(key);
  }
  const pickupSequences = new Set<number>();
  for (const pickup of snapshot.activePickups) {
    if (
      !pickup ||
      (pickup.item !== 'builder-pick' && pickup.item !== 'builder-block') ||
      !Number.isInteger(pickup.count) ||
      pickup.count <= 0 ||
      pickup.count > 99 ||
      !finitePoint(pickup.position) ||
      !pointInsideWorld(pickup.position, world) ||
      !Number.isInteger(pickup.spawnSequence) ||
      pickup.spawnSequence <= 0 ||
      pickupSequences.has(pickup.spawnSequence)
    ) {
      return false;
    }
    pickupSequences.add(pickup.spawnSequence);
  }
  return true;
}

export function migrateVoxelRuntimeSnapshot(
  value: unknown,
  world: VoxelWorld,
): VoxelRuntimeSnapshotV1 | null {
  return validateVoxelRuntimeSnapshot(value, world) ? JSON.parse(JSON.stringify(value)) : null;
}
