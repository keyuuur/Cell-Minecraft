import { beforeEach, describe, expect, it } from 'vitest';
import { createCompletedVoxelMissionFixture } from '../contracts/missionContracts.fixtures';
import { ASSIGNMENT } from '../data/assignment';
import {
  createFreshAttemptSave,
  createPracticeSave,
  finalizeIntegratedAttempt,
  useIntegratedGameStore,
} from './integratedGameStore';

const student = { firstName: 'Ari', lastInitial: 'P', period: 3 };

describe('integrated classroom session state', () => {
  beforeEach(() => {
    useIntegratedGameStore.getState().resetForNewStudent();
    useIntegratedGameStore.getState().identifyStudent(student);
  });

  it('creates a valid fresh V3 attempt without a second gameplay model', () => {
    const save = createFreshAttemptSave(
      useIntegratedGameStore.getState(),
      'attempt-fresh',
      1_900_000_000_000,
    );
    expect(save).toMatchObject({
      schemaVersion: 3,
      gameVersion: '0.2.0',
      attemptId: 'attempt-fresh',
      activeElapsedMs: 0,
      submissionStatus: 'idle',
      outcome: 'active',
    });
    expect(save.voxelMission.revision).toBe(0);
  });

  it('freezes one stable 100 percent grade and emits browser-owned V2 fields only', () => {
    const stable = createCompletedVoxelMissionFixture();
    stable.completion = { completionLocked: false, completed: false, practice: false };
    const state = {
      ...useIntegratedGameStore.getState(),
      student,
      sessionId: 'session-final',
      attemptId: 'attempt-final',
      activeElapsedMs: 321_456,
      voxelMission: stable,
      hintsUsed: { 1: 1, 2: 0, 3: 0 },
    };
    const { save, payload } = finalizeIntegratedAttempt(state, 'complete', 1_900_000_001_000);
    expect(save.gradedSnapshot?.score.total).toBe(100);
    expect(save.voxelMission.completion).toEqual({
      completionLocked: true,
      completed: true,
      practice: false,
    });
    expect(payload).toMatchObject({
      completed: true,
      early: false,
      timeout: false,
      activeTimeSeconds: 321,
    });
    expect(payload).not.toHaveProperty('score');
    expect(payload).not.toHaveProperty('isTest');
  });

  it('refuses a complete result until final stability has visible evidence', () => {
    const unstable = createCompletedVoxelMissionFixture();
    unstable.completion = { completionLocked: false, completed: false, practice: false };
    unstable.stageTimestamps = {};
    expect(() =>
      finalizeIntegratedAttempt(
        {
          ...useIntegratedGameStore.getState(),
          student,
          voxelMission: unstable,
        },
        'complete',
        1_900_000_001_500,
      ),
    ).toThrow(/STABILITY_NOT_VERIFIED/);
  });

  it('locks timeout at exactly 15 active minutes and keeps later practice ungraded', () => {
    const current = useIntegratedGameStore.getState();
    const { save, payload } = finalizeIntegratedAttempt(
      {
        ...current,
        activeElapsedMs: ASSIGNMENT.durationSeconds * 1000 - 1,
      },
      'timeout',
      1_900_000_002_000,
    );
    expect(save.activeElapsedMs).toBe(ASSIGNMENT.durationSeconds * 1000);
    expect(payload.activeTimeSeconds).toBe(ASSIGNMENT.durationSeconds);
    const queued = { ...save, submissionStatus: 'queued' as const, savedAt: save.savedAt + 1 };
    const practice = createPracticeSave(queued, queued.savedAt + 1);
    expect(practice.outcome).toBe('practice');
    expect(practice.voxelMission.completion.completionLocked).toBe(false);
    expect(practice.gradedSnapshot).toEqual(save.gradedSnapshot);
    expect(practice.activeElapsedMs).toBe(save.activeElapsedMs);
  });

  it('does not advance active time while paused, practicing, or finalizing', () => {
    const store = useIntegratedGameStore.getState();
    const save = createFreshAttemptSave(store, 'attempt-timer', 1_900_000_003_000);
    store.enterAttempt(save);
    useIntegratedGameStore.getState().tickActiveTime(1_000);
    expect(useIntegratedGameStore.getState().activeElapsedMs).toBe(1_000);
    useIntegratedGameStore.getState().setPaused(true);
    useIntegratedGameStore.getState().tickActiveTime(1_000);
    expect(useIntegratedGameStore.getState().activeElapsedMs).toBe(1_000);
    useIntegratedGameStore.getState().setPaused(false);
    useIntegratedGameStore.getState().setFinalizing(true);
    useIntegratedGameStore.getState().tickActiveTime(1_000);
    expect(useIntegratedGameStore.getState().activeElapsedMs).toBe(1_000);
  });
});
