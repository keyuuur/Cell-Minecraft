import { calculateScore } from '../biology/scoring';
import { calculateObjectiveScore } from '../biology/submissionScoring';
import {
  ASSIGNMENT,
  GAME_VERSION,
  REQUIRED_STRUCTURES,
  SAVE_SCHEMA_VERSION,
  SUBMISSION_CONTRACT_VERSION,
} from '../data/assignment';
import type {
  ClientSubmissionPayloadV2,
  ForwardedSubmissionPayloadV2,
  LegacySaveEnvelopeV2,
  MissionCommand,
  MissionModuleId,
  MissionStage,
  MissionTarget,
  MissionViewModel,
  SaveEnvelopeV3,
  ScoreBreakdown,
  StudentProfile,
  SubmissionObjectivesV2,
  SubmissionSourceEnvironment,
  VoxelMissionSnapshotV1,
} from '../types/game';
import { VOXEL_MISSION_TEMPLATE_ID } from '../types/game';
import {
  BOUNDARY_SECTORS,
  projectBoundaryMission,
  validateBoundaryVoxelState,
} from '../voxel/boundaryAdapter';
import { VOXEL_PALETTE_VERSION } from '../voxel/blocks';
import { VOXEL_STRUCTURE_ORDER } from '../voxel/structureMissionAdapter';
import type { VoxelPoint } from '../voxel/types';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import { prefabOccupiedCells, validatePrefabPlacements } from './prefabRegistry';

export const LEGACY_V2_SAVE_POLICY = 'diagnostic-export-and-fresh-start' as const;
export const CORRUPT_V2_SAVE_POLICY = 'diagnostic-export-and-safe-reset' as const;
export const MISSION_INTERACTION_REACH = 5;

export const MISSION_MODULE_IDS = [
  'cellWall',
  'cellMembrane',
  ...VOXEL_STRUCTURE_ORDER,
] as const satisfies readonly MissionModuleId[];

const missionModuleIds = new Set<string>(MISSION_MODULE_IDS);
const missionHotbarItemIds = new Set<string>(['builder-pick', ...MISSION_MODULE_IDS]);
const placeableIds = new Set<string>(VOXEL_STRUCTURE_ORDER);
const structureIds = new Set<string>(REQUIRED_STRUCTURES);
const boundarySectorIds = new Set(BOUNDARY_SECTORS.map((sector) => sector.id));
const missionStages = new Set<string>(ASSIGNMENT.stages);

export const MISSION_MODULE_TOTALS: Readonly<Record<MissionModuleId, number>> = {
  cellWall: 6,
  cellMembrane: 6,
  nucleus: 1,
  ribosomes: 1,
  mitochondria: 1,
  chloroplasts: 1,
  centralVacuole: 1,
};

const accessibilityKeys = new Set(['largeText', 'highContrast', 'reducedMotion', 'muted']);
const studentKeys = new Set(['firstName', 'lastInitial', 'period']);
const hintLevelKeys = new Set(['1', '2', '3']);
const homeostasisKeys = new Set([
  'waterAvailable',
  'vacuoleHydratedObserved',
  'droughtStarted',
  'droughtDiagnosed',
  'droughtObserved',
  'recoveryRestored',
]);
const correctionKeys = new Set(['removedTarget', 'recovery']);
const completionKeys = new Set(['completionLocked', 'completed', 'practice']);
const scoreKeys = new Set([
  'boundary',
  'requiredStructures',
  'placementContext',
  'activationFunctions',
  'droughtRecovery',
  'finalStability',
  'total',
]);
const voxelSnapshotKeys = new Set([
  'version',
  'templateId',
  'paletteVersion',
  'revision',
  'player',
  'boundary',
  'depotInventory',
  'placements',
  'functionEvidence',
  'moduleInventory',
  'activeModulePickups',
  'selectedHotbarItem',
  'homeostasis',
  'correction',
  'completion',
  'lastFeedback',
  'stageTimestamps',
]);
const saveV3Keys = new Set([
  'schemaVersion',
  'gameVersion',
  'assignmentId',
  'assignmentVersion',
  'sessionId',
  'attemptId',
  'student',
  'controls',
  'qualityMode',
  'accessibility',
  'activeElapsedMs',
  'voxelMission',
  'hintsUsed',
  'gradedSnapshot',
  'submissionStatus',
  'outcome',
  'savedAt',
]);
const legacyV2SaveKeys = new Set([
  'schemaVersion',
  'gameVersion',
  'assignmentId',
  'assignmentVersion',
  'sessionId',
  'attemptId',
  'student',
  'controls',
  'qualityMode',
  'accessibility',
  'activeElapsedMs',
  'mission',
  'selectedItem',
  'hintsUsed',
  'score',
  'gradedScore',
  'gradedOutcome',
  'submissionStatus',
  'outcome',
  'savedAt',
]);
const legacyMissionKeys = new Set([
  'wallPanels',
  'membranePanels',
  'cytoplasmEstablished',
  'placements',
  'collected',
  'functionEvidence',
  'waterAvailable',
  'vacuoleHydratedObserved',
  'droughtStarted',
  'droughtDiagnosed',
  'droughtObserved',
  'recoveryRestored',
  'completionLocked',
  'completed',
  'practice',
  'lastFeedback',
  'stageTimestamps',
]);
const legacyPlacementKeys = new Set(['id', 'position', 'placedAt']);
const gradedSnapshotKeys = new Set([
  'score',
  'objectives',
  'hintsUsed',
  'outcome',
  'missionRevision',
  'activeElapsedMs',
  'lockedAt',
]);
const pickupKeys = new Set(['item', 'count', 'position', 'spawnSequence']);
const pointKeys = new Set(['x', 'y', 'z']);
const playerKeys = new Set(['x', 'y', 'z', 'yaw', 'pitch']);
const boundaryKeys = new Set([
  'version',
  'wallAnchors',
  'membraneAnchors',
  'cytoplasm',
  'functionEvidence',
]);
const boundaryFunctionKeys = new Set(['cellWall', 'cellMembrane', 'cytoplasm']);
const removedBoundaryKeys = new Set(['kind', 'layer', 'sectorId']);
const removedStructureKeys = new Set(['kind', 'structureId']);
const recoveryPickupKeys = new Set(['kind', 'spawnSequence']);
const recoveryInventoryKeys = new Set(['kind']);
const targetVoxelKeys = new Set(['kind', 'snapshotRevision', 'position', 'normal', 'distance']);
const targetPickupKeys = new Set(['kind', 'snapshotRevision', 'spawnSequence', 'item', 'distance']);
const targetBoundaryKeys = new Set(['kind', 'snapshotRevision', 'layer', 'sectorId', 'distance']);
const targetStructureKeys = new Set(['kind', 'snapshotRevision', 'structureId', 'distance']);
const targetSimpleKeys = new Set(['kind', 'snapshotRevision', 'distance']);
const missionViewModelKeys = new Set([
  'objective',
  'highlightedTarget',
  'primaryVerb',
  'primaryActionLabel',
  'primaryActionAccessibleLabel',
  'primaryActionEnabled',
  'hintContext',
  'feedback',
]);
const hintContextKeys = new Set(['stage', 'currentLevel', 'maxLevel']);
const feedbackKeys = new Set(['tone', 'message']);

