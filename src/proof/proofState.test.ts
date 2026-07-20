import { describe, expect, it } from 'vitest';
import {
  advanceProofMining,
  cancelProofMining,
  collectProofDrop,
  initialProofState,
  placeProofWall,
  proofPhase,
  selectProofSlot,
} from './proofState';

describe('voxel proof state', () => {
  it('requires progress on the crosshair target before one drop appears', () => {
    const partial = advanceProofMining(initialProofState, 'supply', 0.45);
    expect(partial.event).toBe('none');
    expect(partial.state.miningProgress).toBeCloseTo(0.45);

    const canceled = cancelProofMining(partial.state);
    expect(canceled.miningProgress).toBe(0);

    const broken = advanceProofMining(canceled, 'supply', 1);
    expect(broken.event).toBe('supply-broken');
    expect(broken.state.supplyAvailable).toBe(false);
    expect(broken.state.dropAvailable).toBe(true);

    const duplicate = advanceProofMining(broken.state, 'supply', 1);
    expect(duplicate.event).toBe('none');
    expect(duplicate.state.dropAvailable).toBe(true);
  });

  it('does not collect, place, or duplicate without the required visible state', () => {
    expect(collectProofDrop(initialProofState)).toEqual(initialProofState);

    const broken = advanceProofMining(initialProofState, 'supply', 1).state;
    const collected = collectProofDrop(broken);
    expect(collected.inventoryCount).toBe(1);
    expect(collectProofDrop(collected).inventoryCount).toBe(1);

    const selected = selectProofSlot(collected, 1);
    const invalid = placeProofWall(selected, null);
    expect(invalid.event).toBe('none');
    expect(invalid.state.inventoryCount).toBe(1);

    const placed = placeProofWall(invalid.state, 'anchor');
    expect(placed.event).toBe('wall-placed');
    expect(placed.state.inventoryCount).toBe(0);
    expect(proofPhase(placed.state)).toBe('select-tool');

    const duplicate = placeProofWall(placed.state, 'anchor');
    expect(duplicate.event).toBe('none');
    expect(duplicate.state.placementCount).toBe(1);
  });

  it('restores completion after remove, recollect, and replace', () => {
    const broken = advanceProofMining(initialProofState, 'supply', 1).state;
    const collected = collectProofDrop(broken);
    const placed = placeProofWall(selectProofSlot(collected, 1), 'anchor').state;
    const toolSelected = selectProofSlot(placed, 0);
    const removed = advanceProofMining(toolSelected, 'placed-wall', 1);
    expect(removed.event).toBe('wall-removed');
    expect(removed.state.wallPlaced).toBe(false);

    const recollected = collectProofDrop(removed.state);
    const repaired = placeProofWall(selectProofSlot(recollected, 1), 'anchor');
    expect(repaired.event).toBe('wall-repaired');
    expect(repaired.state.wallPlaced).toBe(true);
    expect(repaired.state.placementCount).toBe(2);
    expect(proofPhase(repaired.state)).toBe('complete');
  });
});
