import { REQUIRED_STRUCTURES } from '../data/assignment';
import type {
  MissionStage,
  MissionState,
  PlaceableStructureId,
  Point3,
  StructureId,
} from '../types/game';

export const PANEL_TARGET = 6;
export type ActiveStationId = StructureId | 'waterStation';

export interface PlacementAssessment {
  allowed: boolean;
  reason?: string;
  zoneLabel: string;
}

export function createInitialMission(practice = false): MissionState {
  return {
    wallPanels: 0,
    membranePanels: 0,
    cytoplasmEstablished: false,
    placements: {},
    collected: {},
    functionEvidence: {},
    waterAvailable: true,
    vacuoleHydratedObserved: false,
    droughtStarted: false,
    droughtDiagnosed: false,
    droughtObserved: false,
    recoveryRestored: false,
    completionLocked: false,
    completed: false,
    practice,
    lastFeedback: 'Collect the wall panels from the green supply depot.',
    stageTimestamps: { boundary: Date.now() },
  };
}

export function currentStage(mission: MissionState): MissionStage {
  if (mission.completed) return 'stable';
  if (mission.droughtStarted && mission.droughtDiagnosed) return 'recovery';
  if (mission.droughtStarted) return 'drought-diagnosis';
  if (mission.wallPanels < PANEL_TARGET || mission.membranePanels < PANEL_TARGET) return 'boundary';
  if (!mission.cytoplasmEstablished) return 'cytoplasm';
  if (!mission.placements.nucleus || !mission.placements.ribosomes) {
    return 'control-and-protein';
  }
  if (!mission.placements.mitochondria || !mission.placements.chloroplasts) {
    return 'energy-and-photosynthesis';
  }
  return 'water-storage';
}

export function activeStationIds(mission: MissionState): ActiveStationId[] {
  if (mission.wallPanels < PANEL_TARGET) return ['cellWall'];
  if (mission.membranePanels < PANEL_TARGET) return ['cellMembrane'];
  if (!mission.cytoplasmEstablished) return ['cytoplasm'];
  if (!mission.placements.nucleus || !mission.placements.ribosomes) {
    return (['nucleus', 'ribosomes'] as const).filter((id) => !mission.placements[id]);
  }
  if (!mission.placements.mitochondria || !mission.placements.chloroplasts) {
    return (['mitochondria', 'chloroplasts'] as const).filter((id) => !mission.placements[id]);
  }
  if (!mission.placements.centralVacuole) return ['centralVacuole'];
  if (mission.droughtObserved && !mission.recoveryRestored) return ['waterStation'];
  return [];
}

export function objectiveFor(mission: MissionState): string {
  const stage = currentStage(mission);
  switch (stage) {
    case 'boundary':
      if (mission.wallPanels < PANEL_TARGET) {
        return `Place wall panels outside the cell (${mission.wallPanels}/${PANEL_TARGET}).`;
      }
      return `Place membrane panels just inside the wall (${mission.membranePanels}/${PANEL_TARGET}).`;
    case 'cytoplasm':
      return 'Establish the cytoplasm inside the membrane.';
    case 'control-and-protein':
      return 'Install the nucleus and ribosomes in broad interior zones.';
    case 'energy-and-photosynthesis':
      return 'Install mitochondria and chloroplasts.';
    case 'water-storage':
      if (!mission.placements.centralVacuole) {
        return 'Install the large central vacuole and establish water storage.';
      }
      if (REQUIRED_STRUCTURES.some((id) => !mission.functionEvidence[id])) {
        const observed = REQUIRED_STRUCTURES.filter((id) => mission.functionEvidence[id]).length;
        return `Move until Inspect appears, then tap Interact (${observed}/8 functions).`;
      }
      return mission.vacuoleHydratedObserved
        ? 'Begin the water-availability challenge from Overview.'
        : 'Open Overview to observe the full vacuole and high turgor.';
    case 'drought-diagnosis':
      return mission.droughtObserved
        ? 'Restore external water availability at the water station.'
        : 'The cell is wilting. Use Overview to observe the system change.';
    case 'recovery':
      return 'Open Overview to verify that turgor and firmness recovered.';
    case 'stable':
      return 'Cell stable. Review your evidence and submit when ready.';
  }
}

export function canEstablishCytoplasm(mission: MissionState): boolean {
  return mission.wallPanels === PANEL_TARGET && mission.membranePanels === PANEL_TARGET;
}