const objectiveKeys = [
  'wallPanels',
  'membranePanels',
  'cytoplasm',
  'nucleus',
  'ribosomes',
  'mitochondria',
  'chloroplasts',
  'centralVacuole',
  'droughtDiagnosed',
  'droughtObserved',
  'recoveryRestored',
  'effectCellWall',
  'effectCellMembrane',
  'effectCytoplasm',
  'effectNucleus',
  'effectRibosomes',
  'effectMitochondria',
  'effectChloroplasts',
  'effectCentralVacuole',
] as const satisfies readonly (keyof SubmissionObjectivesV2)[];

const clientPayloadKeys = new Set([
  'contractVersion',
  'firstName',
  'lastInitial',
  'period',
  'attemptId',
  'sessionId',
  'assignmentId',
  'assignmentVersion',
  'gameVersion',
  'completed',
  'early',
  'timeout',
  'activeTimeSeconds',
  'objectives',
  'hintsUsed',
]);
const forwardedPayloadKeys = new Set([
  ...clientPayloadKeys,
  'score',
  'isTest',
  'sourceEnvironment',
  'canonicalDigest',
]);

const finitePoint = (value: unknown): value is VoxelPoint => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<VoxelPoint>;
  return [point.x, point.y, point.z].every(
    (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
  );
};

const pointInsideWorld = (point: VoxelPoint, world: VoxelWorld): boolean => {
  const { min, width, height, depth } = world.bounds;
  return (
    point.x >= min.x - 0.5 &&
    point.x <= min.x + width - 0.5 &&
    point.y >= min.y - 0.5 &&
    point.y <= min.y + height - 0.5 &&
    point.z >= min.z - 0.5 &&
    point.z <= min.z + depth - 0.5
  );
};

const playerInsideWorld = (
  player: VoxelPoint & { yaw: number; pitch: number },
  world: VoxelWorld,
): boolean => {
  const { min, width, height, depth } = world.bounds;
  const radius = 0.32;
  const playerHeight = 1.7;
  return (
    player.x - radius >= min.x - 0.5 &&
    player.x + radius <= min.x + width - 0.5 &&
    player.y >= min.y - 0.5 &&
    player.y + playerHeight <= min.y + height - 0.5 &&
    player.z - radius >= min.z - 0.5 &&
    player.z + radius <= min.z + depth - 0.5
  );
};

const knownKeysOnly = (value: unknown, allowed: Set<string>): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value as object).every((key) => allowed.has(key));

const exactKeys = (value: unknown, allowed: Set<string>): value is Record<string, unknown> =>
  knownKeysOnly(value, allowed) && Object.keys(value).length === allowed.size;

const validHints = (value: unknown): value is Record<number, number> =>
  exactKeys(value, hintLevelKeys) &&
  Object.values(value).every(
    (count) => Number.isInteger(count) && Number(count) >= 0 && Number(count) <= 100,
  );

const scoreEquals = (left: ScoreBreakdown, right: ScoreBreakdown): boolean =>
  (Object.keys(left) as Array<keyof ScoreBreakdown>).every(
    (key) => Math.abs(left[key] - right[key]) < 0.01,
  );

const validTimestampMap = (value: unknown): value is Partial<Record<MissionStage, number>> =>
  knownKeysOnly(value, missionStages) &&
  Object.values(value).every(
    (timestamp) => typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp >= 0,
  );

const validScore = (value: unknown): value is ScoreBreakdown => {
  if (!exactKeys(value, scoreKeys)) return false;
  const score = value as Partial<ScoreBreakdown>;
  const limits: Record<keyof Omit<ScoreBreakdown, 'total'>, number> = ASSIGNMENT.rubric;
  const keys = Object.keys(limits) as Array<keyof typeof limits>;
  if (
    !keys.every(
      (key) =>
        typeof score[key] === 'number' &&
        Number.isFinite(score[key]) &&
        score[key]! >= 0 &&
        score[key]! <= limits[key],
    ) ||
    typeof score.total !== 'number' ||
    !Number.isFinite(score.total) ||
    score.total < 0 ||
    score.total > 100
  ) {
    return false;
  }
  const total = keys.reduce((sum, key) => sum + score[key]!, 0);
  return Math.abs(total - score.total) < 0.01;
};

const allRequiredStructuresPresent = (snapshot: VoxelMissionSnapshotV1): boolean =>
  snapshot.boundary.wallAnchors.length === 6 &&
  snapshot.boundary.membraneAnchors.length === 6 &&
  snapshot.boundary.cytoplasm === 'filled' &&
  VOXEL_STRUCTURE_ORDER.every((id) => Boolean(snapshot.placements[id]));

const allFunctionEvidencePresent = (snapshot: VoxelMissionSnapshotV1): boolean =>
  snapshot.boundary.functionEvidence.cellWall &&
  snapshot.boundary.functionEvidence.cellMembrane &&
  snapshot.boundary.functionEvidence.cytoplasm &&
  VOXEL_STRUCTURE_ORDER.every((id) => snapshot.functionEvidence[id] === true);

