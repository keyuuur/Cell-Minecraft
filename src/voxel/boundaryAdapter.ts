import { calculateScore } from '../biology/scoring';
import type { MissionState, ScoreBreakdown, StructureId } from '../types/game';
import type { VoxelPoint } from './types';

export const BOUNDARY_ADAPTER_VERSION = 1;
export const BOUNDARY_SECTOR_COUNT = 6;

export type BoundaryLayer = 'cellWall' | 'cellMembrane';
export type BoundaryFunctionId = BoundaryLayer | 'cytoplasm';

export interface BoundarySector {
  id: string;
  label: string;
  wallAnchor: VoxelPoint;
  wallBacking: VoxelPoint;
  wallCells: VoxelPoint[];
  membraneAnchor: VoxelPoint;
  membraneCells: VoxelPoint[];
}

export interface BoundaryVoxelStateV1 {
  version: 1;
  wallAnchors: string[];
  membraneAnchors: string[];
  cytoplasm: 'empty' | 'filled';
  functionEvidence: Record<BoundaryFunctionId, boolean>;
}

export interface BoundaryPlacementAssessment {
  allowed: boolean;
  reason?: string;
  sector: BoundarySector | null;
  zoneLabel: 'OUTER WALL MODEL' | 'INNER MEMBRANE MODEL';
}

export interface BoundaryCheckpoint {
  mission: MissionState;
  score: ScoreBreakdown;
  completedStructures: number;
}

const range = (start: number, end: number): number[] =>
  Array.from({ length: end - start + 1 }, (_, index) => start + index);

const backCells = (xStart: number, xEnd: number, z: number): VoxelPoint[] =>
  range(1, 3).flatMap((y) => range(xStart, xEnd).map((x) => ({ x, y, z })));

const sideCells = (x: number, zStart: number, zEnd: number): VoxelPoint[] =>
  range(1, 3).flatMap((y) => range(zStart, zEnd).map((z) => ({ x, y, z })));

export const BOUNDARY_SECTORS: readonly BoundarySector[] = [
  {
    id: 'back-left',
    label: 'Back left',
    wallAnchor: { x: -2, y: 2, z: -7 },
    wallBacking: { x: -2, y: 2, z: -8 },
    wallCells: backCells(-4, -1, -7),
    membraneAnchor: { x: -2, y: 2, z: -6 },
    membraneCells: backCells(-4, -1, -6),
  },
  {
    id: 'back-right',
    label: 'Back right',
    wallAnchor: { x: 2, y: 2, z: -7 },
    wallBacking: { x: 2, y: 2, z: -8 },
    wallCells: backCells(0, 3, -7),
    membraneAnchor: { x: 2, y: 2, z: -6 },
    membraneCells: backCells(0, 3, -6),
  },
  {
    id: 'left-back',
    label: 'Left back',
    wallAnchor: { x: -5, y: 2, z: -5 },
    wallBacking: { x: -6, y: 2, z: -5 },
    wallCells: sideCells(-5, -6, -4),
    membraneAnchor: { x: -4, y: 2, z: -5 },
    membraneCells: sideCells(-4, -6, -4),
  },
  {
    id: 'left-front',
    label: 'Left front',
    wallAnchor: { x: -5, y: 2, z: -2 },
    wallBacking: { x: -6, y: 2, z: -2 },
    wallCells: sideCells(-5, -3, -1),
    membraneAnchor: { x: -4, y: 2, z: -2 },
    membraneCells: sideCells(-4, -3, -1),
  },
  {
    id: 'right-back',
    label: 'Right back',
    wallAnchor: { x: 5, y: 2, z: -5 },
    wallBacking: { x: 6, y: 2, z: -5 },
    wallCells: sideCells(5, -6, -4),
    membraneAnchor: { x: 4, y: 2, z: -5 },
    membraneCells: sideCells(4, -6, -4),
  },
  {
    id: 'right-front',
    label: 'Right front',
    wallAnchor: { x: 5, y: 2, z: -2 },
    wallBacking: { x: 6, y: 2, z: -2 },
    wallCells: sideCells(5, -3, -1),
    membraneAnchor: { x: 4, y: 2, z: -2 },
    membraneCells: sideCells(4, -3, -1),
  },
] as const;

const sectorIds = new Set(BOUNDARY_SECTORS.map((sector) => sector.id));

