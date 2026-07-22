import { beforeEach, describe, expect, it } from 'vitest';
import { ASSIGNMENT, LEGACY_GAME_VERSION, LEGACY_SAVE_SCHEMA_VERSION } from '../data/assignment';
import { calculateScore } from '../biology/scoring';
import { createInitialMission } from '../biology/rules';
import {
  clearAllLocalDataForTests,
  clearCompletedSave,
  clearLocalData,
  exportDiagnostic,
  loadProgress,
  migrateSave,
  prepareSubmission,
  queuedSubmissions,
  recordReceipt,
  saveProgress,
} from './db';
import type { SaveEnvelope, SubmissionPayload } from '../types/game';
import { completeClientSubmissionV2 } from '../contracts/submissionV2.fixtures';
import { openCellGameDatabase } from './schema';

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

function legacyPayload(firstName = save.student.firstName): SubmissionPayload {
  return {
    firstName,
    lastInitial: save.student.lastInitial,
    period: save.student.period,
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
    objectives: {
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
    },
    hintsUsed: {},
    isTest: true,
  };
}

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
    const payload = legacyPayload();
    await prepareSubmission(completed, payload);
    await expect(loadProgress()).resolves.toMatchObject({ submissionStatus: 'queued' });
    await expect(queuedSubmissions()).resolves.toHaveLength(1);
  });

  it('ordinary identity clearing preserves unsent accountability data', async () => {
    const payload = legacyPayload();
    await prepareSubmission({ ...save, submissionStatus: 'queued' }, payload);
    await clearLocalData();
    await expect(loadProgress()).resolves.toBeNull();
    await expect(queuedSubmissions()).resolves.toHaveLength(1);
  });

  it('exports a redacted diagnostic when the shared queue mixes V1, V2, and corrupt records', async () => {
    await prepareSubmission({ ...save, submissionStatus: 'queued' }, legacyPayload('Private'));
    const db = await openCellGameDatabase();
    const currentPayload = completeClientSubmissionV2();
    await db.put(
      'submissionQueue',
      {
        contractVersion: 2,
        payload: currentPayload,
        queuedAt: 2,
        attempts: 0,
        nextAttemptAt: 2,
        lease: null,
      },
      `v2:${currentPayload.attemptId}`,
    );
    await db.put('submissionQueue', { contractVersion: 2 } as never, 'v2:corrupt');
    await db.put('submissionQueue', null as never, 'corrupt-null');

    await expect(queuedSubmissions()).rejects.toThrow(/CORRUPT_SUBMISSION_QUEUE/);
    const diagnostic = await exportDiagnostic();
    expect(diagnostic).toContain('legacy-v1');
    expect(diagnostic).toContain('current-v2-queue');
    expect(diagnostic).toContain('corrupt-v2-queue');
    expect(diagnostic).toContain('corrupt-or-unsupported-queue');
    expect(diagnostic).not.toContain('Private');
    expect(diagnostic).not.toContain(save.attemptId);
    expect(diagnostic).not.toContain(currentPayload.attemptId);
    expect(diagnostic).not.toContain('objectives');
  });

  it('fails closed on shallow legacy payloads and legacy values under the wrong raw key', async () => {
    const db = await openCellGameDatabase();
    await db.put(
      'submissionQueue',
      { payload: { attemptId: save.attemptId }, queuedAt: 1, attempts: 0 } as never,
      save.attemptId,
    );
    await expect(queuedSubmissions()).rejects.toThrow(/CORRUPT_SUBMISSION_QUEUE/);

    await db.clear('submissionQueue');
    await db.put(
      'submissionQueue',
      { payload: legacyPayload(), queuedAt: 1, attempts: 0 },
      'wrong-legacy-key',
    );
    await expect(queuedSubmissions()).rejects.toThrow(/CORRUPT_SUBMISSION_QUEUE/);
  });

  it('refuses to delete queued accountability data for a non-exact receipt', async () => {
    await prepareSubmission({ ...save, submissionStatus: 'queued' }, legacyPayload());
    await expect(
      recordReceipt({
        attemptId: save.attemptId,
        status: 'accepted',
        serverTimestamp: 'not-a-date',
      }),
    ).rejects.toThrow(/INVALID_RECEIPT/);
    await expect(queuedSubmissions()).resolves.toHaveLength(1);
    expect(await (await openCellGameDatabase()).count('receipts')).toBe(0);
  });
});
