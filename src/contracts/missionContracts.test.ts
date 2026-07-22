import { describe, expect, it } from 'vitest';
import { serverScore, serverScoreV2 } from '../../api/validation';
import { createInitialMission } from '../biology/rules';
import { calculateScore } from '../biology/scoring';
import {
  ASSIGNMENT,
  GAME_VERSION,
  LEGACY_GAME_VERSION,
  LEGACY_SAVE_SCHEMA_VERSION,
  REQUIRED_STRUCTURES,
  SAVE_SCHEMA_VERSION,
  SUBMISSION_CONTRACT_VERSION,
} from '../data/assignment';
import type {
  ClientSubmissionPayloadV2,
  ForwardedSubmissionPayloadV2,
  LegacySaveEnvelopeV2,
  MissionState,
  PlaceableStructureId,
  SaveEnvelopeV3,
  SubmissionObjectivesV2,
} from '../types/game';
import {
  collectStructureModule,
  createStructureMissionVoxelState,
  placeStructureMissionModule,
  recordStructureMissionFunction,
  structureMissionCheckpoint,
  VOXEL_STRUCTURE_ORDER,
  type StructureMissionVoxelStateV2,
} from '../voxel/structureMissionAdapter';
import {
  computeForwardedSubmissionDigestV2,
  classifyPersistedSave,
  CORRUPT_V2_SAVE_POLICY,
  LEGACY_V2_SAVE_POLICY,
  parseVoxelMissionSnapshot,
  projectVoxelMissionSnapshot,
  scoreSubmissionObjectivesV2,
  scoreVoxelMissionSnapshot,
  submissionObjectivesFromMission,
  validateClientSubmissionPayloadV2,
  validateForwardedSubmissionPayloadV2,
  validateMissionCommand,
  validateMissionTarget,
  validateMissionViewModel,
  validateSaveEnvelopeV3,
  validateVoxelMissionSnapshot,
} from './missionContracts';
import {
  createCompletedVoxelMissionFixture,
  createPhase4VoxelMissionFixture,
  createSaveEnvelopeV3Fixture,
  createVoxelContractWorld,
  PHASE4_STRUCTURE_POSITIONS,
} from './missionContracts.fixtures';
import {
  CENTRAL_VACUOLE_ANCHOR,
  MISSION_PREFAB_REGISTRY,
  canCompletePrefabPlacements,
  prefabCollisionCells,
  validatePrefabPlacements,
  validatePrefabPlayerSafety,
} from './prefabRegistry';

function completeStructureAdapter(): StructureMissionVoxelStateV2 {
  let state = createStructureMissionVoxelState();
  for (const id of VOXEL_STRUCTURE_ORDER) {
    state = collectStructureModule(state, id)!;
    state = placeStructureMissionModule(state, id, PHASE4_STRUCTURE_POSITIONS[id])!;
    state = recordStructureMissionFunction(state, id)!;
  }
  return state;
}

function clientPayload(): ClientSubmissionPayloadV2 {
  const world = createVoxelContractWorld();
  const mission = projectVoxelMissionSnapshot(createPhase4VoxelMissionFixture(world), world);
  return {
    contractVersion: SUBMISSION_CONTRACT_VERSION,
    firstName: 'Test',
    lastInitial: 'S',
    period: 1,
    attemptId: 'attempt-contract',
    sessionId: 'session-contract',
    assignmentId: ASSIGNMENT.id,
    assignmentVersion: ASSIGNMENT.version,
    gameVersion: GAME_VERSION,
    completed: false,
    early: true,
    timeout: false,
    activeTimeSeconds: 120,
    objectives: submissionObjectivesFromMission(mission),
    hintsUsed: { 1: 0, 2: 0, 3: 0 },
  };
}