const uniqueKnownIds = (ids: unknown): ids is string[] =>
  Array.isArray(ids) &&
  ids.length <= BOUNDARY_SECTOR_COUNT &&
  new Set(ids).size === ids.length &&
  ids.every((id) => typeof id === 'string' && sectorIds.has(id));

export function createBoundaryVoxelState(): BoundaryVoxelStateV1 {
  return {
    version: BOUNDARY_ADAPTER_VERSION,
    wallAnchors: [],
    membraneAnchors: [],
    cytoplasm: 'empty',
    functionEvidence: {
      cellWall: false,
      cellMembrane: false,
      cytoplasm: false,
    },
  };
}

export function cloneBoundaryVoxelState(state: BoundaryVoxelStateV1): BoundaryVoxelStateV1 {
  return {
    ...state,
    wallAnchors: [...state.wallAnchors],
    membraneAnchors: [...state.membraneAnchors],
    functionEvidence: { ...state.functionEvidence },
  };
}

export function validateBoundaryVoxelState(value: unknown): value is BoundaryVoxelStateV1 {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<BoundaryVoxelStateV1>;
  if (
    state.version !== BOUNDARY_ADAPTER_VERSION ||
    !uniqueKnownIds(state.wallAnchors) ||
    !uniqueKnownIds(state.membraneAnchors) ||
    (state.cytoplasm !== 'empty' && state.cytoplasm !== 'filled') ||
    !state.functionEvidence ||
    typeof state.functionEvidence.cellWall !== 'boolean' ||
    typeof state.functionEvidence.cellMembrane !== 'boolean' ||
    typeof state.functionEvidence.cytoplasm !== 'boolean'
  ) {
    return false;
  }

  const wallAnchors = state.wallAnchors as string[];
  const membraneAnchors = state.membraneAnchors as string[];
  const wallComplete = wallAnchors.length === BOUNDARY_SECTOR_COUNT;
  const membraneComplete = membraneAnchors.length === BOUNDARY_SECTOR_COUNT;
  if (membraneAnchors.length > 0 && !wallComplete) return false;
  if (membraneAnchors.some((id) => !wallAnchors.includes(id))) return false;
  if (state.cytoplasm === 'filled' && (!wallComplete || !membraneComplete)) return false;
  if (state.functionEvidence.cellWall && !wallComplete) return false;
  if (state.functionEvidence.cellMembrane && !membraneComplete) return false;
  if (state.functionEvidence.cytoplasm && state.cytoplasm !== 'filled') return false;
  return true;
}

export function parseBoundaryVoxelState(value: unknown): BoundaryVoxelStateV1 | null {
  return validateBoundaryVoxelState(value) ? cloneBoundaryVoxelState(value) : null;
}

export function nextBoundarySector(
  state: BoundaryVoxelStateV1,
  layer: BoundaryLayer,
): BoundarySector | null {
  const occupied = layer === 'cellWall' ? state.wallAnchors : state.membraneAnchors;
  return BOUNDARY_SECTORS.find((sector) => !occupied.includes(sector.id)) ?? null;
}

export function assessBoundaryPlacement(
  state: BoundaryVoxelStateV1,
  layer: BoundaryLayer,
  sectorId: string | null,
): BoundaryPlacementAssessment {
  const zoneLabel = layer === 'cellWall' ? 'OUTER WALL MODEL' : 'INNER MEMBRANE MODEL';
  const sector = BOUNDARY_SECTORS.find((candidate) => candidate.id === sectorId) ?? null;
  if (!sector) {
    return {
      allowed: false,
      reason: 'Aim at the active gold model brackets before placing.',
      sector: null,
      zoneLabel,
    };
  }
  if (layer === 'cellMembrane' && state.wallAnchors.length < BOUNDARY_SECTOR_COUNT) {
    return {
      allowed: false,
      reason: 'Finish all six outer wall model modules before building the inner membrane.',
      sector,
      zoneLabel,
    };
  }
  const occupied = layer === 'cellWall' ? state.wallAnchors : state.membraneAnchors;
  if (occupied.includes(sector.id)) {
    return {
      allowed: false,
      reason: 'That model sector is already filled.',
      sector,
      zoneLabel,
    };
  }
  if (layer === 'cellMembrane' && !state.wallAnchors.includes(sector.id)) {
    return {
      allowed: false,
      reason: 'The paired outer wall model module must be present first.',
      sector,
      zoneLabel,
    };
  }
  const expected = nextBoundarySector(state, layer);
  if (expected?.id !== sector.id) {
    return {
      allowed: false,
      reason: 'Follow the single active bracket around the classroom model.',
      sector,
      zoneLabel,
    };
  }
  return { allowed: true, sector, zoneLabel };
}

