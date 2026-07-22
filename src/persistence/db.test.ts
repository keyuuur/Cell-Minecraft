import { beforeEach, describe, expect, it } from 'vitest';
import { ASSIGNMENT, LEGACY_GAME_VERSION, LEGACY_SAVE_SCHEMA_VERSION } from '../data/assignment';
import { calculateScore } from '../biology/scoring';
import { createInitialMission } from '../biology/rules';
import {
  clearAllLocalDataForTests,
  clearCompletedSave,
  clearLocalData,
  loadProgress,
  migrateSave,
  prepareSubmission,
  queuedSubmissions,
  saveProgress,
} from './db';
import type { SaveEnvelope } from '../types/game';

const save: SaveEnvelope = {
  schemaVersion: LEGACY_SAVE_SCHEMA_VERSION,
  gameVersion: LEGACY_GAME_VERSION,
  assignmentId: ASSIGNMENT.id,
  assignmentVersion: ASSIGNMENT.version,
  sessionId: 'session-1',
  attemptId: 'attempt-1',
  student: { firstName: 'Test', lastInitial: 'S', period: 1 },
  controls: 'touch-only',
  qualityMode: 'low',
  accessibility: { largeText: true, highContrast: false, reducedMotion: true, muted: true },
  activeElapsedMs: 1200,
  mission: createInitialMission(),
  selectedItem: null,
  hintsUsed: {},
  score: calculateScore(createInitialMission()),
  gradedScore: null,
  gradedOutcome: null,
  submissionStatus: 'idle',
  outcome: 'active',
  savedAt: Date.now(),
};

describe('IndexedDB persistence', () => {
  beforeEach(() => clearAllLocalDataForTests());

  it('round-trips the active mission state', async () => {
    await saveProgress(save);
    expect(await loadProgress()).toMatchObject({ attemptId: 'attempt-1', controls: 'touch-only' });
  });

  it('rejects saves from a future schema', () => {
    expect(() => migrateSave({ ...save, schemaVersion: LEGACY_SAVE_SCHEMA_VERSION + 1 })).toThrow(
      /newer/,
    );
  });

  it('converts an interrupted sending state into a retryable queued state', () => {
    expect(migrateSave({ ...save, submissionStatus: 'sending' }).submissionStatus).toBe('queued');
  });

  it('never clears a newer attempt when an older receipt arrives late', async () => {
    await saveProgress({ ...save, attemptId: 'new-attempt' });
    await clearCompletedSave('old-attempt');
    expect(await loadProgress()).toMatchObject({ attemptId: 'new-attempt' });
  });

  it('rejects structurally corrupt stored mission values', async () => {
    await saveProgress({
      ...save,
      mission: { ...save.mission, wallPanels: 99 },
    });
    await expect(loadProgress()).rejects.toThrow(/validation/);
  });

  it('atomically preserves a completed save and its queued payload before delivery', async () => {
    const completed = {
      ...save,
      submissionStatus: 'sending' as const,
      outcome: 'early' as const,
    };
    const payload = {
      firstName: 'Test',
      lastInitial: 'S',
      period: 1,
      attemptId: save.attemptId,
      sessionId: save.sessionId,
      assignmentId: save.assignmentId,
      assignmentVersion: save.assignmentVersion,
      gameVersion: save.gameVersion,
      score: save.score,
      completed: false,
      early: true,
      timeout: false,
      activeTimeSeconds: 1,
      objectives: {},
      hintsUsed: {},
      isTest: true,
    };
    await prepareSubmission(completed, payload);
    await expect(loadProgress()).resolves.toMatchObject({ submissionStatus: 'queued' });
    await expect(queuedSubmissions()).resolves.toHaveLength(1);
  });

  it('ordinary identity clearing preserves unsent accountability data', async () => {
    const payload = {
      firstName: 'Test',
      lastInitial: 'S',
      period: 1,
      attemptId: save.attemptId,
      sessionId: save.sessionId,
      assignmentId: save.assignmentId,
      assignmentVersion: save.assignmentVersion,
      gameVersion: save.gameVersion,
      score: save.score,
      completed: false,
      early: true,
      timeout: false,
      activeTimeSeconds: 1,
      objectives: {},
      hintsUsed: {},
      isTest: true,
    };
    await prepareSubmission({ ...save, submissionStatus: 'queued' }, payload);
    await clearLocalData();
    await expect(loadProgress()).resolves.toBeNull();
    await expect(queuedSubmissions()).resolves.toHaveLength(1);
  });
});