function legacySaveFixture(): LegacySaveEnvelopeV2 {
  const mission = createInitialMission();
  return {
    schemaVersion: 2,
    gameVersion: '0.1.0',
    assignmentId: ASSIGNMENT.id,
    assignmentVersion: ASSIGNMENT.version,
    sessionId: 'legacy-session',
    attemptId: 'legacy-attempt',
    student: { firstName: 'Test', lastInitial: 'S', period: 1 },
    controls: 'touch-only',
    qualityMode: 'low',
    accessibility: {
      largeText: false,
      highContrast: false,
      reducedMotion: false,
      muted: true,
    },
    activeElapsedMs: 1200,
    mission,
    selectedItem: null,
    hintsUsed: {},
    score: calculateScore(mission),
    gradedScore: null,
    gradedOutcome: null,
    submissionStatus: 'idle',
    outcome: 'active',
    savedAt: 1_700_000_000_000,
  };
}

function completedSaveFixture(): SaveEnvelopeV3 {
  const world = createVoxelContractWorld();
  const base = createSaveEnvelopeV3Fixture(world);
  const voxelMission = createCompletedVoxelMissionFixture(world);
  const objectives = submissionObjectivesFromMission(
    projectVoxelMissionSnapshot(voxelMission, world),
  );
  const score = scoreSubmissionObjectivesV2(objectives, true);
  return {
    ...base,
    activeElapsedMs: 200_000,
    voxelMission,
    gradedSnapshot: {
      score,
      objectives,
      hintsUsed: { ...base.hintsUsed },
      outcome: 'complete',
      missionRevision: voxelMission.revision,
      activeElapsedMs: 200_000,
      lockedAt: base.savedAt - 1,
    },
    submissionStatus: 'accepted',
    outcome: 'complete',
  };
}

function missionFromObjectives(
  objectives: SubmissionObjectivesV2,
  completed: boolean,
): MissionState {
  const mission = createInitialMission();
  mission.wallPanels = objectives.wallPanels;
  mission.membranePanels = objectives.membranePanels;
  mission.cytoplasmEstablished = objectives.cytoplasm;
  for (const id of VOXEL_STRUCTURE_ORDER) {
    if (objectives[id]) {
      mission.placements[id] = { id, position: { x: 0, y: 1, z: 0 }, placedAt: 1 };
    }
  }
  Object.assign(mission.functionEvidence, {
    cellWall: objectives.effectCellWall,
    cellMembrane: objectives.effectCellMembrane,
    cytoplasm: objectives.effectCytoplasm,
    nucleus: objectives.effectNucleus,
    ribosomes: objectives.effectRibosomes,
    mitochondria: objectives.effectMitochondria,
    chloroplasts: objectives.effectChloroplasts,
    centralVacuole: objectives.effectCentralVacuole,
  });
  mission.droughtDiagnosed = objectives.droughtDiagnosed;
  mission.droughtObserved = objectives.droughtObserved;
  mission.recoveryRestored = objectives.recoveryRestored;
  mission.completed = completed;
  return mission;
}

const EMPTY_OBJECTIVES: SubmissionObjectivesV2 = {
  wallPanels: 0,
  membranePanels: 0,
  cytoplasm: false,
  nucleus: false,
  ribosomes: false,
  mitochondria: false,
  chloroplasts: false,
  centralVacuole: false,
  droughtDiagnosed: false,
  droughtObserved: false,
  recoveryRestored: false,
  effectCellWall: false,
  effectCellMembrane: false,
  effectCytoplasm: false,
  effectNucleus: false,
  effectRibosomes: false,
  effectMitochondria: false,
  effectChloroplasts: false,
  effectCentralVacuole: false,
};