export function validateVoxelMissionSnapshot(
  value: unknown,
  world: VoxelWorld,
): value is VoxelMissionSnapshotV1 {
  if (!exactKeys(value, voxelSnapshotKeys)) return false;
  const snapshot = value as Partial<VoxelMissionSnapshotV1>;
  if (
    snapshot.version !== 1 ||
    snapshot.templateId !== VOXEL_MISSION_TEMPLATE_ID ||
    snapshot.paletteVersion !== VOXEL_PALETTE_VERSION ||
    !Number.isInteger(snapshot.revision) ||
    snapshot.revision! < 0 ||
    !exactKeys(snapshot.player, playerKeys) ||
    !finitePoint(snapshot.player) ||
    !Number.isFinite(snapshot.player.yaw) ||
    !Number.isFinite(snapshot.player.pitch) ||
    !playerInsideWorld(snapshot.player, world) ||
    !exactKeys(snapshot.boundary, boundaryKeys) ||
    !exactKeys(snapshot.boundary.functionEvidence, boundaryFunctionKeys) ||
    !validateBoundaryVoxelState(snapshot.boundary) ||
    !exactKeys(snapshot.depotInventory, missionModuleIds) ||
    !knownKeysOnly(snapshot.placements, placeableIds) ||
    !knownKeysOnly(snapshot.functionEvidence, placeableIds) ||
    !exactKeys(snapshot.moduleInventory, missionModuleIds) ||
    !Array.isArray(snapshot.activeModulePickups) ||
    snapshot.activeModulePickups.length > 16 ||
    typeof snapshot.selectedHotbarItem !== 'string' ||
    !missionHotbarItemIds.has(snapshot.selectedHotbarItem) ||
    !exactKeys(snapshot.homeostasis, homeostasisKeys) ||
    !exactKeys(snapshot.correction, correctionKeys) ||
    !exactKeys(snapshot.completion, completionKeys) ||
    typeof snapshot.lastFeedback !== 'string' ||
    snapshot.lastFeedback.length > 280 ||
    !validTimestampMap(snapshot.stageTimestamps)
  ) {
    return false;
  }

  const depotInventory = snapshot.depotInventory as Record<MissionModuleId, number>;
  const moduleInventory = snapshot.moduleInventory as Record<MissionModuleId, number>;

  if (
    !MISSION_MODULE_IDS.every(
      (id) =>
        Number.isInteger(depotInventory[id]) &&
        depotInventory[id] >= 0 &&
        depotInventory[id] <= MISSION_MODULE_TOTALS[id] &&
        Number.isInteger(moduleInventory[id]) &&
        moduleInventory[id] >= 0 &&
        moduleInventory[id] <= MISSION_MODULE_TOTALS[id],
    ) ||
    !Object.values(snapshot.functionEvidence).every((flag) => typeof flag === 'boolean')
  ) {
    return false;
  }

  for (const id of VOXEL_STRUCTURE_ORDER) {
    const placement = snapshot.placements[id];
    const evidence = snapshot.functionEvidence[id];
    if (placement !== undefined && (!exactKeys(placement, pointKeys) || !finitePoint(placement))) {
      return false;
    }
    if (evidence && !placement) return false;
  }
  if (!validatePrefabPlacements(snapshot.placements).valid) return false;

  const occupiedPlacementCells = new Set<string>();
  for (const id of VOXEL_STRUCTURE_ORDER) {
    const placement = snapshot.placements[id];
    if (!placement) continue;
    for (const cell of prefabOccupiedCells(id, placement)) {
      occupiedPlacementCells.add(`${cell.x},${cell.z}`);
    }
  }
  const playerCell = `${Math.round(snapshot.player.x)},${Math.round(snapshot.player.z)}`;
  if (occupiedPlacementCells.has(playerCell) && snapshot.player.y < 4.5) return false;

  if (
    (Object.keys(snapshot.placements).length > 0 ||
      Object.values(snapshot.functionEvidence).some(Boolean)) &&
    (snapshot.boundary.cytoplasm !== 'filled' || !snapshot.boundary.functionEvidence.cytoplasm)
  ) {
    return false;
  }

  const pickupSequences = new Set<number>();
  const pickupCounts = Object.fromEntries(MISSION_MODULE_IDS.map((id) => [id, 0])) as Record<
    MissionModuleId,
    number
  >;
  for (const pickup of snapshot.activeModulePickups) {
    if (
      !pickup ||
      !exactKeys(pickup, pickupKeys) ||
      !missionModuleIds.has(pickup.item) ||
      !Number.isInteger(pickup.count) ||
      pickup.count <= 0 ||
      pickup.count > 99 ||
      !exactKeys(pickup.position, pointKeys) ||
      !finitePoint(pickup.position) ||
      !pointInsideWorld(pickup.position, world) ||
      !Number.isInteger(pickup.spawnSequence) ||
      pickup.spawnSequence <= 0 ||
      pickupSequences.has(pickup.spawnSequence)
    ) {
      return false;
    }
    pickupSequences.add(pickup.spawnSequence);
    pickupCounts[pickup.item] += pickup.count;
  }

  if (
    snapshot.selectedHotbarItem !== 'builder-pick' &&
    moduleInventory[snapshot.selectedHotbarItem] <= 0
  ) {
    return false;
  }

  for (const id of MISSION_MODULE_IDS) {
    const placedCount =
      id === 'cellWall'
        ? snapshot.boundary.wallAnchors.length
        : id === 'cellMembrane'
          ? snapshot.boundary.membraneAnchors.length
          : snapshot.placements[id]
            ? 1
            : 0;
    const conserved = depotInventory[id] + moduleInventory[id] + pickupCounts[id] + placedCount;
    if (conserved !== MISSION_MODULE_TOTALS[id]) return false;
  }

  const homeostasisValues = Object.values(snapshot.homeostasis);
  if (!homeostasisValues.every((flag) => typeof flag === 'boolean')) return false;
  if (
    snapshot.homeostasis.vacuoleHydratedObserved &&
    (!snapshot.placements.centralVacuole || !snapshot.functionEvidence.centralVacuole)
  ) {
    return false;
  }
  if (snapshot.homeostasis.droughtStarted && !snapshot.homeostasis.vacuoleHydratedObserved) {
    return false;
  }
  if (!snapshot.homeostasis.droughtStarted && !snapshot.homeostasis.waterAvailable) return false;
  if (
    snapshot.homeostasis.droughtStarted &&
    !snapshot.homeostasis.recoveryRestored &&
    snapshot.homeostasis.waterAvailable
  ) {
    return false;
  }
  if (
    (snapshot.homeostasis.droughtDiagnosed || snapshot.homeostasis.droughtObserved) &&
    !snapshot.homeostasis.droughtStarted
  ) {
    return false;
  }
  if (
    snapshot.homeostasis.recoveryRestored &&
    (!snapshot.homeostasis.droughtDiagnosed ||
      !snapshot.homeostasis.droughtObserved ||
      !snapshot.homeostasis.waterAvailable)
  ) {
    return false;
  }

  const { removedTarget, recovery } = snapshot.correction;
  if (Boolean(removedTarget) !== Boolean(recovery)) return false;
  let removedItem: MissionModuleId | null = null;
  if (removedTarget?.kind === 'boundary') {
    if (
      !exactKeys(removedTarget, removedBoundaryKeys) ||
      (removedTarget.layer !== 'cellWall' && removedTarget.layer !== 'cellMembrane') ||
      !boundarySectorIds.has(removedTarget.sectorId) ||
      (removedTarget.layer === 'cellWall'
        ? snapshot.boundary.wallAnchors.includes(removedTarget.sectorId) ||
          snapshot.boundary.functionEvidence.cellWall
        : snapshot.boundary.membraneAnchors.includes(removedTarget.sectorId) ||
          snapshot.boundary.functionEvidence.cellMembrane)
    ) {
      return false;
    }
    removedItem = removedTarget.layer;
  } else if (removedTarget?.kind === 'structure') {
    if (
      !exactKeys(removedTarget, removedStructureKeys) ||
      !placeableIds.has(removedTarget.structureId) ||
      snapshot.placements[removedTarget.structureId]
    ) {
      return false;
    }
    removedItem = removedTarget.structureId;
  }
  if (recovery?.kind === 'pickup') {
    if (!exactKeys(recovery, recoveryPickupKeys)) return false;
    const pickup = snapshot.activeModulePickups.find(
      (candidate) => candidate.spawnSequence === recovery.spawnSequence,
    );
    if (!pickup || pickup.item !== removedItem) return false;
  } else if (recovery?.kind === 'inventory') {
    if (!exactKeys(recovery, recoveryInventoryKeys)) return false;
    if (!removedItem || moduleInventory[removedItem] <= 0) return false;
  }
  if (recovery && recovery.kind !== 'pickup' && recovery.kind !== 'inventory') return false;

  const completionValues = Object.values(snapshot.completion);
  if (!completionValues.every((flag) => typeof flag === 'boolean')) return false;
  if (
    snapshot.completion.completed &&
    (!snapshot.homeostasis.recoveryRestored ||
      !allRequiredStructuresPresent(snapshot as VoxelMissionSnapshotV1) ||
      !allFunctionEvidencePresent(snapshot as VoxelMissionSnapshotV1))
  ) {
    return false;
  }
  if (
    snapshot.completion.completed &&
    !snapshot.completion.practice &&
    !snapshot.completion.completionLocked
  ) {
    return false;
  }
  if (snapshot.completion.practice && snapshot.completion.completionLocked) return false;
  return true;
}

