import { describe, expect, it } from 'vitest';
import { inventoryCount } from '../voxel/HotbarInventory';
import { PickupPool } from '../voxel/PickupPool';
import {
  advanceProofMining,
  cancelProofMining,
  collectProofDrop,
  FOUNDATION_BLOCK_COUNT,
  initialProofState,
  placeProofBlock,
  proofPhase,
  selectProofSlot,
} from './proofState';

describe('voxel foundation proof state', () => {
  it('requires visible progress before each of three physical drops', () => {
    const partial = advanceProofMining(initialProofState, 'supply', 0.45);
    expect(partial.event).toBe('none');
    expect(partial.state.miningProgress).toBeCloseTo(0.45);
    const canceled = cancelProofMining(partial.state);
    expect(canceled.miningProgress).toBe(0);

    let state = canceled;
    for (let index = 0; index < FOUNDATION_BLOCK_COUNT; index += 1) {
      const broken = advanceProofMining(state, 'supply', 1);
      expect(broken.event).toBe('supply-broken');
      state = broken.state;
    }
    expect(state.suppliesMined).toBe(3);
    expect(advanceProofMining(state, 'supply', 1).event).toBe('none');
  });

  it('uses the nine-slot inventory as the only builder-block count', () => {
    let state = { ...initialProofState, suppliesMined: 3 };
    for (let index = 0; index < 3; index += 1) state = collectProofDrop(state).state;
    expect(inventoryCount(state.inventory, 'builder-block')).toBe(3);
    expect(proofPhase(state)).toBe('select-block');

    state = selectProofSlot(state, 1);
    const invalid = placeProofBlock(state, false);
    expect(invalid.event).toBe('none');
    expect(inventoryCount(invalid.state.inventory, 'builder-block')).toBe(3);

    const placed = placeProofBlock(invalid.state, true);
    expect(placed.event).toBe('block-placed');
    expect(inventoryCount(placed.state.inventory, 'builder-block')).toBe(2);
  });

  it('restores completion after remove, recollect, and target-face repair', () => {
    let state = { ...initialProofState, suppliesMined: 3 };
    for (let index = 0; index < 3; index += 1) state = collectProofDrop(state).state;
    state = selectProofSlot(state, 1);
    for (let index = 0; index < 3; index += 1) state = placeProofBlock(state, true).state;
    expect(state.blocksPlaced).toBe(3);
    expect(proofPhase(state)).toBe('select-tool');

    state = selectProofSlot(state, 0);
    const removed = advanceProofMining(state, 'placed-block', 1);
    expect(removed.event).toBe('block-removed');
    expect(removed.state.blocksPlaced).toBe(2);
    expect(proofPhase(removed.state)).toBe('collect-repair');

    const recollected = collectProofDrop(removed.state).state;
    const repaired = placeProofBlock(selectProofSlot(recollected, 1), true);
    expect(repaired.event).toBe('block-repaired');
    expect(proofPhase(repaired.state)).toBe('complete');
  });

  it('leaves a drop recoverable when the visible builder slot is full', () => {
    let state = { ...initialProofState, suppliesMined: 3 };
    state = {
      ...state,
      inventory: {
        ...state.inventory,
        slots: state.inventory.slots.map((slot, index) =>
          index === 1 ? { item: 'builder-block', count: 99 } : { ...slot },
        ),
      },
    };
    const result = collectProofDrop(state);
    expect(result.accepted).toBe(false);
    expect(inventoryCount(result.state.inventory, 'builder-block')).toBe(99);
    expect(result.state.feedback).toContain('remains recoverable');
  });

  it('does not deactivate a pooled drop until the hotbar accepts it', () => {
    const pool = new PickupPool(1);
    pool.spawn('builder-block', 1, { x: 0, y: 1, z: 0 });
    const state = {
      ...initialProofState,
      inventory: {
        ...initialProofState.inventory,
        slots: initialProofState.inventory.slots.map((slot, index) =>
          index === 1 ? { item: 'builder-block' as const, count: 99 } : { ...slot },
        ),
      },
    };

    const [nearby] = pool.nearbyIndices({ x: 0, y: 1, z: 0 }, 0.5);
    const transition = collectProofDrop(state, pool.entries[nearby].count);
    if (transition.accepted) pool.take(nearby);

    expect(transition.accepted).toBe(false);
    expect(pool.stats().active).toBe(1);
    expect(pool.entries[nearby].count).toBe(1);
    expect(inventoryCount(transition.state.inventory, 'builder-block')).toBe(99);
  });
});
