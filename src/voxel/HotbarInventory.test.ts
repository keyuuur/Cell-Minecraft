import { describe, expect, it } from 'vitest';
import {
  addInventoryItem,
  createHotbar,
  HOTBAR_SLOT_COUNT,
  inventoryCount,
  removeInventoryItem,
  selectHotbarSlot,
  validateHotbar,
} from './HotbarInventory';

describe('nine-slot hotbar inventory', () => {
  it('adds, selects, and consumes a bounded builder-block stack', () => {
    const added = addInventoryItem(createHotbar(), 'builder-block', 3);
    expect(added.remainder).toBe(0);
    expect(added.inventory.slots).toHaveLength(HOTBAR_SLOT_COUNT);
    expect(inventoryCount(added.inventory, 'builder-block')).toBe(3);
    const selected = selectHotbarSlot(added.inventory, 1);
    expect(selected.selectedSlot).toBe(1);
    const consumed = removeInventoryItem(selected, 'builder-block', 2);
    expect(consumed && inventoryCount(consumed, 'builder-block')).toBe(1);
  });

  it('never underflows, overflows, or accepts malformed serialization', () => {
    const inventory = createHotbar();
    expect(removeInventoryItem(inventory, 'builder-block', 1)).toBeNull();
    const added = addInventoryItem(inventory, 'builder-block', 1000);
    expect(inventoryCount(added.inventory, 'builder-block')).toBe(99);
    expect(added.remainder).toBe(901);
    expect(validateHotbar(added.inventory)).toBe(true);
    expect(validateHotbar({ selectedSlot: 0, slots: [] })).toBe(false);
    expect(selectHotbarSlot(inventory, 2)).toBe(inventory);
    const hiddenOverflow = createHotbar();
    hiddenOverflow.slots[2] = { item: 'builder-block', count: 1 };
    expect(validateHotbar(hiddenOverflow)).toBe(false);
    expect(validateHotbar({ ...createHotbar(), selectedSlot: 2 })).toBe(false);
  });
});
