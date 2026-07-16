import { describe, expect, it } from 'vitest';
import { calculateScore } from './scoring';
import {
  canPlaceStructure,
  createInitialMission,
  currentStage,
  objectiveFor,
  PANEL_TARGET,
  statusValues,
} from './rules';
import type { MissionState } from '../types/game';

function completeMission(): MissionState {
  const now = Date.now();
  return {
    ...createInitialMission(),
    wallPanels: PANEL_TARGET,
    membranePanels: PANEL_TARGET,
    cytoplasmEstablished: true,
    placements: {
      nucleus: { id: 'nucleus', position: { x: -5, y: 1, z: 0 }, placedAt: now },
      ribosomes: { id: 'ribosomes', position: { x: 5, y: 1, z: 0 }, placedAt: now },
      mitochondria: { id: 'mitochondria', position: { x: -5, y: 1, z: 5 }, placedAt: now },
      chloroplasts: { id: 'chloroplasts', position: { x: 5, y: 1, z: 5 }, placedAt: now },
      centralVacuole: { id: 'centralVacuole', position: { x: 0, y: 1, z: 0 }, placedAt: now },
    },
    functionEvidence: {
      cellWall: true,
      cellMembrane: true,
      cytoplasm: true,
      nucleus: true,
      ribosomes: true,
      mitochondria: true,
      chloroplasts: true,
      centralVacuole: true,
    },
    vacuoleHydratedObserved: true,
    droughtStarted: true,
    droughtDiagnosed: true,
    droughtObserved: true,
    recoveryRestored: true,
    waterAvailable: true,
    completed: true,
  };
}

describe('Unit 1 mission rules', () => {
  it('keeps the wall outside by requiring it before membrane placement', () => {
    const mission = createInitialMission();
    expect(currentStage(mission)).toBe('boundary');
    expect(objectiveFor(mission)).toContain('wall');
  });

  it('treats cytoplasm as a fill prerequisite for internal structures', () => {
    const validation = canPlaceStructure(createInitialMission(), 'nucleus', { x: 0, y: 1, z: 0 });
    expect(validation.allowed).toBe(false);
    expect(validation.reason).toContain('cytoplasm');
  });

  it('keeps the two paired structure stages in the approved order', () => {
    const mission = createInitialMission();
    mission.wallPanels = PANEL_TARGET;
    mission.membranePanels = PANEL_TARGET;
    mission.cytoplasmEstablished = true;
    expect(canPlaceStructure(mission, 'mitochondria', { x: 2, y: 1, z: 2 })).toMatchObject({
      allowed: false,
    });
  });

  it('uses a broad central zone for the vacuole without exact coordinates', () => {
    const mission = completeMission();
    delete mission.placements.centralVacuole;
    mission.completed = false;
    expect(canPlaceStructure(mission, 'centralVacuole', { x: 3, y: 1, z: -4 }).allowed).toBe(true);
    expect(canPlaceStructure(mission, 'centralVacuole', { x: 8, y: 1, z: 0 }).allowed).toBe(false);
  });

  it('awards exactly 100 points for a fully stable recovered cell', () => {
    expect(calculateScore(completeMission())).toEqual({
      boundary: 15,
      requiredStructures: 30,
      placementContext: 15,
      activationFunctions: 20,
      droughtRecovery: 15,
      finalStability: 5,
      total: 100,
    });
  });

  it('shows no turgor before the vacuole and a hydrated baseline before drought', () => {
    const mission = createInitialMission();
    expect(statusValues(mission).turgor).toBe(0);
    mission.placements.centralVacuole = {
      id: 'centralVacuole',
      position: { x: 0, y: 1, z: 0 },
      placedAt: Date.now(),
    };
    expect(statusValues(mission).turgor).toBe(100);
    mission.droughtStarted = true;
    expect(statusValues(mission).turgor).toBe(25);
  });

  it('directs incomplete function evidence to nearby Inspect and Interact, not Overview', () => {
    const mission = completeMission();
    mission.completed = false;
    mission.droughtStarted = false;
    mission.droughtDiagnosed = false;
    mission.droughtObserved = false;
    mission.recoveryRestored = false;
    mission.vacuoleHydratedObserved = false;
    delete mission.functionEvidence.centralVacuole;
    const objective = objectiveFor(mission);
    expect(objective).toContain('Inspect');
    expect(objective).toContain('Interact');
    expect(objective).toContain('7/8');
    expect(objective).not.toContain('Overview');
  });
});