export function parseVoxelMissionSnapshot(
  value: unknown,
  world: VoxelWorld,
): VoxelMissionSnapshotV1 | null {
  return validateVoxelMissionSnapshot(value, world)
    ? (JSON.parse(JSON.stringify(value)) as VoxelMissionSnapshotV1)
    : null;
}

export function projectVoxelMissionSnapshot(snapshot: VoxelMissionSnapshotV1, world: VoxelWorld) {
  if (!validateVoxelMissionSnapshot(snapshot, world)) {
    throw new Error('Cannot project an invalid voxel mission snapshot.');
  }
  const mission = projectBoundaryMission(snapshot.boundary);
  for (const id of MISSION_MODULE_IDS) {
    if (snapshot.depotInventory[id] < MISSION_MODULE_TOTALS[id]) mission.collected[id] = true;
  }
  if (snapshot.boundary.cytoplasm === 'filled') mission.collected.cytoplasm = true;
  for (const [index, id] of VOXEL_STRUCTURE_ORDER.entries()) {
    const position = snapshot.placements[id];
    if (position) {
      mission.placements[id] = { id, position: { ...position }, placedAt: index + 1 };
    }
    if (snapshot.functionEvidence[id]) mission.functionEvidence[id] = true;
  }
  Object.assign(mission, snapshot.homeostasis, {
    completionLocked: snapshot.completion.completionLocked,
    completed: snapshot.completion.completed,
    practice: snapshot.completion.practice,
    lastFeedback: snapshot.lastFeedback,
    stageTimestamps: { ...snapshot.stageTimestamps },
  });
  return mission;
}

export function scoreVoxelMissionSnapshot(
  snapshot: VoxelMissionSnapshotV1,
  world: VoxelWorld,
): ScoreBreakdown {
  return calculateScore(projectVoxelMissionSnapshot(snapshot, world));
}

