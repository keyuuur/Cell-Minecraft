import { ASSIGNMENT, GAME_VERSION, SAVE_SCHEMA_VERSION } from '../data/assignment';
import type {
  PlaceableStructureId,
  Point3,
  SaveEnvelopeV3,
  VoxelMissionSnapshotV1,
} from '../types/game';
import { VOXEL_MISSION_TEMPLATE_ID } from '../types/game';
import { createCompletedBoundaryVoxelState } from '../voxel/boundaryAdapter';
import { VOXEL_PALETTE_VERSION } from '../voxel/blocks';
import { MISSION_RECOMMENDED_PREFAB_ANCHORS } from '../voxel/missionDefinition';
import { VoxelWorld } from '../voxel/VoxelWorld';

export const PHASE4_STRUCTURE_POSITIONS: Record<PlaceableStructureId, Point3> = structuredClone(
  MISSION_RECOMMENDED_PREFAB_ANCHORS,
);

export function createVoxelContractWorld(): VoxelWorld {
  return new VoxelWorld({
    min: { x: -12, y: 0, z: -12 },
    width: 24,
    height: 12,
    depth: 24,
    regionSize: { x: 8, y: 12, z: 8 },
  });
}

/** Verified Phase 4 semantic checkpoint expressed through the future aggregate. */
export function createPhase4VoxelMissionFixture(
  world = createVoxelContractWorld(),
): VoxelMissionSnapshotV1 {
  return {
    version: 1,
    templateId: VOXEL_MISSION_TEMPLATE_ID,
    paletteVersion: VOXEL_PALETTE_VERSION,
    revision: 24,
    player: {
      x: world.bounds.min.x + world.bounds.width / 2,
      y: world.bounds.min.y + 0.5,
      z: world.bounds.min.z + world.bounds.depth - 4,
      yaw: 0,
      pitch: 0,
    },
    boundary: createCompletedBoundaryVoxelState(),
    depotInventory: {
      cellWall: 0,
      cellMembrane: 0,
      nucleus: 0,
      ribosomes: 0,
      mitochondria: 0,
      chloroplasts: 0,
      centralVacuole: 0,
    },
    placements: structuredClone(PHASE4_STRUCTURE_POSITIONS),
    functionEvidence: {
      nucleus: true,
      ribosomes: true,
      mitochondria: true,
      chloroplasts: true,
      centralVacuole: true,
    },
    moduleInventory: {
      cellWall: 0,
      cellMembrane: 0,
      nucleus: 0,
      ribosomes: 0,
      mitochondria: 0,
      chloroplasts: 0,
      centralVacuole: 0,
    },
    activeModulePickups: [],
    selectedHotbarItem: 'builder-pick',
    homeostasis: {
      waterAvailable: true,
      vacuoleHydratedObserved: false,
      droughtStarted: false,
      droughtDiagnosed: false,
      droughtObserved: false,
      recoveryRestored: false,
    },
    correction: { removedTarget: null, recovery: null },
    completion: { completionLocked: false, completed: false, practice: false },
    lastFeedback: 'Phase 4 contract parity fixture.',
    stageTimestamps: {},
  };
}

export function createCompletedVoxelMissionFixture(
  world = createVoxelContractWorld(),
): VoxelMissionSnapshotV1 {
  const snapshot = createPhase4VoxelMissionFixture(world);
  return {
    ...snapshot,
    revision: 30,
    homeostasis: {
      waterAvailable: true,
      vacuoleHydratedObserved: true,
      droughtStarted: true,
      droughtDiagnosed: true,
      droughtObserved: true,
      recoveryRestored: true,
    },
    completion: { completionLocked: true, completed: true, practice: false },
    lastFeedback: 'The cell is stable again.',
  };
}

export function createSaveEnvelopeV3Fixture(world = createVoxelContractWorld()): SaveEnvelopeV3 {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: GAME_VERSION,
    assignmentId: ASSIGNMENT.id,
    assignmentVersion: ASSIGNMENT.version,
    sessionId: 'session-contract-fixture',
    attemptId: 'attempt-contract-fixture',
    student: { firstName: 'Test', lastInitial: 'S', period: 1 },
    controls: 'touch-only',
    qualityMode: 'standard',
    accessibility: {
      largeText: false,
      highContrast: false,
      reducedMotion: false,
      muted: true,
    },
    activeElapsedMs: 120_000,
    voxelMission: createPhase4VoxelMissionFixture(world),
    hintsUsed: { 1: 0, 2: 0, 3: 0 },
    gradedSnapshot: null,
    submissionStatus: 'idle',
    outcome: 'active',
    savedAt: 1_700_000_000_000,
  };
}
