import { REQUIRED_STRUCTURES } from '../data/assignment';
import type { MissionStage, MissionState, PlaceableStructureId, Point3 } from '../types/game';

export const PANEL_TARGET = 6;

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
        ? 'Use the water station to diagnose and repair the water shortage.'
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

export function canPlaceStructure(
  mission: MissionState,
  id: PlaceableStructureId,
  position: Point3,
): { allowed: boolean; reason?: string } {
  if (!mission.cytoplasmEstablished) {
    return { allowed: false, reason: 'Establish the cytoplasm before adding internal structures.' };
  }
  if (mission.placements[id]) {
    return { allowed: false, reason: 'That structure is already installed.' };
  }
  if (
    (id === 'mitochondria' || id === 'chloroplasts') &&
    (!mission.placements.nucleus || !mission.placements.ribosomes)
  ) {
    return {
      allowed: false,
      reason: 'Install the nucleus and ribosomes before this system stage.',
    };
  }
  if (id === 'centralVacuole') {
    if (!mission.placements.nucleus || !mission.placements.ribosomes) {
      return { allowed: false, reason: 'Install the nucleus and ribosomes first.' };
    }
    if (!mission.placements.mitochondria || !mission.placements.chloroplasts) {
      return { allowed: false, reason: 'Install mitochondria and chloroplasts first.' };
    }
    const central = Math.abs(position.x) <= 4 && Math.abs(position.z) <= 4;
    return central
      ? { allowed: true }
      : { allowed: false, reason: 'The large central vacuole needs the broad central zone.' };
  }
  const broadInterior = Math.abs(position.x) <= 8 && Math.abs(position.z) <= 8;
  return broadInterior
    ? { allowed: true }
    : { allowed: false, reason: 'Choose a broad zone inside the membrane.' };
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