export function submissionObjectivesFromMission(
  mission: ReturnType<typeof projectVoxelMissionSnapshot>,
): SubmissionObjectivesV2 {
  return {
    wallPanels: mission.wallPanels,
    membranePanels: mission.membranePanels,
    cytoplasm: mission.cytoplasmEstablished,
    nucleus: Boolean(mission.placements.nucleus),
    ribosomes: Boolean(mission.placements.ribosomes),
    mitochondria: Boolean(mission.placements.mitochondria),
    chloroplasts: Boolean(mission.placements.chloroplasts),
    centralVacuole: Boolean(mission.placements.centralVacuole),
    droughtDiagnosed: mission.droughtDiagnosed,
    droughtObserved: mission.droughtObserved,
    recoveryRestored: mission.recoveryRestored,
    effectCellWall: Boolean(mission.functionEvidence.cellWall),
    effectCellMembrane: Boolean(mission.functionEvidence.cellMembrane),
    effectCytoplasm: Boolean(mission.functionEvidence.cytoplasm),
    effectNucleus: Boolean(mission.functionEvidence.nucleus),
    effectRibosomes: Boolean(mission.functionEvidence.ribosomes),
    effectMitochondria: Boolean(mission.functionEvidence.mitochondria),
    effectChloroplasts: Boolean(mission.functionEvidence.chloroplasts),
    effectCentralVacuole: Boolean(mission.functionEvidence.centralVacuole),
  };
}

export function scoreSubmissionObjectivesV2(
  objectives: SubmissionObjectivesV2,
  completed: boolean,
): ScoreBreakdown {
  if (!validObjectives(objectives)) throw new Error('Cannot score invalid submission objectives.');
  return calculateObjectiveScore(objectives, completed);
}

const objectivesEqual = (left: SubmissionObjectivesV2, right: SubmissionObjectivesV2): boolean =>
  objectiveKeys.every((key) => left[key] === right[key]);

export function validateMissionTarget(value: unknown): value is MissionTarget {
  if (!value || typeof value !== 'object') return false;
  const target = value as Partial<MissionTarget> & Record<string, unknown>;
  const distanceValid =
    typeof target.distance === 'number' &&
    Number.isFinite(target.distance) &&
    target.distance >= 0 &&
    target.distance <= MISSION_INTERACTION_REACH;
  if (
    !distanceValid ||
    typeof target.kind !== 'string' ||
    !Number.isInteger(target.snapshotRevision) ||
    Number(target.snapshotRevision) < 0
  ) {
    return false;
  }
  switch (target.kind) {
    case 'voxel': {
      if (
        !exactKeys(target, targetVoxelKeys) ||
        !finitePoint(target.position) ||
        !exactKeys(target.position, pointKeys) ||
        ![target.position.x, target.position.y, target.position.z].every(Number.isInteger) ||
        !finitePoint(target.normal) ||
        !exactKeys(target.normal, pointKeys)
      ) {
        return false;
      }
      const normal = target.normal;
      return (
        [normal.x, normal.y, normal.z].filter((coordinate) => Math.abs(coordinate) === 1).length ===
          1 && [normal.x, normal.y, normal.z].filter((coordinate) => coordinate === 0).length === 2
      );
    }
    case 'pickup':
      return (
        exactKeys(target, targetPickupKeys) &&
        Number.isInteger(target.spawnSequence) &&
        Number(target.spawnSequence) > 0 &&
        typeof target.item === 'string' &&
        missionModuleIds.has(target.item)
      );
    case 'boundary':
      return (
        exactKeys(target, targetBoundaryKeys) &&
        (target.layer === 'cellWall' || target.layer === 'cellMembrane') &&
        typeof target.sectorId === 'string' &&
        boundarySectorIds.has(target.sectorId)
      );
    case 'structure':
      return (
        exactKeys(target, targetStructureKeys) &&
        typeof target.structureId === 'string' &&
        placeableIds.has(target.structureId)
      );
    case 'supply':
      return (
        exactKeys(target, targetStructureKeys) &&
        typeof target.structureId === 'string' &&
        structureIds.has(target.structureId)
      );
    case 'waterStation':
      return exactKeys(target, targetSimpleKeys);
    default:
      return false;
  }
}

export function validateMissionCommand(
  value: unknown,
  currentRevision?: number,
): value is MissionCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const command = value as Partial<MissionCommand> & Record<string, unknown>;
  const validType = [
    'mine',
    'collect',
    'place',
    'inspect',
    'remove',
    'interact',
    'overview',
    'recover',
  ].includes(command.type ?? '');
  return (
    validType &&
    Object.keys(command).length === 2 &&
    Number.isInteger(command.snapshotRevision) &&
    Number(command.snapshotRevision) >= 0 &&
    (currentRevision === undefined || command.snapshotRevision === currentRevision)
  );
}

export function validateMissionViewModel(value: unknown): value is MissionViewModel {
  if (!exactKeys(value, missionViewModelKeys)) return false;
  const view = value as Partial<MissionViewModel>;
  const validVerb =
    view.primaryVerb === null ||
    ['mine', 'collect', 'place', 'inspect', 'remove', 'interact', 'overview', 'recover'].includes(
      view.primaryVerb ?? '',
    );
  return (
    typeof view.objective === 'string' &&
    (view.highlightedTarget === null || validateMissionTarget(view.highlightedTarget)) &&
    validVerb &&
    typeof view.primaryActionLabel === 'string' &&
    typeof view.primaryActionAccessibleLabel === 'string' &&
    typeof view.primaryActionEnabled === 'boolean' &&
    exactKeys(view.hintContext, hintContextKeys) &&
    missionStages.has(view.hintContext?.stage ?? '') &&
    [0, 1, 2, 3].includes(view.hintContext?.currentLevel ?? -1) &&
    view.hintContext?.maxLevel === 3 &&
    (view.feedback === null ||
      (exactKeys(view.feedback, feedbackKeys) &&
        ['information', 'success', 'correction', 'warning'].includes(view.feedback!.tone) &&
        typeof view.feedback!.message === 'string' &&
        view.feedback.message.length <= 280))
  );
}

function validStudent(value: unknown): value is StudentProfile {
  if (!exactKeys(value, studentKeys)) return false;
  const student = value as Partial<StudentProfile>;
  return (
    typeof student.firstName === 'string' &&
    student.firstName.trim().length > 0 &&
    student.firstName.length <= 40 &&
    typeof student.lastInitial === 'string' &&
    /^[A-Za-z]$/.test(student.lastInitial) &&
    Number.isInteger(student.period) &&
    student.period! >= 1 &&
    student.period! <= 7
  );
}

