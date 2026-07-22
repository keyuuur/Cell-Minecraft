import { assessPlacement } from '../biology/rules';
import { calculateScore } from '../biology/scoring';
import {
  STRUCTURE_FUNCTIONS,
  STRUCTURE_LABELS as ASSIGNMENT_STRUCTURE_LABELS,
} from '../data/assignment';
import type {
  MissionState,
  PlaceableStructureId,
  Point3,
  ScoreBreakdown,
  StructureId,
} from '../types/game';
import { MISSION_STRUCTURE_ORDER } from './missionDefinition';
import {
  createCompletedBoundaryVoxelState,
  projectBoundaryMission,
  validateBoundaryVoxelState,
  type BoundaryVoxelStateV1,
} from './boundaryAdapter';

export const STRUCTURE_MISSION_ADAPTER_VERSION = 2;

/** @deprecated Phase 4 proof alias; integrated code imports MISSION_STRUCTURE_ORDER directly. */
export const VOXEL_STRUCTURE_ORDER = MISSION_STRUCTURE_ORDER;

export type StructureMissionStage =
  'control-and-protein' | 'energy-and-photosynthesis' | 'water-storage' | 'complete';

export interface StructureMissionVoxelStateV2 {
  version: 2;
  boundary: BoundaryVoxelStateV1;
  collected: Partial<Record<PlaceableStructureId, boolean>>;
  placements: Partial<Record<PlaceableStructureId, Point3>>;
  functionEvidence: Partial<Record<PlaceableStructureId, boolean>>;
}

export interface StructureMissionCheckpoint {
  mission: MissionState;
  score: ScoreBreakdown;
  completedStructures: number;
  addedStructureCreditComplete: boolean;
}

const isFinitePoint = (value: unknown): value is Point3 => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<Point3>;
  return [point.x, point.y, point.z].every(
    (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
  );
};

const isCanonicalStructurePlacement = (id: PlaceableStructureId, position: Point3): boolean => {
  if (position.y !== 1) return false;
  const zoneLimit = id === 'centralVacuole' ? 4 : 8;
  return Math.abs(position.x) <= zoneLimit && Math.abs(position.z) <= zoneLimit;
};

const knownStructureKeysOnly = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === 'object' &&
  Object.keys(value as object).every((key) =>
    VOXEL_STRUCTURE_ORDER.includes(key as PlaceableStructureId),
  );

export function createStructureMissionVoxelState(): StructureMissionVoxelStateV2 {
  return {
    version: STRUCTURE_MISSION_ADAPTER_VERSION,
    boundary: createCompletedBoundaryVoxelState(),
    collected: {},
    placements: {},
    functionEvidence: {},
  };
}

export function cloneStructureMissionVoxelState(
  state: StructureMissionVoxelStateV2,
): StructureMissionVoxelStateV2 {
  return {
    ...state,
    boundary: {
      ...state.boundary,
      wallAnchors: [...state.boundary.wallAnchors],
      membraneAnchors: [...state.boundary.membraneAnchors],
      functionEvidence: { ...state.boundary.functionEvidence },
    },
    collected: { ...state.collected },
    placements: Object.fromEntries(
      Object.entries(state.placements).map(([id, position]) => [
        id,
        position ? { ...position } : position,
      ]),
    ),
    functionEvidence: { ...state.functionEvidence },
  };
}

export function structureMissionStage(state: StructureMissionVoxelStateV2): StructureMissionStage {
  if (!state.placements.nucleus || !state.placements.ribosomes) return 'control-and-protein';
  if (!state.placements.mitochondria || !state.placements.chloroplasts) {
    return 'energy-and-photosynthesis';
  }
  if (!state.placements.centralVacuole) return 'water-storage';
  return VOXEL_STRUCTURE_ORDER.every((id) => state.functionEvidence[id])
    ? 'complete'
    : 'water-storage';
}

export function activeStructureSupplies(
  state: StructureMissionVoxelStateV2,
): PlaceableStructureId[] {
  const stage = structureMissionStage(state);
  const candidates: readonly PlaceableStructureId[] =
    stage === 'control-and-protein'
      ? ['nucleus', 'ribosomes']
      : stage === 'energy-and-photosynthesis'
        ? ['mitochondria', 'chloroplasts']
        : stage === 'water-storage'
          ? ['centralVacuole']
          : [];
  return candidates.filter((id) => !state.collected[id] && !state.placements[id]);
}

export function collectStructureModule(
  state: StructureMissionVoxelStateV2,
  id: PlaceableStructureId,
): StructureMissionVoxelStateV2 | null {
  if (!activeStructureSupplies(state).includes(id)) return null;
  const next = cloneStructureMissionVoxelState(state);
  next.collected[id] = true;
  return next;
}

export function assessStructureMissionPlacement(
  state: StructureMissionVoxelStateV2,
  id: PlaceableStructureId,
  position: Point3,
) {
  const mission = projectStructureMission(state);
  if (!state.collected[id]) {
    return {
      allowed: false,
      reason: `Collect the ${id} model module from its labeled supply depot first.`,
      zoneLabel: id === 'centralVacuole' ? 'CENTRAL VACUOLE ZONE' : 'BROAD INTERIOR ZONE',
    };
  }
  return assessPlacement(mission, id, position);
}

