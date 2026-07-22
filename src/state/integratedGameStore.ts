import { create } from 'zustand';
import {
  projectVoxelMissionSnapshot,
  scoreSubmissionObjectivesV2,
  submissionObjectivesFromMission,
  validateSaveEnvelopeV3,
} from '../contracts/missionContracts';
import { ASSIGNMENT, GAME_VERSION, SAVE_SCHEMA_VERSION } from '../data/assignment';
import type { SaveStatus } from '../persistence/v3';
import type {
  AccessibilitySettings,
  ClientSubmissionPayloadV2,
  ControlProfile,
  GradedSnapshotV1,
  QualityMode,
  SaveEnvelopeV3,
  ScoreBreakdown,
  StudentProfile,
  SubmissionStatus,
  VoxelMissionSnapshotV1,
} from '../types/game';
import { createInitialVoxelMissionSnapshot } from '../voxel/missionRuntime';
import { createMissionWorld } from '../voxel/missionWorld';

export type IntegratedAppScreen = 'identify' | 'tutorial' | 'mission' | 'results';
export type IntegratedOutcome = 'complete' | 'early' | 'timeout';

const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  largeText: false,
  highContrast: false,
  reducedMotion: false,
  muted: false,
};

const EMPTY_HINTS = { 1: 0, 2: 0, 3: 0 };

function freshId(): string {
  return crypto.randomUUID();
}

export interface IntegratedGameState {
  screen: IntegratedAppScreen;
  student: StudentProfile | null;
  sessionId: string;
  attemptId: string;
  controls: ControlProfile;
  qualityMode: QualityMode;
  accessibility: AccessibilitySettings;
  activeElapsedMs: number;
  voxelMission: VoxelMissionSnapshotV1;
  hintsUsed: Record<number, number>;
  gradedSnapshot: Readonly<GradedSnapshotV1> | null;
  submissionStatus: SubmissionStatus;
  outcome: SaveEnvelopeV3['outcome'];
  paused: boolean;
  lastSavedAt: number | null;
  saveStatus: SaveStatus | null;
  persistenceReady: boolean;
  persistenceError: string;
  finalizing: boolean;
  setPersistenceState: (ready: boolean, error?: string) => void;
  identifyStudent: (student: StudentProfile, sessionId?: string) => void;
  setControls: (controls: ControlProfile) => void;
  setQualityMode: (qualityMode: QualityMode) => void;
  updateAccessibility: (settings: Partial<AccessibilitySettings>) => void;
  enterAttempt: (save: SaveEnvelopeV3) => void;
  cacheSceneSnapshot: (snapshot: VoxelMissionSnapshotV1) => void;
  tickActiveTime: (deltaMs: number) => void;
  setPaused: (paused: boolean) => void;
  useHint: (level: 1 | 2 | 3) => void;
  setSaveStatus: (status: SaveStatus | null) => void;
  setFinalizing: (finalizing: boolean) => void;
  showQueuedResult: (save: SaveEnvelopeV3) => void;
  enterPractice: (save: SaveEnvelopeV3) => void;
  returnToResults: () => void;
  resetForNewStudent: () => void;
}

function initialState() {
  return {
    screen: 'identify' as const,
    student: null,
    sessionId: freshId(),
    attemptId: freshId(),
    controls: 'keyboard-touch' as const,
    qualityMode: 'auto' as const,
    accessibility: { ...DEFAULT_ACCESSIBILITY },
    activeElapsedMs: 0,
    voxelMission: createInitialVoxelMissionSnapshot(),
    hintsUsed: { ...EMPTY_HINTS },
    gradedSnapshot: null,
    submissionStatus: 'idle' as const,
    outcome: 'active' as const,
    paused: false,
    lastSavedAt: null,
    saveStatus: null,
    persistenceReady: false,
    persistenceError: '',
    finalizing: false,
  };
}

export function activeSaveFromIntegratedState(
  state: Pick<
    IntegratedGameState,
    | 'student'
    | 'sessionId'
    | 'attemptId'
    | 'controls'
    | 'qualityMode'
    | 'accessibility'
    | 'activeElapsedMs'
    | 'voxelMission'
    | 'hintsUsed'
    | 'gradedSnapshot'
    | 'submissionStatus'
    | 'outcome'
  >,
  savedAt = Date.now(),
): SaveEnvelopeV3 {
  if (!state.student) throw new Error('STUDENT_REQUIRED');
  const save: SaveEnvelopeV3 = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: GAME_VERSION,
    assignmentId: ASSIGNMENT.id,
    assignmentVersion: ASSIGNMENT.version,
    sessionId: state.sessionId,
    attemptId: state.attemptId,
    student: structuredClone(state.student),
    controls: state.controls,
    qualityMode: state.qualityMode,
    accessibility: structuredClone(state.accessibility),
    activeElapsedMs: state.activeElapsedMs,
    voxelMission: structuredClone(state.voxelMission),
    hintsUsed: { ...state.hintsUsed },
    gradedSnapshot: state.gradedSnapshot ? structuredClone(state.gradedSnapshot) : null,
    submissionStatus: state.submissionStatus,
    outcome: state.outcome,
    savedAt,
  };
  if (!validateSaveEnvelopeV3(save, createMissionWorld(save.voxelMission, true))) {
    throw new Error('INVALID_INTEGRATED_SAVE');
  }
  return save;
}