export function validateSaveEnvelopeV3(value: unknown, world: VoxelWorld): value is SaveEnvelopeV3 {
  if (!exactKeys(value, saveV3Keys)) return false;
  const save = value as Partial<SaveEnvelopeV3>;
  if (
    save.schemaVersion !== SAVE_SCHEMA_VERSION ||
    save.gameVersion !== GAME_VERSION ||
    save.assignmentId !== ASSIGNMENT.id ||
    save.assignmentVersion !== ASSIGNMENT.version ||
    typeof save.sessionId !== 'string' ||
    !/^[A-Za-z0-9-]{1,64}$/.test(save.sessionId) ||
    typeof save.attemptId !== 'string' ||
    !/^[A-Za-z0-9-]{1,64}$/.test(save.attemptId) ||
    !validStudent(save.student) ||
    (save.controls !== 'keyboard-touch' && save.controls !== 'touch-only') ||
    !['auto', 'low', 'standard'].includes(save.qualityMode ?? '') ||
    !exactKeys(save.accessibility, accessibilityKeys) ||
    !Object.values(save.accessibility).every((flag) => typeof flag === 'boolean') ||
    typeof save.activeElapsedMs !== 'number' ||
    !Number.isFinite(save.activeElapsedMs) ||
    save.activeElapsedMs < 0 ||
    save.activeElapsedMs > ASSIGNMENT.durationSeconds * 1000 ||
    !validateVoxelMissionSnapshot(save.voxelMission, world) ||
    !validHints(save.hintsUsed) ||
    !['idle', 'queued', 'sending', 'accepted', 'duplicate', 'rejected'].includes(
      save.submissionStatus ?? '',
    ) ||
    !['active', 'complete', 'early', 'timeout', 'practice'].includes(save.outcome ?? '') ||
    typeof save.savedAt !== 'number' ||
    !Number.isFinite(save.savedAt) ||
    save.savedAt < 0
  ) {
    return false;
  }
  if (save.gradedSnapshot === null) {
    return (
      (save.outcome === 'active' || save.outcome === 'practice') &&
      save.submissionStatus === 'idle' &&
      !save.voxelMission.completion.completionLocked &&
      save.voxelMission.completion.practice === (save.outcome === 'practice') &&
      (save.outcome === 'practice' || !save.voxelMission.completion.completed)
    );
  }
  if (
    !save.gradedSnapshot ||
    !exactKeys(save.gradedSnapshot, gradedSnapshotKeys) ||
    !validScore(save.gradedSnapshot.score) ||
    !validObjectives(save.gradedSnapshot.objectives) ||
    !validHints(save.gradedSnapshot.hintsUsed) ||
    !['complete', 'early', 'timeout'].includes(save.gradedSnapshot.outcome) ||
    !Number.isInteger(save.gradedSnapshot.missionRevision) ||
    !Number.isFinite(save.gradedSnapshot.activeElapsedMs) ||
    save.gradedSnapshot.activeElapsedMs !== save.activeElapsedMs ||
    !Number.isFinite(save.gradedSnapshot.lockedAt) ||
    save.gradedSnapshot.lockedAt < 0 ||
    save.gradedSnapshot.lockedAt > save.savedAt
  ) {
    return false;
  }
  const continuingPractice = save.outcome === 'practice';
  if (
    continuingPractice
      ? !save.voxelMission.completion.practice ||
        save.voxelMission.completion.completionLocked ||
        save.gradedSnapshot.missionRevision > save.voxelMission.revision
      : save.gradedSnapshot.outcome !== save.outcome ||
        save.voxelMission.completion.practice ||
        !save.voxelMission.completion.completionLocked ||
        save.gradedSnapshot.missionRevision !== save.voxelMission.revision ||
        save.voxelMission.completion.completed !== (save.outcome === 'complete')
  ) {
    return false;
  }
  if (
    (save.gradedSnapshot.outcome === 'timeout' &&
      save.gradedSnapshot.activeElapsedMs !== ASSIGNMENT.durationSeconds * 1000) ||
    (save.gradedSnapshot.outcome === 'early' &&
      save.gradedSnapshot.activeElapsedMs >= ASSIGNMENT.durationSeconds * 1000)
  ) {
    return false;
  }
  const recomputedScore = scoreSubmissionObjectivesV2(
    save.gradedSnapshot.objectives,
    save.gradedSnapshot.outcome === 'complete',
  );
  if (!scoreEquals(save.gradedSnapshot.score, recomputedScore)) return false;
  if (continuingPractice) return true;
  const projectedObjectives = submissionObjectivesFromMission(
    projectVoxelMissionSnapshot(save.voxelMission, world),
  );
  const currentHints = save.hintsUsed as Record<number, number>;
  return (
    objectivesEqual(save.gradedSnapshot.objectives, projectedObjectives) &&
    [1, 2, 3].every((level) => save.gradedSnapshot!.hintsUsed[level] === currentHints[level])
  );
}

export type PersistedSaveClassification =
  | { kind: 'current-v3'; save: SaveEnvelopeV3 }
  | { kind: 'legacy-v2'; save: LegacySaveEnvelopeV2; action: typeof LEGACY_V2_SAVE_POLICY }
  | { kind: 'corrupt-v2'; action: typeof CORRUPT_V2_SAVE_POLICY }
  | { kind: 'unsupported' };

