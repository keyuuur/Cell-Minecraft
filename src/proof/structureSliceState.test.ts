import { describe, expect, it } from 'vitest';
import type { PlaceableStructureId, Point3 } from '../types/game';
import {
  collectStructureSliceModule,
  collectStructureRecoveryDrop,
  initialStructureSliceState,
  inspectStructureSliceModule,
  placeSelectedStructureSliceModule,
  removeStructureSliceModule,
  selectStructureSliceSlot,
  structureSliceCheckpoint,
  structureSliceObjective,
  STRUCTURE_SLOTS,
  type StructureSliceState,
} from './structureSliceState';

const positions: Record<PlaceableStructureId, Point3> = {
  nucleus: { x: -6, y: 1, z: 2 },
  ribosomes: { x: 6, y: 1, z: 2 },
  mitochondria: { x: -6, y: 1, z: -3 },
  chloroplasts: { x: 6, y: 1, z: -3 },
  centralVacuole: { x: 0, y: 1, z: 0 },
};

function addStructure(state: StructureSliceState, id: PlaceableStructureId) {
  let next = collectStructureSliceModule(state, id);
  next = selectStructureSliceSlot(next, STRUCTURE_SLOTS[id]);
  next = placeSelectedStructureSliceModule(next, positions[id]);
  return inspectStructureSliceModule(next, id);
}

describe('Phase 4 structure slice state', () => {
  it('conserves inventory and score after invalid placement', () => {
    let state = collectStructureSliceModule(initialStructureSliceState, 'nucleus');
    const before = structureSliceCheckpoint(state).score.total;
    state = placeSelectedStructureSliceModule(state, { x: 12, y: 1, z: 12 });
    expect(state.inventory.nucleus).toBe(1);
    expect(state.adapter.placements.nucleus).toBeUndefined();
    expect(state.invalidPlacement).toContain('broad zone');
    expect(structureSliceCheckpoint(state).score.total).toBe(before);
  });

  it('requires placement and separate inspection for function credit', () => {
    let state = collectStructureSliceModule(initialStructureSliceState, 'nucleus');
    state = placeSelectedStructureSliceModule(state, positions.nucleus);
    expect(state.adapter.functionEvidence.nucleus).toBeUndefined();
    expect(structureSliceObjective(state)).toContain('Inspect');
    state = inspectStructureSliceModule(state, 'nucleus');
    expect(state.adapter.functionEvidence.nucleus).toBe(true);
    expect(state.feedback).toContain('contains DNA');
  });

  it('completes the bounded loop and restores full scope credit after correction', () => {
    let state = initialStructureSliceState;
    for (const id of [
      'ribosomes',
      'nucleus',
      'chloroplasts',
      'mitochondria',
      'centralVacuole',
    ] as const) {
      state = addStructure(state, id);
    }
    expect(structureSliceCheckpoint(state).score.total).toBe(80);
    expect(structureSliceObjective(state)).toContain('remove one prefab');

    const playerPosition = { x: 8, y: 1, z: -3 };
    state = removeStructureSliceModule(state, 'mitochondria', playerPosition);
    expect(structureSliceCheckpoint(state).score.total).toBeLessThan(80);
    expect(state.inventory.mitochondria).toBe(0);
    expect(state.recoveryDrop).not.toBeNull();
    expect(
      Math.hypot(
        state.recoveryDrop!.position.x - playerPosition.x,
        state.recoveryDrop!.position.z - playerPosition.z,
      ),
    ).toBeCloseTo(1.8);
    expect(Math.hypot(state.recoveryDrop!.position.x, state.recoveryDrop!.position.z)).toBeLessThan(
      Math.hypot(playerPosition.x, playerPosition.z),
    );
    state = collectStructureRecoveryDrop(state, 'mitochondria');
    state = placeSelectedStructureSliceModule(state, positions.mitochondria);
    expect(structureSliceCheckpoint(state).score.total).toBe(77.5);
    state = inspectStructureSliceModule(state, 'mitochondria');
    expect(state.correctionCompleted).toBe(true);
    expect(structureSliceCheckpoint(state).score.total).toBe(80);
    expect(structureSliceObjective(state)).toContain('checkpoint complete');
  });
});