export function createFreshAttemptSave(
  state: Pick<
    IntegratedGameState,
    'student' | 'sessionId' | 'controls' | 'qualityMode' | 'accessibility'
  >,
  attemptId = freshId(),
  savedAt = Date.now(),
): SaveEnvelopeV3 {
  return activeSaveFromIntegratedState(
    {
      ...state,
      attemptId,
      activeElapsedMs: 0,
      voxelMission: createInitialVoxelMissionSnapshot(),
      hintsUsed: { ...EMPTY_HINTS },
      gradedSnapshot: null,
      submissionStatus: 'idle',
      outcome: 'active',
    },
    savedAt,
  );
}

function activeSeconds(activeElapsedMs: number, outcome: IntegratedOutcome): number {
  return outcome === 'timeout'
    ? ASSIGNMENT.durationSeconds
    : Math.min(ASSIGNMENT.durationSeconds, Math.floor(activeElapsedMs / 1000));
}

export function finalizeIntegratedAttempt(
  state: Pick<
    IntegratedGameState,
    | 'student'
    | 'sessionId'
    | 'attemptId'
    | 'controls'
    | 'qualityMode'
    | 'accessibility'
    | 'activeElapsedMs'
    | 'voxelMission'
    | 'hintsUsed'
  >,
  outcome: IntegratedOutcome,
  lockedAt = Date.now(),
): { save: SaveEnvelopeV3; payload: ClientSubmissionPayloadV2 } {
  if (!state.student) throw new Error('STUDENT_REQUIRED');
  if (outcome === 'complete' && !state.voxelMission.stageTimestamps.stable) {
    throw new Error('STABILITY_NOT_VERIFIED');
  }
  const activeElapsedMs =
    outcome === 'timeout' ? ASSIGNMENT.durationSeconds * 1000 : state.activeElapsedMs;
  const voxelMission: VoxelMissionSnapshotV1 = {
    ...structuredClone(state.voxelMission),
    revision: state.voxelMission.revision + 1,
    completion: {
      completionLocked: true,
      completed: outcome === 'complete',
      practice: false,
    },
    lastFeedback:
      outcome === 'complete'
        ? 'Stable cell verified. The graded result is locked.'
        : outcome === 'timeout'
          ? 'Active time ended. The current graded result is locked.'
          : 'Early result confirmed. The current graded result is locked.',
  };
  const world = createMissionWorld(voxelMission, true);
  const objectives = submissionObjectivesFromMission(
    projectVoxelMissionSnapshot(voxelMission, world),
  );
  const score = scoreSubmissionObjectivesV2(objectives, outcome === 'complete');
  const hintsUsed = { ...state.hintsUsed };
  const gradedSnapshot: GradedSnapshotV1 = {
    score,
    objectives,
    hintsUsed,
    outcome,
    missionRevision: voxelMission.revision,
    activeElapsedMs,
    lockedAt,
  };
  const save: SaveEnvelopeV3 = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: GAME_VERSION,
    assignmentId: ASSIGNMENT.id,
    assignmentVersion: ASSIGNMENT.version,
    sessionId: state.sessionId,
    attemptId: state.attemptId,
    student: structuredClone(state.student),
    controls: state.controls,
    qualityMode: state.qualityMode,
    accessibility: structuredClone(state.accessibility),
    activeElapsedMs,
    voxelMission,
    hintsUsed,
    gradedSnapshot,
    submissionStatus: 'idle',
    outcome,
    savedAt: lockedAt,
  };
  if (!validateSaveEnvelopeV3(save, world)) throw new Error('INVALID_FINAL_GRADE');
  const payload: ClientSubmissionPayloadV2 = {
    contractVersion: 2,
    firstName: state.student.firstName,
    lastInitial: state.student.lastInitial,
    period: state.student.period,
    attemptId: state.attemptId,
    sessionId: state.sessionId,
    assignmentId: ASSIGNMENT.id,
    assignmentVersion: ASSIGNMENT.version,
    gameVersion: GAME_VERSION,
    completed: outcome === 'complete',
    early: outcome === 'early',
    timeout: outcome === 'timeout',
    activeTimeSeconds: activeSeconds(activeElapsedMs, outcome),
    objectives,
    hintsUsed,
  };
  return { save, payload };
}

