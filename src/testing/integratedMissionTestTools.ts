import { MISSION_MODULE_TOTALS } from '../contracts/missionContracts';
import { createPhase4VoxelMissionFixture } from '../contracts/missionContracts.fixtures';
import type { VoxelMissionSnapshotV1 } from '../types/game';

function boundaryCheckpoint(current: VoxelMissionSnapshotV1): VoxelMissionSnapshotV1 {
  const fixture = createPhase4VoxelMissionFixture();
  return {
    ...fixture,
    revision: current.revision + 1,
    player: structuredClone(current.player),
    depotInventory: { ...MISSION_MODULE_TOTALS, cellWall: 0, cellMembrane: 0 },
    placements: {},
    functionEvidence: {
      nucleus: false,
      ribosomes: false,
      mitochondria: false,
      chloroplasts: false,
      centralVacuole: false,
    },
    homeostasis: {
      waterAvailable: true,
      vacuoleHydratedObserved: false,
      droughtStarted: false,
      droughtDiagnosed: false,
      droughtObserved: false,
      recoveryRestored: false,
    },
    completion: { completionLocked: false, completed: false, practice: false },
    lastFeedback: 'Test checkpoint: the nested boundary and cytoplasm are established.',
    stageTimestamps: {},
  };
}

function structureCheckpoint(current: VoxelMissionSnapshotV1): VoxelMissionSnapshotV1 {
  const fixture = createPhase4VoxelMissionFixture();
  return {
    ...fixture,
    revision: current.revision + 1,
    player: structuredClone(current.player),
    lastFeedback: 'Test checkpoint: all five interior components are installed and inspected.',
  };
}

/**
 * Development-only checkpoint progression for resilience and classroom-flow
 * tests. Production never renders the control that imports this module.
 */
export function advanceIntegratedMissionForTesting(
  current: VoxelMissionSnapshotV1,
  now = Date.now(),
): VoxelMissionSnapshotV1 {
  if (current.boundary.wallAnchors.length < 6 || current.boundary.membraneAnchors.length < 6) {
    return boundaryCheckpoint(current);
  }
  if (Object.keys(current.placements).length < 5) return structureCheckpoint(current);
  if (!current.homeostasis.vacuoleHydratedObserved) {
    return {
      ...structuredClone(current),
      revision: current.revision + 1,
      homeostasis: { ...current.homeostasis, vacuoleHydratedObserved: true },
      lastFeedback: 'Test checkpoint: hydrated vacuole evidence is established.',
    };
  }
  if (!current.homeostasis.droughtStarted) {
    return {
      ...structuredClone(current),
      revision: current.revision + 1,
      homeostasis: {
        ...current.homeostasis,
        waterAvailable: false,
        droughtStarted: true,
        droughtDiagnosed: true,
        droughtObserved: true,
      },
      completion: { ...current.completion, completed: false },
      lastFeedback: 'Test checkpoint: reduced water, lower turgor, and wilting are observed.',
      stageTimestamps: { ...current.stageTimestamps, 'drought-diagnosis': now },
    };
  }
  if (!current.homeostasis.recoveryRestored || !current.stageTimestamps.stable) {
    return {
      ...structuredClone(current),
      revision: current.revision + 1,
      homeostasis: {
        ...current.homeostasis,
        waterAvailable: true,
        droughtDiagnosed: true,
        droughtObserved: true,
        recoveryRestored: true,
      },
      completion: { ...current.completion, completed: false },
      lastFeedback: 'Test checkpoint: water storage, turgor, and the firm plant are restored.',
      stageTimestamps: { ...current.stageTimestamps, recovery: now, stable: now },
    };
  }
  return structuredClone(current);
}