export function assessPlacement(
  mission: MissionState,
  id: StructureId,
  position: Point3,
): PlacementAssessment {
  const radius = Math.hypot(position.x, position.z);
  if (id === 'cellWall') {
    return radius >= 8.5 && radius <= 12.5
      ? { allowed: true, zoneLabel: 'OUTER WALL ZONE' }
      : {
          allowed: false,
          reason: 'Move to the chamber boundary before snapping a wall panel into place.',
          zoneLabel: 'OUTER WALL ZONE',
        };
  }
  if (id === 'cellMembrane') {
    if (mission.wallPanels < PANEL_TARGET) {
      return {
        allowed: false,
        reason: 'The supporting wall must be built outside first.',
        zoneLabel: 'INNER MEMBRANE ZONE',
      };
    }
    return radius >= 7.5 && radius <= 11.5
      ? { allowed: true, zoneLabel: 'INNER MEMBRANE ZONE' }
      : {
          allowed: false,
          reason: 'Move to the inside boundary before snapping a membrane panel into place.',
          zoneLabel: 'INNER MEMBRANE ZONE',
        };
  }
  if (id === 'cytoplasm') {
    return {
      allowed: false,
      reason: 'Establish cytoplasm from its supply depot.',
      zoneLabel: 'INTERIOR FILL',
    };
  }
  if (!mission.cytoplasmEstablished) {
    return {
      allowed: false,
      reason: 'Establish the cytoplasm before adding internal structures.',
      zoneLabel: id === 'centralVacuole' ? 'CENTRAL VACUOLE ZONE' : 'BROAD INTERIOR ZONE',
    };
  }
  if (mission.placements[id]) {
    return {
      allowed: false,
      reason: 'That structure is already installed.',
      zoneLabel: id === 'centralVacuole' ? 'CENTRAL VACUOLE ZONE' : 'BROAD INTERIOR ZONE',
    };
  }
  if (
    (id === 'mitochondria' || id === 'chloroplasts') &&
    (!mission.placements.nucleus || !mission.placements.ribosomes)
  ) {
    return {
      allowed: false,
      reason: 'Install the nucleus and ribosomes before this system stage.',
      zoneLabel: 'BROAD INTERIOR ZONE',
    };
  }
  if (id === 'centralVacuole') {
    if (!mission.placements.nucleus || !mission.placements.ribosomes) {
      return {
        allowed: false,
        reason: 'Install the nucleus and ribosomes first.',
        zoneLabel: 'CENTRAL VACUOLE ZONE',
      };
    }
    if (!mission.placements.mitochondria || !mission.placements.chloroplasts) {
      return {
        allowed: false,
        reason: 'Install mitochondria and chloroplasts first.',
        zoneLabel: 'CENTRAL VACUOLE ZONE',
      };
    }
    const central = Math.abs(position.x) <= 4 && Math.abs(position.z) <= 4;
    return central
      ? { allowed: true, zoneLabel: 'CENTRAL VACUOLE ZONE' }
      : {
          allowed: false,
          reason: 'The large central vacuole needs the broad central zone.',
          zoneLabel: 'CENTRAL VACUOLE ZONE',
        };
  }
  const broadInterior = Math.abs(position.x) <= 8 && Math.abs(position.z) <= 8;
  return broadInterior
    ? { allowed: true, zoneLabel: 'BROAD INTERIOR ZONE' }
    : {
        allowed: false,
        reason: 'Choose a broad zone inside the membrane.',
        zoneLabel: 'BROAD INTERIOR ZONE',
      };
}

export function canPlaceStructure(
  mission: MissionState,
  id: PlaceableStructureId,
  position: Point3,
): { allowed: boolean; reason?: string } {
  const { allowed, reason } = assessPlacement(mission, id, position);
  return { allowed, reason };
}

export function isStructurePresent(mission: MissionState, id: string): boolean {
  if (id === 'cellWall') return mission.wallPanels === PANEL_TARGET;
  if (id === 'cellMembrane') return mission.membranePanels === PANEL_TARGET;
  if (id === 'cytoplasm') return mission.cytoplasmEstablished;
  return Boolean(mission.placements[id as PlaceableStructureId]);
}

export function statusValues(mission: MissionState): {
  boundary: number;
  function: number;
  turgor: number;
} {
  const boundary = Math.round(
    ((mission.wallPanels + mission.membranePanels) / (PANEL_TARGET * 2)) * 100,
  );
  const functions = REQUIRED_STRUCTURES.filter((id) => mission.functionEvidence[id]).length;
  const turgor = mission.placements.centralVacuole
    ? mission.droughtStarted && !mission.recoveryRestored
      ? 25
      : 100
    : 0;
  return { boundary, function: Math.round((functions / REQUIRED_STRUCTURES.length) * 100), turgor };
}