export function placeStructureMissionModule(
  state: StructureMissionVoxelStateV2,
  id: PlaceableStructureId,
  position: Point3,
): StructureMissionVoxelStateV2 | null {
  const assessment = assessStructureMissionPlacement(state, id, position);
  if (!assessment.allowed) return null;
  const next = cloneStructureMissionVoxelState(state);
  next.placements[id] = { x: position.x, y: 1, z: position.z };
  return next;
}

export function removeStructureMissionModule(
  state: StructureMissionVoxelStateV2,
  id: PlaceableStructureId,
): StructureMissionVoxelStateV2 | null {
  if (!state.placements[id]) return null;
  const next = cloneStructureMissionVoxelState(state);
  delete next.placements[id];
  delete next.functionEvidence[id];
  next.collected[id] = true;
  return next;
}

export function recordStructureMissionFunction(
  state: StructureMissionVoxelStateV2,
  id: PlaceableStructureId,
): StructureMissionVoxelStateV2 | null {
  if (!state.placements[id]) return null;
  const next = cloneStructureMissionVoxelState(state);
  next.functionEvidence[id] = true;
  return next;
}

export function validateStructureMissionVoxelState(
  value: unknown,
): value is StructureMissionVoxelStateV2 {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<StructureMissionVoxelStateV2>;
  if (
    state.version !== STRUCTURE_MISSION_ADAPTER_VERSION ||
    !validateBoundaryVoxelState(state.boundary) ||
    !knownStructureKeysOnly(state.collected) ||
    !knownStructureKeysOnly(state.placements) ||
    !knownStructureKeysOnly(state.functionEvidence)
  ) {
    return false;
  }
  const boundaryMission = projectBoundaryMission(state.boundary);
  if (
    boundaryMission.wallPanels !== 6 ||
    boundaryMission.membranePanels !== 6 ||
    !boundaryMission.cytoplasmEstablished ||
    !state.boundary.functionEvidence.cellWall ||
    !state.boundary.functionEvidence.cellMembrane ||
    !state.boundary.functionEvidence.cytoplasm
  ) {
    return false;
  }
  for (const id of VOXEL_STRUCTURE_ORDER) {
    const collected = state.collected[id];
    const placement = state.placements[id];
    const evidence = state.functionEvidence[id];
    if (collected !== undefined && typeof collected !== 'boolean') return false;
    if (
      placement !== undefined &&
      (!isFinitePoint(placement) || !isCanonicalStructurePlacement(id, placement))
    ) {
      return false;
    }
    if (evidence !== undefined && typeof evidence !== 'boolean') return false;
    if (placement && !collected) return false;
    if (evidence && !placement) return false;
  }
  // Later structures may remain while an earlier one is temporarily removed
  // for the required correction loop. New placements are still stage-gated.
  return true;
}

export function parseStructureMissionVoxelState(
  value: unknown,
): StructureMissionVoxelStateV2 | null {
  return validateStructureMissionVoxelState(value) ? cloneStructureMissionVoxelState(value) : null;
}

export function projectStructureMission(state: StructureMissionVoxelStateV2): MissionState {
  if (!validateStructureMissionVoxelState(state)) {
    throw new Error('Cannot project an invalid complete-structure voxel state.');
  }
  const mission = projectBoundaryMission(state.boundary);
  for (const [index, id] of VOXEL_STRUCTURE_ORDER.entries()) {
    const point = state.placements[id];
    if (state.collected[id]) mission.collected[id] = true;
    if (point) {
      mission.placements[id] = {
        id,
        position: { ...point },
        placedAt: index + 1,
      };
    }
    if (state.functionEvidence[id]) mission.functionEvidence[id] = true;
  }
  mission.lastFeedback = 'Complete-structure voxel adapter projection.';
  return mission;
}

export function structureMissionCheckpoint(
  state: StructureMissionVoxelStateV2,
): StructureMissionCheckpoint {
  const mission = projectStructureMission(state);
  const score = calculateScore(mission);
  const addedStructureCreditComplete = VOXEL_STRUCTURE_ORDER.every(
    (id) => Boolean(mission.placements[id]) && Boolean(mission.functionEvidence[id]),
  );
  return {
    mission,
    score,
    completedStructures:
      3 + VOXEL_STRUCTURE_ORDER.filter((id) => Boolean(mission.placements[id])).length,
    addedStructureCreditComplete,
  };
}

export const STRUCTURE_FUNCTION_COPY = Object.fromEntries(
  VOXEL_STRUCTURE_ORDER.map((id) => [id, STRUCTURE_FUNCTIONS[id]]),
) as Record<PlaceableStructureId, string>;

export const STRUCTURE_LABELS = Object.fromEntries(
  VOXEL_STRUCTURE_ORDER.map((id) => [id, ASSIGNMENT_STRUCTURE_LABELS[id]]),
) as Record<PlaceableStructureId, string>;

export const APPROVED_STRUCTURE_IDS: readonly StructureId[] = [
  'cellWall',
  'cellMembrane',
  'cytoplasm',
  ...VOXEL_STRUCTURE_ORDER,
];