describe('integrated voxel mission contracts', () => {
  it('freezes the approved structure and version boundaries', () => {
    expect(REQUIRED_STRUCTURES).toEqual([
      'cellWall',
      'cellMembrane',
      'cytoplasm',
      'nucleus',
      'ribosomes',
      'mitochondria',
      'chloroplasts',
      'centralVacuole',
    ]);
    expect({ GAME_VERSION, SAVE_SCHEMA_VERSION, SUBMISSION_CONTRACT_VERSION }).toEqual({
      GAME_VERSION: '0.2.0',
      SAVE_SCHEMA_VERSION: 3,
      SUBMISSION_CONTRACT_VERSION: 2,
    });
    expect({ LEGACY_GAME_VERSION, LEGACY_SAVE_SCHEMA_VERSION }).toEqual({
      LEGACY_GAME_VERSION: '0.1.0',
      LEGACY_SAVE_SCHEMA_VERSION: 2,
    });
  });

  it('round-trips the sole V1 aggregate and preserves three-way Phase 4 scoring parity', () => {
    const world = createVoxelContractWorld();
    const snapshot = createPhase4VoxelMissionFixture(world);
    expect(validateVoxelMissionSnapshot(snapshot, world)).toBe(true);
    expect(parseVoxelMissionSnapshot(JSON.parse(JSON.stringify(snapshot)), world)).toEqual(
      snapshot,
    );
    expect('runtime' in snapshot).toBe(false);

    const projected = projectVoxelMissionSnapshot(snapshot, world);
    const adapterScore = structureMissionCheckpoint(completeStructureAdapter()).score;
    const projectedScore = scoreVoxelMissionSnapshot(snapshot, world);
    const objectives = submissionObjectivesFromMission(projected);
    const contractScore = scoreSubmissionObjectivesV2(objectives, false);
    const legacyServerScore = serverScore(
      objectives as unknown as Record<string, boolean | number>,
      false,
    );
    expect(projectedScore).toEqual(adapterScore);
    expect(contractScore).toEqual(adapterScore);
    expect(legacyServerScore).toEqual(adapterScore);
    expect(projectedScore.total).toBe(80);
  });

  it('uses one canonical V2 rubric across empty, partial-boundary, and internal states', () => {
    const fixtures: Array<{ objectives: SubmissionObjectivesV2; completed: boolean }> = [
      { objectives: EMPTY_OBJECTIVES, completed: false },
      { objectives: { ...EMPTY_OBJECTIVES, wallPanels: 6 }, completed: false },
      {
        objectives: { ...EMPTY_OBJECTIVES, wallPanels: 6, membranePanels: 6 },
        completed: false,
      },
      {
        objectives: {
          ...EMPTY_OBJECTIVES,
          wallPanels: 6,
          membranePanels: 6,
          cytoplasm: true,
          nucleus: true,
          effectCellWall: true,
          effectCellMembrane: true,
          effectCytoplasm: true,
          effectNucleus: true,
        },
        completed: false,
      },
    ];
    for (const fixture of fixtures) {
      const missionScore = calculateScore(
        missionFromObjectives(fixture.objectives, fixture.completed),
      );
      expect(scoreSubmissionObjectivesV2(fixture.objectives, fixture.completed)).toEqual(
        missionScore,
      );
      expect(serverScoreV2(fixture.objectives, fixture.completed)).toEqual(missionScore);
    }
    expect(serverScoreV2({ ...EMPTY_OBJECTIVES, wallPanels: 6 }, false).placementContext).toBe(0);
  });

  it('freezes an integer, interior, non-overlapping prefab coordinate space with clearance', () => {
    expect(validatePrefabPlacements(PHASE4_STRUCTURE_POSITIONS)).toEqual({ valid: true });
    expect(MISSION_PREFAB_REGISTRY.nucleus.heightCells).toBe(3);
    expect(MISSION_PREFAB_REGISTRY.centralVacuole.heightCells).toBe(4);
    expect(
      prefabCollisionCells('centralVacuole', CENTRAL_VACUOLE_ANCHOR).every(
        (cell) => cell.y >= 1 && cell.y <= 4,
      ),
    ).toBe(true);
    expect(
      validatePrefabPlacements({
        ...PHASE4_STRUCTURE_POSITIONS,
        nucleus: { x: -2.5, y: 1, z: -5 },
      }),
    ).toMatchObject({ valid: false, reason: 'invalid-anchor' });
    expect(
      validatePrefabPlacements({
        ...PHASE4_STRUCTURE_POSITIONS,
        nucleus: { x: -6, y: 1, z: 2 },
      }),
    ).toMatchObject({ valid: false, reason: 'invalid-anchor' });
    expect(
      validatePrefabPlacements({
        ...PHASE4_STRUCTURE_POSITIONS,
        ribosomes: { ...PHASE4_STRUCTURE_POSITIONS.nucleus },
      }),
    ).toMatchObject({ valid: false, reason: 'overlap' });
    expect(
      validatePrefabPlacements({
        nucleus: { x: -3, y: 1, z: -5 },
        ribosomes: { x: -3, y: 1, z: -3 },
        mitochondria: { x: -3, y: 1, z: -1 },
        chloroplasts: { x: -1, y: 1, z: -1 },
        centralVacuole: { ...CENTRAL_VACUOLE_ANCHOR },
      }),
    ).toMatchObject({ valid: false, reason: 'no-interaction-clearance' });
    expect(PHASE4_STRUCTURE_POSITIONS.centralVacuole).toEqual(CENTRAL_VACUOLE_ANCHOR);
  });

  it('rejects globally unreachable inspection space and continuous player overlap', () => {
    const sealedLayout = {
      nucleus: { x: -3, y: 1, z: -5 },
      ribosomes: { x: 2, y: 1, z: -5 },
      mitochondria: { x: -3, y: 1, z: -2 },
      chloroplasts: { x: 2, y: 1, z: -2 },
      centralVacuole: { ...CENTRAL_VACUOLE_ANCHOR },
    } as const;
    expect(validatePrefabPlacements(sealedLayout)).toMatchObject({
      valid: false,
      reason: 'unreachable-interaction',
    });
    expect(
      validatePrefabPlayerSafety(PHASE4_STRUCTURE_POSITIONS, {
        x: PHASE4_STRUCTURE_POSITIONS.nucleus.x - 0.6,
        y: 0.5,
        z: PHASE4_STRUCTURE_POSITIONS.nucleus.z,
      }),
    ).toMatchObject({ valid: false, reason: 'player-overlap' });
    expect(validatePrefabPlayerSafety(PHASE4_STRUCTURE_POSITIONS, { x: 3, y: 0.5, z: 0 })).toEqual({
      valid: true,
    });
    const pocketLayout = {
      nucleus: { x: -3, y: 1, z: -5 },
      ribosomes: { x: -3, y: 1, z: -2 },
      mitochondria: { x: -1, y: 1, z: -1 },
      chloroplasts: { x: 1, y: 1, z: -1 },
      centralVacuole: { ...CENTRAL_VACUOLE_ANCHOR },
    } as const;
    expect(validatePrefabPlacements(pocketLayout)).toEqual({ valid: true });
    expect(validatePrefabPlayerSafety(pocketLayout, { x: -3, y: 0.5, z: -3 })).toEqual({
      valid: false,
      reason: 'player-trapped',
    });
  });

  it('rejects a restored snapshot whose player already overlaps an installed boundary panel', () => {
    const world = createVoxelContractWorld();
    const snapshot = createPhase4VoxelMissionFixture(world);
    snapshot.player = { ...snapshot.player, x: 4, y: 0.5, z: -2 };

    expect(validatePrefabPlayerSafety(snapshot.placements, snapshot.player)).toEqual({
      valid: true,
    });
    expect(validateVoxelMissionSnapshot(snapshot, world)).toBe(false);
  });

  it('rejects locally valid partial layouts that cannot reach a complete arrangement', () => {
    const deadPartial = {
      nucleus: { x: -3, y: 1, z: -4 },
      ribosomes: { x: -3, y: 1, z: -1 },
    } as const;
    expect(canCompletePrefabPlacements(deadPartial)).toBe(false);
    expect(validatePrefabPlacements(deadPartial)).toEqual({
      valid: false,
      reason: 'no-completable-layout',
    });
    expect(canCompletePrefabPlacements({ nucleus: PHASE4_STRUCTURE_POSITIONS.nucleus })).toBe(true);
  });

  it('rejects unknown structures, evidence without placement, overlap, and false completion', () => {
    const world = createVoxelContractWorld();
    const valid = createPhase4VoxelMissionFixture(world);
    expect(
      validateVoxelMissionSnapshot(
        {
          ...valid,
          depotInventory: { ...valid.depotInventory, endoplasmicReticulum: 1 },
        },
        world,
      ),
    ).toBe(false);
    expect(
      validateVoxelMissionSnapshot(
        {
          ...valid,
          player: { ...valid.player, hiddenAuthority: true },
        },
        world,
      ),
    ).toBe(false);
    expect(
      validateVoxelMissionSnapshot(
        {
          ...valid,
          placements: { ...valid.placements, nucleus: undefined },
        },
        world,
      ),
    ).toBe(false);
    expect(
      validateVoxelMissionSnapshot(
        {
          ...valid,
          placements: {
            ...valid.placements,
            ribosomes: { ...PHASE4_STRUCTURE_POSITIONS.nucleus },
          },
        },
        world,
      ),
    ).toBe(false);
    expect(
      validateVoxelMissionSnapshot(
        {
          ...valid,
          completion: { completionLocked: true, completed: true, practice: false },
        },
        world,
      ),
    ).toBe(false);
  });

  it('conserves every module and binds correction recovery to the removed item', () => {
    const world = createVoxelContractWorld();
    const valid = createPhase4VoxelMissionFixture(world);
    expect(
      validateVoxelMissionSnapshot(
        {
          ...valid,
          moduleInventory: { ...valid.moduleInventory, nucleus: 1 },
        },
        world,
      ),
    ).toBe(false);

    const placementsWithoutNucleus = { ...valid.placements };
    const evidenceWithoutNucleus = { ...valid.functionEvidence };
    delete placementsWithoutNucleus.nucleus;
    delete evidenceWithoutNucleus.nucleus;
    const removedNucleus = {
      ...valid,
      revision: valid.revision + 1,
      placements: placementsWithoutNucleus,
      functionEvidence: evidenceWithoutNucleus,
      moduleInventory: { ...valid.moduleInventory, nucleus: 1 },
      correction: {
        removedTarget: { kind: 'structure' as const, structureId: 'nucleus' as const },
        recovery: { kind: 'inventory' as const },
      },
    };
    expect(validateVoxelMissionSnapshot(removedNucleus, world)).toBe(true);
    expect(
      validateVoxelMissionSnapshot(
        {
          ...removedNucleus,
          moduleInventory: { ...removedNucleus.moduleInventory, nucleus: 0, ribosomes: 1 },
        },
        world,
      ),
    ).toBe(false);
    expect(
      validateVoxelMissionSnapshot(
        {
          ...removedNucleus,
          moduleInventory: { ...removedNucleus.moduleInventory, nucleus: 0 },
          activeModulePickups: [
            { item: 'nucleus', count: 1, position: { x: 0, y: 1, z: 7 }, spawnSequence: 1 },
          ],
          correction: {
            ...removedNucleus.correction,
            recovery: { kind: 'pickup' as const, spawnSequence: 999 },
          },
        },
        world,
      ),
    ).toBe(false);
  });

  it('uses scene-resolved intent commands with revision freshness and bounded ray targets', () => {
    const target = {
      kind: 'structure' as const,
      snapshotRevision: 24,
      structureId: 'mitochondria' as PlaceableStructureId,
      distance: 2.5,
    };
    expect(validateMissionTarget(target)).toBe(true);
    expect(validateMissionTarget({ ...target, distance: 99 })).toBe(false);
    expect(validateMissionCommand({ type: 'inspect', snapshotRevision: 24 }, 24)).toBe(true);
    expect(validateMissionCommand({ type: 'inspect', snapshotRevision: 23 }, 24)).toBe(false);
    expect(validateMissionCommand({ type: 'inspect', snapshotRevision: 24, target }, 24)).toBe(
      false,
    );
    expect(
      validateMissionViewModel({
        objective: 'Inspect the mitochondria.',
        highlightedTarget: target,
        primaryVerb: 'inspect',
        primaryActionLabel: 'Inspect',
        primaryActionAccessibleLabel: 'Inspect mitochondria',
        primaryActionEnabled: true,
        hintContext: { stage: 'energy-and-photosynthesis', currentLevel: 0, maxLevel: 3 },
        feedback: null,
      }),
    ).toBe(true);
    expect(
      validateMissionViewModel({
        objective: 'Inspect the mitochondria.',
        highlightedTarget: target,
        primaryVerb: 'inspect',
        primaryActionLabel: 'Inspect',
        primaryActionAccessibleLabel: 'Inspect mitochondria',
        primaryActionEnabled: true,
        hintContext: {
          stage: 'energy-and-photosynthesis',
          currentLevel: 0,
          maxLevel: 3,
          hidden: true,
        },
        feedback: null,
      }),
    ).toBe(false);
  });

  it('binds V3 immutable grades to outcome, score, objectives, revision, and active time', () => {
    const world = createVoxelContractWorld();
    const active = createSaveEnvelopeV3Fixture(world);
    const completed = completedSaveFixture();
    expect(validateSaveEnvelopeV3(active, world)).toBe(true);
    expect(validateSaveEnvelopeV3(completed, world)).toBe(true);
    expect(
      validateSaveEnvelopeV3(
        {
          ...active,
          outcome: 'practice',
          voxelMission: {
            ...active.voxelMission,
            completion: { ...active.voxelMission.completion, practice: true },
          },
        },
        world,
      ),
    ).toBe(true);
    expect(validateSaveEnvelopeV3({ ...completed, gradedSnapshot: null }, world)).toBe(false);
    expect(
      validateSaveEnvelopeV3(
        {
          ...completed,
          gradedSnapshot: { ...completed.gradedSnapshot!, activeElapsedMs: 199_999 },
        },
        world,
      ),
    ).toBe(false);
    expect(
      validateSaveEnvelopeV3(
        {
          ...completed,
          gradedSnapshot: {
            ...completed.gradedSnapshot!,
            score: { ...completed.gradedSnapshot!.score, total: 99 },
          },
        },
        world,
      ),
    ).toBe(false);
    expect(
      validateSaveEnvelopeV3(
        {
          ...completed,
          outcome: 'early',
        },
        world,
      ),
    ).toBe(false);

    const practicePlacements = { ...completed.voxelMission.placements };
    const practiceEvidence = { ...completed.voxelMission.functionEvidence };
    delete practicePlacements.nucleus;
    delete practiceEvidence.nucleus;
    const continuingPractice: SaveEnvelopeV3 = {
      ...completed,
      outcome: 'practice',
      hintsUsed: { ...completed.hintsUsed, 1: completed.hintsUsed[1] + 1 },
      voxelMission: {
        ...completed.voxelMission,
        revision: completed.voxelMission.revision + 1,
        placements: practicePlacements,
        functionEvidence: practiceEvidence,
        moduleInventory: { ...completed.voxelMission.moduleInventory, nucleus: 1 },
        correction: {
          removedTarget: { kind: 'structure', structureId: 'nucleus' },
          recovery: { kind: 'inventory' },
        },
        completion: { completionLocked: false, completed: false, practice: true },
      },
    };
    expect(validateSaveEnvelopeV3(continuingPractice, world)).toBe(true);
    expect(
      validateSaveEnvelopeV3(
        {
          ...continuingPractice,
          gradedSnapshot: {
            ...continuingPractice.gradedSnapshot!,
            missionRevision: continuingPractice.voxelMission.revision + 1,
          },
        },
        world,
      ),
    ).toBe(false);
  });

  it('rejects array, missing, and unknown accessibility or hint keys', () => {
    const world = createVoxelContractWorld();
    const save = createSaveEnvelopeV3Fixture(world);
    expect(validateSaveEnvelopeV3({ ...save, accessibility: [] }, world)).toBe(false);
    expect(
      validateSaveEnvelopeV3(
        { ...save, accessibility: { ...save.accessibility, flashingEffects: true } },
        world,
      ),
    ).toBe(false);
    expect(validateSaveEnvelopeV3({ ...save, hintsUsed: {} }, world)).toBe(false);
    expect(validateSaveEnvelopeV3({ ...save, hintsUsed: [] }, world)).toBe(false);
    expect(validateSaveEnvelopeV3({ ...save, hintsUsed: { 1: 0, 2: 0, 3: 0, 4: 0 } }, world)).toBe(
      false,
    );
  });

  it('separates valid V2, corrupt V2, and unsupported persistence records', () => {
    const world = createVoxelContractWorld();
    const current = createSaveEnvelopeV3Fixture(world);
    const legacy = legacySaveFixture();
    expect(classifyPersistedSave(current, world)).toMatchObject({ kind: 'current-v3' });
    expect(classifyPersistedSave(legacy, world)).toMatchObject({
      kind: 'legacy-v2',
      action: LEGACY_V2_SAVE_POLICY,
    });
    expect(
      classifyPersistedSave(
        {
          ...legacy,
          outcome: 'practice',
          gradedScore: legacy.score,
          gradedOutcome: 'early',
          mission: { ...legacy.mission, practice: true },
        },
        world,
      ),
    ).toMatchObject({ kind: 'legacy-v2' });
    expect(classifyPersistedSave({ schemaVersion: 2, mission: {} }, world)).toEqual({
      kind: 'corrupt-v2',
      action: CORRUPT_V2_SAVE_POLICY,
    });
    expect(classifyPersistedSave({ ...legacy, hintsUsed: [] }, world)).toEqual({
      kind: 'corrupt-v2',
      action: CORRUPT_V2_SAVE_POLICY,
    });
    expect(
      classifyPersistedSave(
        { ...legacy, mission: { ...legacy.mission, hiddenStudentField: 'not allowed' } },
        world,
      ),
    ).toEqual({ kind: 'corrupt-v2', action: CORRUPT_V2_SAVE_POLICY });
    expect(
      classifyPersistedSave(
        {
          ...legacy,
          mission: {
            ...legacy.mission,
            collected: { ...legacy.mission.collected, nucleus: 'yes' },
          },
        },
        world,
      ),
    ).toEqual({ kind: 'corrupt-v2', action: CORRUPT_V2_SAVE_POLICY });
    expect(
      classifyPersistedSave(
        {
          ...legacy,
          mission: {
            ...legacy.mission,
            stageTimestamps: { boundary: 'bad' },
          },
        },
        world,
      ),
    ).toEqual({ kind: 'corrupt-v2', action: CORRUPT_V2_SAVE_POLICY });
    expect(classifyPersistedSave({ ...legacy, gradedOutcome: 'garbage' }, world)).toEqual({
      kind: 'corrupt-v2',
      action: CORRUPT_V2_SAVE_POLICY,
    });
    expect(classifyPersistedSave({ schemaVersion: 4 }, world)).toEqual({ kind: 'unsupported' });
  });

  it('keeps server fields out of clients and verifies forwarded score and canonical digest', async () => {
    const client = clientPayload();
    expect(validateClientSubmissionPayloadV2(client)).toBe(true);
    expect(validateClientSubmissionPayloadV2({ ...client, score: { total: 100 } })).toBe(false);
    expect(validateClientSubmissionPayloadV2({ ...client, isTest: true })).toBe(false);
    expect(validateClientSubmissionPayloadV2({ ...client, sourceEnvironment: 'preview' })).toBe(
      false,
    );
    expect(validateClientSubmissionPayloadV2({ ...client, hintsUsed: {} })).toBe(false);
    expect(validateClientSubmissionPayloadV2({ ...client, canonicalDigest: 'a'.repeat(64) })).toBe(
      false,
    );
    expect(
      validateClientSubmissionPayloadV2({
        ...client,
        completed: true,
        early: false,
      }),
    ).toBe(false);
    expect(
      validateClientSubmissionPayloadV2({
        ...client,
        activeTimeSeconds: ASSIGNMENT.durationSeconds,
      }),
    ).toBe(false);

    const score = scoreSubmissionObjectivesV2(client.objectives, client.completed);
    const content = {
      ...client,
      score,
      isTest: true,
      sourceEnvironment: 'preview' as const,
    };
    const forwarded: ForwardedSubmissionPayloadV2 = {
      ...content,
      canonicalDigest: await computeForwardedSubmissionDigestV2(content),
    };
    expect(await validateForwardedSubmissionPayloadV2(forwarded)).toBe(true);
    expect(
      await validateForwardedSubmissionPayloadV2({
        ...forwarded,
        score: { ...forwarded.score, total: forwarded.score.total + 1 },
      }),
    ).toBe(false);
    expect(
      await validateForwardedSubmissionPayloadV2({
        ...forwarded,
        sourceEnvironment: 'production',
        isTest: true,
      }),
    ).toBe(false);
    expect(await validateForwardedSubmissionPayloadV2({ ...forwarded, extra: true })).toBe(false);
  });
});
