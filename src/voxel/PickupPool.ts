import type { VoxelItemId } from './HotbarInventory';
import type { VoxelPoint } from './types';

export interface VoxelPickup {
  active: boolean;
  item: VoxelItemId;
  count: number;
  position: VoxelPoint;
  spawnSequence: number;
  bobPhase: number;
}

export interface PickupPoolStats {
  active: number;
  available: number;
  reused: number;
  capacity: number;
}

export const PICKUP_POOL_CAPACITY = 8;

export class PickupPool {
  readonly entries: VoxelPickup[];
  private sequence = 0;
  private reuseCount = 0;

  constructor(readonly capacity = PICKUP_POOL_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('Pickup pool capacity must be a positive integer.');
    }
    this.entries = Array.from({ length: capacity }, (_, index) => ({
      active: false,
      item: 'builder-block',
      count: 0,
      position: { x: 0, y: 0, z: 0 },
      spawnSequence: 0,
      bobPhase: index * 0.71,
    }));
  }

  spawn(item: VoxelItemId, count: number, position: VoxelPoint): number | null {
    if (!Number.isInteger(count) || count <= 0) return null;
    const index = this.entries.findIndex((entry) => !entry.active);
    if (index < 0) return null;
    const entry = this.entries[index];
    if (entry.spawnSequence > 0) this.reuseCount += 1;
    this.sequence += 1;
    entry.active = true;
    entry.item = item;
    entry.count = count;
    entry.position = { ...position };
    entry.spawnSequence = this.sequence;
    return index;
  }

  nearbyIndices(position: VoxelPoint, radius: number): number[] {
    if (!Number.isFinite(radius) || radius < 0) {
      throw new RangeError('Pickup radius must be finite and non-negative.');
    }
    const nearby: number[] = [];
    const radiusSquared = radius * radius;
    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      if (!entry.active) continue;
      const dx = entry.position.x - position.x;
      const dy = entry.position.y - position.y;
      const dz = entry.position.z - position.z;
      if (dx * dx + dy * dy + dz * dz > radiusSquared) continue;
      nearby.push(index);
    }
    return nearby;
  }

  take(index: number): VoxelPickup | null {
    const entry = this.entries[index];
    if (!entry?.active) return null;
    const pickup = { ...entry, position: { ...entry.position } };
    entry.active = false;
    entry.count = 0;
    return pickup;
  }

  stats(): PickupPoolStats {
    const active = this.entries.filter((entry) => entry.active).length;
    return {
      active,
      available: this.capacity - active,
      reused: this.reuseCount,
      capacity: this.capacity,
    };
  }

  snapshot(): VoxelPickup[] {
    return this.entries
      .filter((entry) => entry.active)
      .map((entry) => ({ ...entry, position: { ...entry.position } }));
  }
}
