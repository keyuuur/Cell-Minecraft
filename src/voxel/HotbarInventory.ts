export type VoxelItemId =
  'builder-pick' | 'builder-block' | 'cell-wall-module' | 'cell-membrane-module';

export interface HotbarSlot {
  item: VoxelItemId | null;
  count: number;
}

export interface HotbarSnapshot {
  selectedSlot: number;
  slots: HotbarSlot[];
}

export const HOTBAR_SLOT_COUNT = 9;
export const HOTBAR_STACK_LIMIT = 99;

export function createHotbar(): HotbarSnapshot {
  return {
    selectedSlot: 0,
    slots: Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) =>
      index === 0
        ? { item: 'builder-pick' as const, count: 1 }
        : index === 1
          ? { item: 'builder-block' as const, count: 0 }
          : { item: null, count: 0 },
    ),
  };
}

export function cloneHotbar(inventory: HotbarSnapshot): HotbarSnapshot {
  return {
    selectedSlot: inventory.selectedSlot,
    slots: inventory.slots.map((slot) => ({ ...slot })),
  };
}

export function selectHotbarSlot(inventory: HotbarSnapshot, selectedSlot: number): HotbarSnapshot {
  if (!Number.isInteger(selectedSlot) || selectedSlot < 0 || selectedSlot > 1) {
    return inventory;
  }
  return { ...cloneHotbar(inventory), selectedSlot };
}

export function inventoryCount(inventory: HotbarSnapshot, item: VoxelItemId): number {
  return inventory.slots.reduce((total, slot) => total + (slot.item === item ? slot.count : 0), 0);
}

export function addInventoryItem(
  inventory: HotbarSnapshot,
  item: VoxelItemId,
  amount = 1,
): { inventory: HotbarSnapshot; remainder: number } {
  if (!Number.isInteger(amount) || amount <= 0) return { inventory, remainder: amount };
  const next = cloneHotbar(inventory);
  const slotIndex = item === 'builder-pick' ? 0 : 1;
  const slot = next.slots[slotIndex];
  if (slot.item !== item) return { inventory, remainder: amount };
  const accepted = Math.min(HOTBAR_STACK_LIMIT - slot.count, amount);
  slot.count += accepted;
  return { inventory: next, remainder: amount - accepted };
}

export function removeInventoryItem(
  inventory: HotbarSnapshot,
  item: VoxelItemId,
  amount = 1,
): HotbarSnapshot | null {
  if (!Number.isInteger(amount) || amount <= 0 || inventoryCount(inventory, item) < amount) {
    return null;
  }
  const next = cloneHotbar(inventory);
  const slotIndex = item === 'builder-pick' ? 0 : 1;
  const slot = next.slots[slotIndex];
  const removed = Math.min(slot.count, amount);
  slot.count -= removed;
  return next;
}

export function validateHotbar(value: unknown): value is HotbarSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HotbarSnapshot>;
  if (
    !Number.isInteger(candidate.selectedSlot) ||
    (candidate.selectedSlot ?? -1) < 0 ||
    (candidate.selectedSlot ?? 2) > 1 ||
    !Array.isArray(candidate.slots) ||
    candidate.slots.length !== HOTBAR_SLOT_COUNT
  ) {
    return false;
  }
  const slots = candidate.slots;
  const validCount = (slot: HotbarSlot) =>
    Number.isInteger(slot.count) && slot.count >= 0 && slot.count <= HOTBAR_STACK_LIMIT;
  if (
    slots[0].item !== 'builder-pick' ||
    slots[0].count !== 1 ||
    slots[1].item !== 'builder-block' ||
    !validCount(slots[1])
  ) {
    return false;
  }
  return slots.slice(2).every((slot) => slot.item === null && slot.count === 0);
}