export function placeBoundaryModule(
  state: BoundaryVoxelStateV1,
  layer: BoundaryLayer,
  sectorId: string | null,
): BoundaryVoxelStateV1 | null {
  const assessment = assessBoundaryPlacement(state, layer, sectorId);
  if (!assessment.allowed || !assessment.sector) return null;
  const next = cloneBoundaryVoxelState(state);
  const anchors = layer === 'cellWall' ? next.wallAnchors : next.membraneAnchors;
  anchors.push(assessment.sector.id);
  return next;
}

export function removeBoundaryModule(
  state: BoundaryVoxelStateV1,
  layer: BoundaryLayer,
  sectorId: string,
): BoundaryVoxelStateV1 | null {
  if (state.cytoplasm === 'filled') return null;
  const occupied = layer === 'cellWall' ? state.wallAnchors : state.membraneAnchors;
  if (!occupied.includes(sectorId)) return null;
  if (layer === 'cellWall' && state.membraneAnchors.includes(sectorId)) return null;
  const next = cloneBoundaryVoxelState(state);
  const anchors = layer === 'cellWall' ? next.wallAnchors : next.membraneAnchors;
  anchors.splice(anchors.indexOf(sectorId), 1);
  next.functionEvidence[layer] = false;
  return next;
}

export function establishBoundaryCytoplasm(
  state: BoundaryVoxelStateV1,
): BoundaryVoxelStateV1 | null {
  if (
    state.wallAnchors.length !== BOUNDARY_SECTOR_COUNT ||
    state.membraneAnchors.length !== BOUNDARY_SECTOR_COUNT ||
    !state.functionEvidence.cellWall ||
    !state.functionEvidence.cellMembrane
  ) {
    return null;
  }
  return { ...cloneBoundaryVoxelState(state), cytoplasm: 'filled' };
}

export function recordBoundaryFunction(
  state: BoundaryVoxelStateV1,
  id: BoundaryFunctionId,
): BoundaryVoxelStateV1 | null {
  const present =
    id === 'cellWall'
      ? state.wallAnchors.length === BOUNDARY_SECTOR_COUNT
      : id === 'cellMembrane'
        ? state.membraneAnchors.length === BOUNDARY_SECTOR_COUNT
        : state.cytoplasm === 'filled';
  if (!present) return null;
  const next = cloneBoundaryVoxelState(state);
  next.functionEvidence[id] = true;
  return next;
}

export function projectBoundaryMission(state: BoundaryVoxelStateV1): MissionState {
  if (!validateBoundaryVoxelState(state)) {
    throw new Error('Cannot project an invalid boundary voxel state.');
  }
  const evidence: Partial<Record<StructureId, boolean>> = {};
  for (const id of ['cellWall', 'cellMembrane', 'cytoplasm'] as const) {
    if (state.functionEvidence[id]) evidence[id] = true;
  }
  return {
    wallPanels: state.wallAnchors.length,
    membranePanels: state.membraneAnchors.length,
    cytoplasmEstablished: state.cytoplasm === 'filled',
    placements: {},
    collected: {
      cellWall: state.wallAnchors.length > 0,
      cellMembrane: state.membraneAnchors.length > 0,
      cytoplasm: state.cytoplasm === 'filled',
    },
    functionEvidence: evidence,
    waterAvailable: true,
    vacuoleHydratedObserved: false,
    droughtStarted: false,
    droughtDiagnosed: false,
    droughtObserved: false,
    recoveryRestored: false,
    completionLocked: false,
    completed: false,
    practice: true,
    lastFeedback: 'Boundary voxel adapter projection.',
    stageTimestamps: {},
  };
}

export function boundaryCheckpoint(state: BoundaryVoxelStateV1): BoundaryCheckpoint {
  const mission = projectBoundaryMission(state);
  return {
    mission,
    score: calculateScore(mission),
    completedStructures:
      Number(mission.wallPanels === BOUNDARY_SECTOR_COUNT) +
      Number(mission.membranePanels === BOUNDARY_SECTOR_COUNT) +
      Number(mission.cytoplasmEstablished),
  };
}
