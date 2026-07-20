import { describe, expect, it } from 'vitest';
import type { PlaceableStructureId, Point3 } from '../types/game';
import {
  APPROVED_STRUCTURE_IDS,
  collectStructureModule,
  createStructureMissionVoxelState,
  parseStructureMissionVoxelState,
  placeStructureMissionModule,
  recordStructureMissionFunction,
  removeStructureMissionModule,
  structureMissionCheckpoint,
  structureMissionStage,
  VOXEL_STRUCTURE_ORDER,
  type StructureMissionVoxelStateV2,
} from './structureMissionAdapter';

const positions: Record<PlaceableStructureId, Point3> = {
  nucleus: { x: -6, y: 1, z: 2 },
  ribosomes: { x: 6, y: 1, z: 2 },
  mitochondria: { x: -6, y: 1, z: -3 },
  chloroplasts: { x: 6, y: 1, z: -3 },
  centralVacuole: { x: 0, y: 1, z: 0 },
};

function collectPlaceInspect(
  state: StructureMissionVoxelStateV2,
  id: PlaceableStructureId,
): StructureMissionVoxelStateV2 {
  const collected = collectStructureModule(state, id);
  expect(collected).not.toBeNull();
  const placed = placeStructureMissionModule(collected!, id, positions[id]);
  expect(placed).not.toBeNull();
  const inspected = recordStructureMissionFunction(placed!, id);
  expect(inspected).not.toBeNull();
  return inspected!;
}

function completeAddedStructures(): StructureMissionVoxelStateV2 {
  let state = createStructureMissionVoxelState();
  for (const id of VOXEL_STRUCTURE_ORDER) state = collectPlaceInspect(state, id);
  return state;
}

describe('complete structure mission voxel adapter', () => {
  it('starts from the verified Phase 3 checkpoint without adding advanced organelles', () => {
    const state = createStructureMissionVoxelState();
    const checkpoint = structureMissionCheckpoint(state);
    expect(APPROVED_STRUCTURE_IDS).toEqual([
      'cellWall',
      'cellMembrane',
      'cytoplasm',
      'nucleus',
      'ribosomes',
      'mitochondria',
      'chloroplasts',
      'centralVacuole',
    ]);
    expect(checkpoint.completedStructures).toBe(3);
    expect(checkpoint.score.total).toBe(38.8);
    expect(checkpoint.mission.practice).toBe(true);
    expect(checkpoint.mission.completed).toBe(false);
  });

  it('allows either order within each paired stage but gates later systems', () => {
    let state = createStructureMissionVoxelState();
    expect(collectStructureModule(state, 'mitochondria')).toBeNull();
    state = collectPlaceInspect(state, 'ribosomes');
    expect(structureMissionStage(state)).toBe('control-and-protein');
    state = collectPlaceInspect(state, 'nucleus');
    expect(structureMissionStage(state)).toBe('energy-and-photosynthesis');
    state = collectPlaceInspect(state, 'chloroplasts');
    state = collectPlaceInspect(state, 'mitochondria');
    expect(structureMissionStage(state)).toBe('water-storage');
  });

  it('keeps placement credit separate from function evidence and finishes at 80 points', () => {
    let state = createStructureMissionVoxelState();
    for (const id of VOXEL_STRUCTURE_ORDER) {
      state = collectStructureModule(state, id)!;
      state = placeStructureMissionModule(state, id, positions[id])!;
    }
    expect(structureMissionCheckpoint(state).score.total).toBe(67.5);
    expect(structureMissionCheckpoint(state).score.activationFunctions).toBe(7.5);
    for (const id of VOXEL_STRUCTURE_ORDER) state = recordStructureMissionFunction(state, id)!;
    expect(structureMissionCheckpoint(state)).toMatchObject({
      completedStructures: 8,
      addedStructureCreditComplete: true,
      score: {
        boundary: 15,
        requiredStructures: 30,
        placementContext: 15,
        activationFunctions: 20,
        droughtRecovery: 0,
        finalStability: 0,
        total: 80,
      },
      mission: {
        completed: false,
        practice: true,
        droughtStarted: false,
      },
    });
  });

  it('blocks invalid zones without mutation or score loss', () => {
    let state = createStructureMissionVoxelState();
    state = collectStructureModule(state, 'nucleus')!;
    const before = structureMissionCheckpoint(state).score.total;
    expect(placeStructureMissionModule(state, 'nucleus', { x: 12, y: 1, z: 12 })).toBeNull();
    expect(state.placements.nucleus).toBeUndefined();
    expect(structureMissionCheckpoint(state).score.total).toBe(before);

    state = placeStructureMissionModule(state, 'nucleus', positions.nucleus)!;
    state = collectStructureModule(state, 'ribosomes')!;
    expect(placeStructureMissionModule(state, 'ribosomes', positions.nucleus)).toBeNull();
    expect(state.placements.ribosomes).toBeUndefined();
  });

  it('drops credit on removal and restores all credit only after reinspection', () => {
    let state = completeAddedStructures();
    expect(structureMissionCheckpoint(state).score.total).toBe(80);
    state = removeStructureMissionModule(state, 'mitochondria')!;
    expect(structureMissionCheckpoint(state).score.total).toBeLessThan(80);
    state = placeStructureMissionModule(state, 'mitochondria', positions.mitochondria)!;
    expect(structureMissionCheckpoint(state).score.total).toBe(77.5);
    state = recordStructureMissionFunction(state, 'mitochondria')!;
    expect(structureMissionCheckpoint(state).score.total).toBe(80);
  });

  it('rejects schema mismatch, unknown structures, and evidence without presence', () => {
    const valid = completeAddedStructures();
    expect(parseStructureMissionVoxelState(valid)).toEqual(valid);
    expect(parseStructureMissionVoxelState({ ...valid, version: 3 })).toBeNull();
    expect(
      parseStructureMissionVoxelState({
        ...valid,
        placements: { ...valid.placements, endoplasmicReticulum: { x: 0, y: 1, z: 0 } },
      }),
    ).toBeNull();
    expect(
      parseStructureMissionVoxelState({
        ...createStructureMissionVoxelState(),
        functionEvidence: { nucleus: true },
      }),
    ).toBeNull();
  });
});