export function validateLegacySaveEnvelopeV2(value: unknown): value is LegacySaveEnvelopeV2 {
  if (!exactKeys(value, legacyV2SaveKeys)) return false;
  const save = value as Partial<LegacySaveEnvelopeV2>;
  const mission = save.mission;
  if (
    save.schemaVersion !== 2 ||
    save.gameVersion !== '0.1.0' ||
    save.assignmentId !== ASSIGNMENT.id ||
    save.assignmentVersion !== ASSIGNMENT.version ||
    typeof save.sessionId !== 'string' ||
    !/^[A-Za-z0-9-]{1,64}$/.test(save.sessionId) ||
    typeof save.attemptId !== 'string' ||
    !/^[A-Za-z0-9-]{1,64}$/.test(save.attemptId) ||
    !validStudent(save.student) ||
    (save.controls !== 'keyboard-touch' && save.controls !== 'touch-only') ||
    !['auto', 'low', 'standard'].includes(save.qualityMode ?? '') ||
    !exactKeys(save.accessibility, accessibilityKeys) ||
    !Object.values(save.accessibility).every((flag) => typeof flag === 'boolean') ||
    typeof save.activeElapsedMs !== 'number' ||
    !Number.isFinite(save.activeElapsedMs) ||
    save.activeElapsedMs < 0 ||
    save.activeElapsedMs > ASSIGNMENT.durationSeconds * 1000 ||
    !mission ||
    !exactKeys(mission, legacyMissionKeys) ||
    !Number.isInteger(mission.wallPanels) ||
    mission.wallPanels < 0 ||
    mission.wallPanels > 6 ||
    !Number.isInteger(mission.membranePanels) ||
    mission.membranePanels < 0 ||
    mission.membranePanels > 6 ||
    !mission.placements ||
    typeof mission.placements !== 'object' ||
    Array.isArray(mission.placements) ||
    !knownKeysOnly(mission.placements, placeableIds) ||
    !knownKeysOnly(mission.collected, structureIds) ||
    !knownKeysOnly(mission.functionEvidence, structureIds) ||
    !Object.values(mission.collected).every((flag) => typeof flag === 'boolean') ||
    !Object.values(mission.functionEvidence).every((flag) => typeof flag === 'boolean') ||
    !validTimestampMap(mission.stageTimestamps) ||
    typeof mission.lastFeedback !== 'string' ||
    mission.lastFeedback.length > 280 ||
    (save.selectedItem !== null &&
      (typeof save.selectedItem !== 'string' || !structureIds.has(save.selectedItem))) ||
    !knownKeysOnly(save.hintsUsed, hintLevelKeys) ||
    !Object.values(save.hintsUsed).every(
      (count) => Number.isInteger(count) && Number(count) >= 0 && Number(count) <= 100,
    ) ||
    !validScore(save.score) ||
    (save.gradedScore !== null && !validScore(save.gradedScore)) ||
    (save.gradedOutcome !== null &&
      save.gradedOutcome !== 'complete' &&
      save.gradedOutcome !== 'early' &&
      save.gradedOutcome !== 'timeout') ||
    !validHints({
      1: save.hintsUsed?.[1] ?? 0,
      2: save.hintsUsed?.[2] ?? 0,
      3: save.hintsUsed?.[3] ?? 0,
    }) ||
    !['idle', 'queued', 'sending', 'accepted', 'duplicate', 'rejected'].includes(
      save.submissionStatus ?? '',
    ) ||
    !['active', 'complete', 'early', 'timeout', 'practice'].includes(save.outcome ?? '') ||
    typeof save.savedAt !== 'number' ||
    !Number.isFinite(save.savedAt) ||
    save.savedAt < 0
  ) {
    return false;
  }
  for (const key of [
    'cytoplasmEstablished',
    'waterAvailable',
    'vacuoleHydratedObserved',
    'droughtStarted',
    'droughtDiagnosed',
    'droughtObserved',
    'recoveryRestored',
    'completionLocked',
    'completed',
    'practice',
  ] as const) {
    if (typeof mission[key] !== 'boolean') return false;
  }
  const hasGrade = save.gradedScore !== null || save.gradedOutcome !== null;
  if ((save.gradedScore === null) !== (save.gradedOutcome === null)) return false;
  if (mission.practice !== (save.outcome === 'practice')) return false;
  if (save.outcome === 'active' && hasGrade) return false;
  if (
    save.outcome !== 'active' &&
    save.outcome !== 'practice' &&
    (!hasGrade || save.gradedOutcome !== save.outcome || !mission.completionLocked)
  ) {
    return false;
  }
  if (save.outcome === 'practice' && mission.completionLocked) return false;
  if (
    save.outcome !== 'practice' &&
    hasGrade &&
    save.gradedScore &&
    !scoreEquals(save.score, save.gradedScore)
  ) {
    return false;
  }
  for (const [id, placement] of Object.entries(mission.placements)) {
    if (
      !placement ||
      !exactKeys(placement, legacyPlacementKeys) ||
      placement.id !== id ||
      !exactKeys(placement.position, pointKeys) ||
      !finitePoint(placement.position) ||
      !Number.isFinite(placement.placedAt)
    ) {
      return false;
    }
  }
  return true;
}

/** Detects legacy V2 data without attempting a spatial migration. */
export function classifyPersistedSave(
  value: unknown,
  world: VoxelWorld,
): PersistedSaveClassification {
  if (validateSaveEnvelopeV3(value, world)) return { kind: 'current-v3', save: value };
  if (validateLegacySaveEnvelopeV2(value)) {
    return { kind: 'legacy-v2', save: value, action: LEGACY_V2_SAVE_POLICY };
  }
  if (
    value &&
    typeof value === 'object' &&
    (value as { schemaVersion?: unknown }).schemaVersion === 2
  ) {
    return { kind: 'corrupt-v2', action: CORRUPT_V2_SAVE_POLICY };
  }
  return { kind: 'unsupported' };
}

function validObjectives(value: unknown): value is SubmissionObjectivesV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const objectives = value as Record<string, unknown>;
  if (
    Object.keys(objectives).length !== objectiveKeys.length ||
    !Object.keys(objectives).every((key) =>
      objectiveKeys.includes(key as keyof SubmissionObjectivesV2),
    )
  ) {
    return false;
  }
  const valuesValid = objectiveKeys.every((key) =>
    key === 'wallPanels' || key === 'membranePanels'
      ? Number.isInteger(objectives[key]) &&
        Number(objectives[key]) >= 0 &&
        Number(objectives[key]) <= 6
      : typeof objectives[key] === 'boolean',
  );
  if (!valuesValid) return false;
  const typed = objectives as unknown as SubmissionObjectivesV2;
  if (typed.membranePanels > 0 && typed.wallPanels !== 6) return false;
  if (typed.cytoplasm && (typed.wallPanels !== 6 || typed.membranePanels !== 6)) return false;
  const effectPresencePairs: Array<[boolean, boolean]> = [
    [typed.effectCellWall, typed.wallPanels === 6],
    [typed.effectCellMembrane, typed.membranePanels === 6],
    [typed.effectCytoplasm, typed.cytoplasm],
    [typed.effectNucleus, typed.nucleus],
    [typed.effectRibosomes, typed.ribosomes],
    [typed.effectMitochondria, typed.mitochondria],
    [typed.effectChloroplasts, typed.chloroplasts],
    [typed.effectCentralVacuole, typed.centralVacuole],
  ];
  if (effectPresencePairs.some(([effect, present]) => effect && !present)) return false;
  if (typed.droughtObserved && !typed.droughtDiagnosed) return false;
  if (typed.recoveryRestored && (!typed.droughtDiagnosed || !typed.droughtObserved)) return false;
  return true;
}