export function createPracticeSave(save: SaveEnvelopeV3, savedAt = Date.now()): SaveEnvelopeV3 {
  if (!save.gradedSnapshot) throw new Error('GRADED_RESULT_REQUIRED');
  const practice: SaveEnvelopeV3 = {
    ...structuredClone(save),
    voxelMission: {
      ...structuredClone(save.voxelMission),
      revision: save.voxelMission.revision + 1,
      completion: {
        completionLocked: false,
        completed: save.voxelMission.completion.completed,
        practice: true,
      },
      lastFeedback: 'Ungraded practice started. The recorded result remains locked.',
    },
    outcome: 'practice',
    savedAt,
  };
  if (!validateSaveEnvelopeV3(practice, createMissionWorld(practice.voxelMission, true))) {
    throw new Error('INVALID_PRACTICE_SAVE');
  }
  return practice;
}

export const useIntegratedGameStore = create<IntegratedGameState>((set) => ({
  ...initialState(),
  setPersistenceState: (persistenceReady, persistenceError = '') =>
    set({ persistenceReady, persistenceError }),
  identifyStudent: (student, sessionId) =>
    set((state) => ({
      student: structuredClone(student),
      sessionId: sessionId ?? state.sessionId,
      screen: 'tutorial',
    })),
  setControls: (controls) => set({ controls }),
  setQualityMode: (qualityMode) => set({ qualityMode }),
  updateAccessibility: (settings) =>
    set((state) => ({ accessibility: { ...state.accessibility, ...settings } })),
  enterAttempt: (save) =>
    set({
      screen: save.voxelMission.completion.completionLocked ? 'results' : 'mission',
      student: structuredClone(save.student),
      sessionId: save.sessionId,
      attemptId: save.attemptId,
      controls: save.controls,
      qualityMode: save.qualityMode,
      accessibility: structuredClone(save.accessibility),
      activeElapsedMs: save.activeElapsedMs,
      voxelMission: structuredClone(save.voxelMission),
      hintsUsed: { ...save.hintsUsed },
      gradedSnapshot: save.gradedSnapshot ? structuredClone(save.gradedSnapshot) : null,
      submissionStatus: save.submissionStatus === 'sending' ? 'queued' : save.submissionStatus,
      outcome: save.outcome,
      paused: false,
      lastSavedAt: save.savedAt,
      finalizing: false,
    }),
  cacheSceneSnapshot: (voxelMission) =>
    set((state) =>
      state.screen !== 'mission' || state.voxelMission.completion.completionLocked
        ? state
        : { voxelMission: structuredClone(voxelMission) },
    ),
  tickActiveTime: (deltaMs) =>
    set((state) => {
      if (
        state.screen !== 'mission' ||
        state.paused ||
        state.outcome === 'practice' ||
        state.finalizing
      ) {
        return state;
      }
      return {
        activeElapsedMs: Math.min(
          ASSIGNMENT.durationSeconds * 1000,
          state.activeElapsedMs + Math.max(0, deltaMs),
        ),
      };
    }),
  setPaused: (paused) => set({ paused }),
  useHint: (level) =>
    set((state) => ({
      hintsUsed: { ...state.hintsUsed, [level]: state.hintsUsed[level] + 1 },
    })),
  setSaveStatus: (saveStatus) =>
    set((state) => ({
      saveStatus,
      lastSavedAt: saveStatus?.state === 'saved' ? saveStatus.savedAt : state.lastSavedAt,
    })),
  setFinalizing: (finalizing) => set({ finalizing }),
  showQueuedResult: (save) =>
    set({
      screen: 'results',
      activeElapsedMs: save.activeElapsedMs,
      voxelMission: structuredClone(save.voxelMission),
      gradedSnapshot: save.gradedSnapshot ? structuredClone(save.gradedSnapshot) : null,
      submissionStatus: save.submissionStatus,
      outcome: save.outcome,
      paused: false,
      finalizing: false,
      lastSavedAt: save.savedAt,
    }),
  enterPractice: (save) =>
    set({
      screen: 'mission',
      voxelMission: structuredClone(save.voxelMission),
      outcome: 'practice',
      submissionStatus: save.submissionStatus,
      paused: false,
      finalizing: false,
      lastSavedAt: save.savedAt,
    }),
  returnToResults: () => set({ screen: 'results', paused: false }),
  resetForNewStudent: () => set({ ...initialState(), persistenceReady: true }),
}));

export function scoreIntegratedSnapshot(
  voxelMission: VoxelMissionSnapshotV1,
  gradedSnapshot: Readonly<GradedSnapshotV1> | null,
  screen: IntegratedAppScreen,
): ScoreBreakdown {
  if (gradedSnapshot && screen === 'results') return structuredClone(gradedSnapshot.score);
  const world = createMissionWorld(voxelMission, true);
  const objectives = submissionObjectivesFromMission(
    projectVoxelMissionSnapshot(voxelMission, world),
  );
  return scoreSubmissionObjectivesV2(
    objectives,
    voxelMission.completion.completed && voxelMission.completion.completionLocked,
  );
}

export function currentIntegratedScore(state: IntegratedGameState): ScoreBreakdown {
  return scoreIntegratedSnapshot(state.voxelMission, state.gradedSnapshot, state.screen);
}