function validClientCore(value: unknown): value is ClientSubmissionPayloadV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Partial<ClientSubmissionPayloadV2>;
  const outcomes = [payload.completed, payload.early, payload.timeout];
  const coreValid =
    payload.contractVersion === SUBMISSION_CONTRACT_VERSION &&
    payload.gameVersion === GAME_VERSION &&
    payload.assignmentId === ASSIGNMENT.id &&
    payload.assignmentVersion === ASSIGNMENT.version &&
    typeof payload.firstName === 'string' &&
    payload.firstName.trim().length > 0 &&
    payload.firstName.length <= 40 &&
    typeof payload.lastInitial === 'string' &&
    /^[A-Za-z]$/.test(payload.lastInitial) &&
    Number.isInteger(payload.period) &&
    payload.period! >= 1 &&
    payload.period! <= 7 &&
    typeof payload.attemptId === 'string' &&
    /^[A-Za-z0-9-]{1,64}$/.test(payload.attemptId) &&
    typeof payload.sessionId === 'string' &&
    /^[A-Za-z0-9-]{1,64}$/.test(payload.sessionId) &&
    outcomes.every((outcome) => typeof outcome === 'boolean') &&
    outcomes.filter(Boolean).length === 1 &&
    Number.isInteger(payload.activeTimeSeconds) &&
    payload.activeTimeSeconds! >= 0 &&
    payload.activeTimeSeconds! <= ASSIGNMENT.durationSeconds &&
    validObjectives(payload.objectives) &&
    validHints(payload.hintsUsed);
  if (!coreValid) return false;
  const objectives = payload.objectives as SubmissionObjectivesV2;
  const logicallyComplete =
    objectives.wallPanels === 6 &&
    objectives.membranePanels === 6 &&
    objectives.cytoplasm &&
    VOXEL_STRUCTURE_ORDER.every((id) => objectives[id]) &&
    objectives.recoveryRestored &&
    objectiveKeys
      .filter((key) => key.startsWith('effect'))
      .every((key) => objectives[key] === true);
  if (payload.completed !== logicallyComplete) return false;
  if (payload.timeout && payload.activeTimeSeconds !== ASSIGNMENT.durationSeconds) return false;
  if (payload.early && payload.activeTimeSeconds! >= ASSIGNMENT.durationSeconds) return false;
  return true;
}

export function validateClientSubmissionPayloadV2(
  value: unknown,
): value is ClientSubmissionPayloadV2 {
  return exactKeys(value, clientPayloadKeys) && validClientCore(value);
}

type ForwardedSubmissionContentV2 = Omit<ForwardedSubmissionPayloadV2, 'canonicalDigest'>;

export function canonicalizeForwardedSubmissionPayloadV2(
  payload: ForwardedSubmissionContentV2,
): string {
  const objectives = Object.fromEntries(objectiveKeys.map((key) => [key, payload.objectives[key]]));
  return JSON.stringify({
    contractVersion: payload.contractVersion,
    assignmentId: payload.assignmentId,
    assignmentVersion: payload.assignmentVersion,
    gameVersion: payload.gameVersion,
    attemptId: payload.attemptId,
    sessionId: payload.sessionId,
    firstName: payload.firstName.trim(),
    lastInitial: payload.lastInitial.toUpperCase(),
    period: payload.period,
    completed: payload.completed,
    early: payload.early,
    timeout: payload.timeout,
    activeTimeSeconds: payload.activeTimeSeconds,
    objectives,
    hintsUsed: {
      1: payload.hintsUsed[1],
      2: payload.hintsUsed[2],
      3: payload.hintsUsed[3],
    },
    score: {
      boundary: payload.score.boundary,
      requiredStructures: payload.score.requiredStructures,
      placementContext: payload.score.placementContext,
      activationFunctions: payload.score.activationFunctions,
      droughtRecovery: payload.score.droughtRecovery,
      finalStability: payload.score.finalStability,
      total: payload.score.total,
    },
    isTest: payload.isTest,
    sourceEnvironment: payload.sourceEnvironment,
  });
}

export async function computeForwardedSubmissionDigestV2(
  payload: ForwardedSubmissionContentV2,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeForwardedSubmissionPayloadV2(payload));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function validateForwardedSubmissionPayloadV2(value: unknown): Promise<boolean> {
  if (!exactKeys(value, forwardedPayloadKeys) || !validClientCore(value)) return false;
  const payload = value as Partial<ForwardedSubmissionPayloadV2>;
  const source = payload.sourceEnvironment as SubmissionSourceEnvironment | undefined;
  if (
    !validScore(payload.score) ||
    typeof payload.isTest !== 'boolean' ||
    !['production', 'preview', 'development', 'test'].includes(source ?? '') ||
    typeof payload.canonicalDigest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(payload.canonicalDigest)
  ) {
    return false;
  }
  if (source === 'production' ? payload.isTest !== false : payload.isTest !== true) return false;
  const expectedScore = scoreSubmissionObjectivesV2(payload.objectives!, payload.completed!);
  if (!scoreEquals(payload.score, expectedScore)) return false;
  const { canonicalDigest, ...content } = payload as ForwardedSubmissionPayloadV2;
  return canonicalDigest === (await computeForwardedSubmissionDigestV2(content));
}
