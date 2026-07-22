import { deleteDB, openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateScore } from '../biology/scoring';
import { createInitialMission } from '../biology/rules';
import {
  projectVoxelMissionSnapshot,
  scoreSubmissionObjectivesV2,
  submissionObjectivesFromMission,
} from '../contracts/missionContracts';
import {
  createCompletedVoxelMissionFixture,
  createSaveEnvelopeV3Fixture,
  createVoxelContractWorld,
} from '../contracts/missionContracts.fixtures';
import { ASSIGNMENT, LEGACY_GAME_VERSION, LEGACY_SAVE_SCHEMA_VERSION } from '../data/assignment';
import type {
  ClientSubmissionPayloadV2,
  LegacySaveEnvelopeV2,
  SaveEnvelopeV3,
  StudentProfile,
  SubmissionPayload,
  SubmissionReceipt,
} from '../types/game';
import { queueSubmission, recordReceipt } from './db';
import {
  ACTIVE_ATTEMPT_META_KEY,
  SaveCoordinator,
  SubmissionReplayCoordinator,
  SubmissionTransportError,
  TEACHER_RESET_CONFIRMATION,
  beginAttemptV3,
  claimNextSubmissionLease,
  classifyLegacyLocalSave,
  confirmNewStudentHandoff,
  exportV3Diagnostic,
  findResumeDecision,
  hideActiveAttemptForNewStudent,
  loadAttemptV3,
  localDataCounts,
  prepareSubmissionV2,
  probePersistenceHealth,
  queuedSubmissionsV2,
  releaseSubmissionLeaseAfterFailure,
  resumeAttemptV3,
  settleSubmissionLease,
  teacherDeviceResetAllLocalData,
} from './v3';
import { CELL_DATABASE_NAME, closeCellGameDatabase, openCellGameDatabase } from './schema';

const world = createVoxelContractWorld();

function activeSave(
  attemptId: string,
  sessionId = `session-${attemptId}`,
  student: StudentProfile = { firstName: 'Test', lastInitial: 'S', period: 1 },
): SaveEnvelopeV3 {
  const fixture = createSaveEnvelopeV3Fixture(world);
  return {
    ...fixture,
    attemptId,
    sessionId,
    student,
    savedAt: 1_800_000_000_000,
  };
}

function completedSave(base: SaveEnvelopeV3): SaveEnvelopeV3 {
  const voxelMission = createCompletedVoxelMissionFixture(world);
  const objectives = submissionObjectivesFromMission(
    projectVoxelMissionSnapshot(voxelMission, world),
  );
  const activeElapsedMs = 480_000;
  const hintsUsed = { 1: 0, 2: 1, 3: 0 };
  const lockedAt = base.savedAt + 1_000;
  return {
    ...base,
    activeElapsedMs,
    voxelMission,
    hintsUsed,
    gradedSnapshot: {
      score: scoreSubmissionObjectivesV2(objectives, true),
      objectives,
      hintsUsed,
      outcome: 'complete',
      missionRevision: voxelMission.revision,
      activeElapsedMs,
      lockedAt,
    },
    outcome: 'complete',
    submissionStatus: 'idle',
    savedAt: lockedAt + 1_000,
  };
}

function payloadFromCompleted(save: SaveEnvelopeV3): ClientSubmissionPayloadV2 {
  if (!save.gradedSnapshot) throw new Error('fixture requires a grade');
  return {
    contractVersion: 2,
    firstName: save.student.firstName,
    lastInitial: save.student.lastInitial,
    period: save.student.period,
    attemptId: save.attemptId,
    sessionId: save.sessionId,
    assignmentId: save.assignmentId,
    assignmentVersion: save.assignmentVersion,
    gameVersion: save.gameVersion,
    completed: true,
    early: false,
    timeout: false,
    activeTimeSeconds: Math.round(save.gradedSnapshot.activeElapsedMs / 1000),
    objectives: save.gradedSnapshot.objectives,
    hintsUsed: save.gradedSnapshot.hintsUsed,
  };
}

function legacySave(attemptId = 'legacy-attempt'): LegacySaveEnvelopeV2 {
  const mission = createInitialMission();
  return {
    schemaVersion: LEGACY_SAVE_SCHEMA_VERSION,
    gameVersion: LEGACY_GAME_VERSION,
    assignmentId: ASSIGNMENT.id,
    assignmentVersion: ASSIGNMENT.version,
    sessionId: 'legacy-session',
    attemptId,
    student: { firstName: 'Legacy', lastInitial: 'L', period: 2 },
    controls: 'touch-only',
    qualityMode: 'low',
    accessibility: { largeText: false, highContrast: false, reducedMotion: false, muted: true },
    activeElapsedMs: 1_000,
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

function legacyPayload(save: LegacySaveEnvelopeV2): SubmissionPayload {
  const objectives = {
    wallPanels: save.mission.wallPanels,
    membranePanels: save.mission.membranePanels,
    cytoplasm: save.mission.cytoplasmEstablished,
    nucleus: Boolean(save.mission.placements.nucleus),
    ribosomes: Boolean(save.mission.placements.ribosomes),
    mitochondria: Boolean(save.mission.placements.mitochondria),
    chloroplasts: Boolean(save.mission.placements.chloroplasts),
    centralVacuole: Boolean(save.mission.placements.centralVacuole),
    droughtDiagnosed: save.mission.droughtDiagnosed,
    droughtObserved: save.mission.droughtObserved,
    recoveryRestored: save.mission.recoveryRestored,
    effectCellWall: Boolean(save.mission.functionEvidence.cellWall),
    effectCellMembrane: Boolean(save.mission.functionEvidence.cellMembrane),
    effectCytoplasm: Boolean(save.mission.functionEvidence.cytoplasm),
    effectNucleus: Boolean(save.mission.functionEvidence.nucleus),
    effectRibosomes: Boolean(save.mission.functionEvidence.ribosomes),
    effectMitochondria: Boolean(save.mission.functionEvidence.mitochondria),
    effectChloroplasts: Boolean(save.mission.functionEvidence.chloroplasts),
    effectCentralVacuole: Boolean(save.mission.functionEvidence.centralVacuole),
  };
  return {
    firstName: save.student.firstName,
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
    objectives,
    hintsUsed: {},
    isTest: true,
  };
}

async function seedCompletedAttempt(attemptId = 'attempt-complete') {
  const initial = activeSave(attemptId);
  await beginAttemptV3(initial);
  const coordinator = await SaveCoordinator.create(attemptId);
  const complete = completedSave(initial);
  await coordinator.requestSave(complete);
  await coordinator.flush();
  return { initial, complete, coordinator };
}

describe('V3 per-attempt persistence', () => {
  beforeEach(async () => {
    closeCellGameDatabase();
    await deleteDB(CELL_DATABASE_NAME);
  });

  it('upgrades the legacy database without migrating or deleting V2/V1 records', async () => {
    const legacy = legacySave();
    const receipt: SubmissionReceipt = {
      attemptId: legacy.attemptId,
      status: 'accepted',
      serverTimestamp: '2026-07-21T00:00:00.000Z',
    };
    const v1 = await openDB(CELL_DATABASE_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('saves');
        db.createObjectStore('submissionQueue');
        db.createObjectStore('receipts');
      },
    });
    await v1.put('saves', legacy, `${ASSIGNMENT.id}:active`);
    await v1.put(
      'submissionQueue',
      { payload: legacyPayload(legacy), queuedAt: 1, attempts: 0 },
      legacy.attemptId,
    );
    await v1.put('receipts', receipt, legacy.attemptId);
    v1.close();

    const upgraded = await openCellGameDatabase();
    expect([...upgraded.objectStoreNames]).toEqual([
      'attempts',
      'meta',
      'receipts',
      'saves',
      'submissionQueue',
    ]);
    expect(await upgraded.get('saves', `${ASSIGNMENT.id}:active`)).toEqual(legacy);
    expect(await upgraded.count('attempts')).toBe(0);
    expect(await upgraded.count('submissionQueue')).toBe(1);
    expect(await upgraded.get('receipts', legacy.attemptId)).toEqual(receipt);
  });

  it('probes a committed write/read/delete before reporting storage ready', async () => {
    await expect(probePersistenceHealth()).resolves.toMatchObject({ state: 'ready' });
    expect(await (await openCellGameDatabase()).get('meta', 'healthProbe')).toBeUndefined();
  });

  it('round-trips independent attempts and returns defensive clones', async () => {
    await beginAttemptV3(activeSave('attempt-one'));
    await hideActiveAttemptForNewStudent('attempt-one');
    await beginAttemptV3(activeSave('attempt-two'));
    const one = await loadAttemptV3('attempt-one');
    const two = await loadAttemptV3('attempt-two');
    expect(one?.save.attemptId).toBe('attempt-one');
    expect(two?.save.attemptId).toBe('attempt-two');
    if (!one) throw new Error('missing fixture');
    one.save.student.firstName = 'Mutated';
    expect((await loadAttemptV3('attempt-one'))?.save.student.firstName).toBe('Test');
  });

  it('coalesces a burst and persists the latest timer/settings with a storage revision', async () => {
    const base = activeSave('attempt-burst');
    await beginAttemptV3(base);
    const statuses: string[] = [];
    const coordinator = await SaveCoordinator.create(base.attemptId, (status) =>
      statuses.push(status.state),
    );
    const requests = Array.from({ length: 50 }, (_, index) =>
      coordinator.requestSave({
        ...base,
        activeElapsedMs: base.activeElapsedMs + index + 1,
        accessibility: { ...base.accessibility, largeText: index === 49 },
        savedAt: base.savedAt + index + 1,
      }),
    );
    await Promise.all(requests);
    await coordinator.flush();
    const stored = await loadAttemptV3(base.attemptId);
    expect(stored?.storageRevision).toBe(2);
    expect(stored?.save.activeElapsedMs).toBe(base.activeElapsedMs + 50);
    expect(stored?.save.accessibility.largeText).toBe(true);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('rejects a regressive callback before it can replace newer pending progress', async () => {
    const base = activeSave('attempt-pending-high-water');
    await beginAttemptV3(base);
    const coordinator = await SaveCoordinator.create(base.attemptId);
    const newer = {
      ...base,
      activeElapsedMs: base.activeElapsedMs + 10_000,
      voxelMission: { ...base.voxelMission, revision: base.voxelMission.revision + 2 },
      savedAt: base.savedAt + 2,
    };
    const accepted = coordinator.requestSave(newer);
    await expect(
      coordinator.requestSave({
        ...base,
        activeElapsedMs: base.activeElapsedMs + 2_000,
        voxelMission: { ...base.voxelMission, revision: base.voxelMission.revision + 1 },
        savedAt: base.savedAt + 1,
      }),
    ).rejects.toThrow(/STALE_MISSION_REVISION|STALE_ATTEMPT_PROGRESS/);
    await accepted;
    expect((await loadAttemptV3(base.attemptId))?.save.activeElapsedMs).toBe(newer.activeElapsedMs);
  });

  it('keeps the requested high-water mark while a newer save is in flight', async () => {
    const base = activeSave('attempt-inflight-high-water');
    await beginAttemptV3(base);
    const coordinator = await SaveCoordinator.create(base.attemptId);
    const newer = {
      ...base,
      activeElapsedMs: base.activeElapsedMs + 5_000,
      savedAt: base.savedAt + 2,
    };
    const inFlight = coordinator.requestSave(newer);
    await Promise.resolve();
    await expect(
      coordinator.requestSave({
        ...base,
        activeElapsedMs: base.activeElapsedMs + 1_000,
        savedAt: base.savedAt + 1,
      }),
    ).rejects.toThrow(/STALE_ATTEMPT_PROGRESS/);
    await inFlight;
    expect((await loadAttemptV3(base.attemptId))?.save.activeElapsedMs).toBe(newer.activeElapsedMs);
  });

  it('rejects stale coordinators and regressive same-mission progress', async () => {
    const base = activeSave('attempt-stale');
    await beginAttemptV3(base);
    const first = await SaveCoordinator.create(base.attemptId);
    const stale = await SaveCoordinator.create(base.attemptId);
    await first.requestSave({
      ...base,
      activeElapsedMs: base.activeElapsedMs + 8_000,
      savedAt: base.savedAt + 1,
    });
    await expect(
      stale.requestSave({
        ...base,
        activeElapsedMs: base.activeElapsedMs + 2_000,
        savedAt: base.savedAt + 2,
      }),
    ).rejects.toThrow(/STALE_STORAGE_REVISION/);

    const current = await SaveCoordinator.create(base.attemptId);
    await expect(
      current.requestSave({
        ...base,
        activeElapsedMs: base.activeElapsedMs + 1_000,
        savedAt: base.savedAt + 3,
      }),
    ).rejects.toThrow(/STALE_ATTEMPT_PROGRESS/);
    expect((await loadAttemptV3(base.attemptId))?.save.activeElapsedMs).toBe(
      base.activeElapsedMs + 8_000,
    );
  });

  it('rejects timer and hint regression even at a newer mission revision', async () => {
    const base = activeSave('attempt-newer-revision');
    await beginAttemptV3(base);
    const coordinator = await SaveCoordinator.create(base.attemptId);
    const current = {
      ...base,
      activeElapsedMs: base.activeElapsedMs + 10_000,
      hintsUsed: { 1: 2, 2: 1, 3: 0 },
      savedAt: base.savedAt + 1,
    };
    await coordinator.requestSave(current);
    const next = await SaveCoordinator.create(base.attemptId);
    await expect(
      next.requestSave({
        ...current,
        activeElapsedMs: current.activeElapsedMs - 1,
        hintsUsed: { 1: 1, 2: 1, 3: 0 },
        voxelMission: {
          ...current.voxelMission,
          revision: current.voxelMission.revision + 1,
        },
        savedAt: current.savedAt + 1,
      }),
    ).rejects.toThrow(/STALE_ATTEMPT_PROGRESS/);
    expect((await loadAttemptV3(base.attemptId))?.save.activeElapsedMs).toBe(
      current.activeElapsedMs,
    );
  });

  it('enforces an immutable graded snapshot across later writes', async () => {
    const { complete } = await seedCompletedAttempt('attempt-grade');
    const coordinator = await SaveCoordinator.create(complete.attemptId);
    await expect(
      coordinator.requestSave({
        ...complete,
        gradedSnapshot: {
          ...complete.gradedSnapshot!,
          lockedAt: complete.gradedSnapshot!.lockedAt + 1,
        },
        savedAt: complete.savedAt + 1,
      }),
    ).rejects.toThrow(/IMMUTABLE_GRADE_CONFLICT/);
  });

  it('permits submission status changes only through dedicated atomic operations', async () => {
    const { complete } = await seedCompletedAttempt('attempt-status-transition');
    const coordinator = await SaveCoordinator.create(complete.attemptId);
    await expect(
      coordinator.requestSave({
        ...complete,
        submissionStatus: 'queued',
        savedAt: complete.savedAt + 1,
      }),
    ).rejects.toThrow(/SUBMISSION_STATUS_TRANSITION_REQUIRES_ATOMIC_OPERATION/);
  });

  it('lets one coordinator atomically freeze and queue exactly one immutable grade', async () => {
    const base = activeSave('attempt-atomic-finalization');
    await beginAttemptV3(base);
    const coordinator = await SaveCoordinator.create(base.attemptId);
    const complete = completedSave(base);
    const payload = payloadFromCompleted(complete);

    const first = coordinator.finalizeAndQueue(complete, payload, complete.savedAt + 1);
    const duplicateClick = coordinator.finalizeAndQueue(complete, payload, complete.savedAt + 1);
    const [firstResult, duplicateResult] = await Promise.all([first, duplicateClick]);

    expect(firstResult).toEqual(duplicateResult);
    expect(firstResult.submissionStatus).toBe('queued');
    expect(await queuedSubmissionsV2()).toHaveLength(1);
    expect((await loadAttemptV3(base.attemptId))?.save).toEqual(firstResult);
    await expect(
      coordinator.requestSave({ ...firstResult, savedAt: firstResult.savedAt + 1 }),
    ).rejects.toThrow(/ATTEMPT_FINALIZATION_IN_PROGRESS/);
  });

  it('matches identity only after entry and fails closed on multiple candidates', async () => {
    const student = { firstName: '  TEST  ', lastInitial: 's', period: 1 };
    await beginAttemptV3(activeSave('attempt-match-one'));
    expect(await findResumeDecision(student)).toMatchObject({ kind: 'one' });
    await hideActiveAttemptForNewStudent('attempt-match-one');
    expect(await findResumeDecision(student)).toEqual({ kind: 'none' });
    await beginAttemptV3(activeSave('attempt-match-two'));
    expect(await findResumeDecision(student)).toMatchObject({ kind: 'one' });
    expect(
      await findResumeDecision({ firstName: 'Different', lastInitial: 'D', period: 1 }),
    ).toMatchObject({ kind: 'handoff' });
    const db = await openCellGameDatabase();
    const hidden = await db.get('attempts', 'attempt-match-one');
    if (!hidden) throw new Error('missing hidden fixture');
    await db.put('attempts', { ...hidden, resumeVisible: true }, hidden.attemptId);
    expect(await findResumeDecision(student)).toEqual({ kind: 'multiple' });
  });

  it('hides New Student work without deleting attempts or pending delivery', async () => {
    const { complete } = await seedCompletedAttempt('attempt-hidden');
    const meta = await resumeAttemptV3(complete.student);
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      complete.savedAt + 1,
    );
    expect(await hideActiveAttemptForNewStudent(complete.attemptId)).toBe(true);
    expect(await loadAttemptV3(complete.attemptId)).not.toBeNull();
    expect(await queuedSubmissionsV2()).toHaveLength(1);
    expect(await (await openCellGameDatabase()).get('meta', ACTIVE_ATTEMPT_META_KEY)).toMatchObject(
      {
        attemptId: null,
      },
    );
  });

  it('confirms a privacy-neutral new-student handoff only for the observed generation', async () => {
    await beginAttemptV3(activeSave('attempt-student-a'));
    const decision = await findResumeDecision({
      firstName: 'Student',
      lastInitial: 'B',
      period: 2,
    });
    expect(decision).toMatchObject({ kind: 'handoff' });
    if (decision.kind !== 'handoff') throw new Error('missing handoff fixture');
    expect(await confirmNewStudentHandoff(decision.generation + 1)).toBe(false);
    expect((await loadAttemptV3('attempt-student-a'))?.resumeVisible).toBe(true);
    expect(await confirmNewStudentHandoff(decision.generation)).toBe(true);
    expect((await loadAttemptV3('attempt-student-a'))?.resumeVisible).toBe(false);
    expect(await (await openCellGameDatabase()).get('meta', ACTIVE_ATTEMPT_META_KEY)).toMatchObject(
      {
        attemptId: null,
      },
    );
  });

  it('does not hide a locked grade until it is durably queued, then permits a fresh attempt', async () => {
    const { complete } = await seedCompletedAttempt('attempt-before-fresh');
    const fresh = activeSave('attempt-after-fresh', complete.sessionId, complete.student);
    await expect(beginAttemptV3(fresh)).rejects.toThrow(/GRADED_ATTEMPT_NOT_READY_FOR_REPLACEMENT/);
    await expect(hideActiveAttemptForNewStudent(complete.attemptId)).rejects.toThrow(
      /GRADED_ATTEMPT_NOT_READY_FOR_REPLACEMENT/,
    );
    expect(await findResumeDecision(complete.student)).toMatchObject({ kind: 'one' });

    const meta = await resumeAttemptV3(complete.student);
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      complete.savedAt + 1,
    );
    await expect(beginAttemptV3(fresh)).resolves.toMatchObject({ attemptId: fresh.attemptId });
    expect((await loadAttemptV3(complete.attemptId))?.resumeVisible).toBe(false);
    expect(await queuedSubmissionsV2()).toHaveLength(1);
  });

  it('refuses to hide a locked grade represented by a valid but mismatched queued payload', async () => {
    const { complete } = await seedCompletedAttempt('attempt-wrong-grade');
    const meta = await resumeAttemptV3(complete.student);
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      complete.savedAt + 1,
    );
    const db = await openCellGameDatabase();
    const key = `v2:${complete.attemptId}`;
    const queued = await db.get('submissionQueue', key);
    if (!queued || !('contractVersion' in queued)) throw new Error('missing V2 queue fixture');
    await db.put(
      'submissionQueue',
      {
        ...queued,
        payload: { ...queued.payload, sessionId: 'session-valid-but-wrong-grade' },
      },
      key,
    );
    const fresh = activeSave('attempt-after-wrong-grade', complete.sessionId, complete.student);
    await expect(beginAttemptV3(fresh)).rejects.toThrow(/GRADED_ATTEMPT_NOT_DURABLY_QUEUED/);
    await expect(hideActiveAttemptForNewStudent(complete.attemptId)).rejects.toThrow(
      /GRADED_ATTEMPT_NOT_DURABLY_QUEUED/,
    );
    expect(await findResumeDecision(complete.student)).toMatchObject({ kind: 'one' });
  });

  it('detects valid and corrupt V2 data without creating a V3 attempt', async () => {
    const db = await openCellGameDatabase();
    await db.put('saves', legacySave(), `${ASSIGNMENT.id}:active`);
    await expect(classifyLegacyLocalSave()).resolves.toMatchObject({ kind: 'legacy-v2' });
    expect(await db.count('attempts')).toBe(0);
    await db.put(
      'saves',
      { ...legacySave(), mission: { ...createInitialMission(), wallPanels: 99 } },
      `${ASSIGNMENT.id}:active`,
    );
    await expect(classifyLegacyLocalSave()).resolves.toEqual({
      kind: 'corrupt-v2',
      action: 'diagnostic-export-and-safe-reset',
    });
    expect(await db.count('attempts')).toBe(0);
  });

  it('atomically queues the immutable client contract without score or test classification', async () => {
    const { complete } = await seedCompletedAttempt('attempt-queue');
    const meta = await resumeAttemptV3(complete.student);
    const payload = payloadFromCompleted(complete);
    await prepareSubmissionV2(complete, payload, meta.generation, 3, complete.savedAt + 1);
    const queue = await queuedSubmissionsV2();
    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toEqual(payload);
    expect(queue[0].payload).not.toHaveProperty('score');
    expect(queue[0].payload).not.toHaveProperty('isTest');
    expect((await loadAttemptV3(complete.attemptId))?.save.submissionStatus).toBe('queued');
  });

  it('leases one queue entry, permits expiry recovery, and rejects a stale response', async () => {
    const { complete } = await seedCompletedAttempt('attempt-lease');
    const meta = await resumeAttemptV3(complete.student);
    const queuedAt = complete.savedAt + 1;
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      queuedAt,
    );
    const first = await claimNextSubmissionLease('tab-one', queuedAt, 50);
    expect(first).not.toBeNull();
    expect(await claimNextSubmissionLease('tab-two', queuedAt + 20, 50)).toBeNull();
    const second = await claimNextSubmissionLease('tab-two', queuedAt + 51, 50);
    expect(second).not.toBeNull();
    const receipt: SubmissionReceipt = {
      attemptId: complete.attemptId,
      status: 'accepted',
      serverTimestamp: '2026-07-21T00:00:00.000Z',
    };
    expect(await settleSubmissionLease('tab-one', first!.token, receipt)).toBe(false);
    expect(await queuedSubmissionsV2()).toHaveLength(1);
    expect(await settleSubmissionLease('tab-two', second!.token, receipt)).toBe(true);
    expect(await queuedSubmissionsV2()).toHaveLength(0);
    expect(await findResumeDecision(complete.student)).toEqual({ kind: 'none' });
    await expect(resumeAttemptV3(complete.student)).rejects.toThrow(/ATTEMPT_NOT_RESUMABLE_NONE/);
  });

  it('atomically grants only one lease across concurrent claim attempts', async () => {
    const { complete } = await seedCompletedAttempt('attempt-concurrent-lease');
    const meta = await resumeAttemptV3(complete.student);
    const now = complete.savedAt + 1;
    await prepareSubmissionV2(complete, payloadFromCompleted(complete), meta.generation, 3, now);
    const claims = await Promise.all([
      claimNextSubmissionLease('tab-concurrent-one', now, 500),
      claimNextSubmissionLease('tab-concurrent-two', now, 500),
    ]);
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    expect(claims.filter((claim) => claim === null)).toHaveLength(1);
  });

  it('retains queued work after malformed or mismatched transport receipts', async () => {
    const { complete } = await seedCompletedAttempt('attempt-bad-receipt');
    const meta = await resumeAttemptV3(complete.student);
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      complete.savedAt + 1,
    );
    const worker = new SubmissionReplayCoordinator('tab-bad-receipt', () => complete.savedAt + 2);
    await worker.replay(async () => ({
      attemptId: 'different-attempt',
      status: 'accepted',
      serverTimestamp: 'not-a-date',
    }));
    expect(await queuedSubmissionsV2()).toMatchObject([
      { attempts: 1, lastError: 'INVALID_UPSTREAM_RECEIPT', lease: null },
    ]);
    expect(await (await openCellGameDatabase()).count('receipts')).toBe(0);
    worker.dispose();
  });

  it('releases only the current lease after a retryable failure', async () => {
    const { complete } = await seedCompletedAttempt('attempt-retry');
    const meta = await resumeAttemptV3(complete.student);
    const queuedAt = complete.savedAt + 1;
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      queuedAt,
    );
    const claim = await claimNextSubmissionLease('tab', queuedAt, 500);
    expect(claim).not.toBeNull();
    expect(
      await releaseSubmissionLeaseAfterFailure(
        'wrong-tab',
        claim!.token,
        complete.attemptId,
        queuedAt + 100,
      ),
    ).toBe(false);
    expect(
      await releaseSubmissionLeaseAfterFailure(
        'tab',
        claim!.token,
        complete.attemptId,
        queuedAt + 100,
      ),
    ).toBe(true);
    expect(await queuedSubmissionsV2()).toMatchObject([
      { attempts: 1, nextAttemptAt: queuedAt + 1_100, lease: null },
    ]);
  });

  it('shares one module-level replay promise across triggers and sends an attempt once', async () => {
    const { complete } = await seedCompletedAttempt('attempt-replay');
    const meta = await resumeAttemptV3(complete.student);
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      complete.savedAt + 1,
    );
    const receipt: SubmissionReceipt = {
      attemptId: complete.attemptId,
      status: 'accepted',
      serverTimestamp: '2026-07-21T00:00:00.000Z',
    };
    const transport = vi.fn(async () => receipt);
    const startup = new SubmissionReplayCoordinator('tab-startup', () => complete.savedAt + 2);
    const online = new SubmissionReplayCoordinator('tab-online', () => complete.savedAt + 2);
    const first = startup.replay(transport);
    const second = online.replay(transport);
    expect(second).toBe(first);
    await expect(first).resolves.toEqual([receipt]);
    expect(transport).toHaveBeenCalledTimes(1);
    startup.dispose();
    online.dispose();
  });

  it('times out transport before lease expiry and prevents overlapping sends', async () => {
    const { complete } = await seedCompletedAttempt('attempt-timeout');
    const meta = await resumeAttemptV3(complete.student);
    const queuedAt = complete.savedAt + 1;
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      queuedAt,
    );
    let resolveSlow: ((receipt: SubmissionReceipt) => void) | undefined;
    const slowTransport = vi.fn(
      () =>
        new Promise<SubmissionReceipt>((resolve) => {
          resolveSlow = resolve;
        }),
    );
    const overlappingTransport = vi.fn(async () => ({
      attemptId: complete.attemptId,
      status: 'accepted' as const,
      serverTimestamp: '2026-07-21T00:00:00.000Z',
    }));
    const firstWorker = new SubmissionReplayCoordinator('tab-slow', () => queuedAt, 10, 50);
    const secondWorker = new SubmissionReplayCoordinator(
      'tab-overlap',
      () => queuedAt + 51,
      10,
      50,
    );
    const first = firstWorker.replay(slowTransport);
    expect(secondWorker.replay(overlappingTransport)).toBe(first);
    await first;
    expect(slowTransport).toHaveBeenCalledTimes(1);
    expect(overlappingTransport).not.toHaveBeenCalled();
    expect(await queuedSubmissionsV2()).toMatchObject([
      {
        attempts: 1,
        lastError: 'SUBMISSION_TIMEOUT',
        lease: { ownerId: 'tab-slow', expiresAt: queuedAt + 50 },
      },
    ]);
    resolveSlow?.({
      attemptId: complete.attemptId,
      status: 'accepted',
      serverTimestamp: '2026-07-21T00:00:00.000Z',
    });
    firstWorker.dispose();
    secondWorker.dispose();
  });

  it('keeps transport errors queued and settles only a real rejected server receipt', async () => {
    const { complete } = await seedCompletedAttempt('attempt-errors');
    const meta = await resumeAttemptV3(complete.student);
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      complete.savedAt + 1,
    );
    const retryWorker = new SubmissionReplayCoordinator('tab-errors', () => complete.savedAt + 2);
    await retryWorker.replay(async () => {
      throw new SubmissionTransportError(true, 'NETWORK_DOWN');
    });
    expect(await queuedSubmissionsV2()).toMatchObject([{ attempts: 1, lease: null }]);
    retryWorker.dispose();

    const entry = (await queuedSubmissionsV2())[0];
    const permanentWorker = new SubmissionReplayCoordinator(
      'tab-permanent',
      () => entry.nextAttemptAt + 1,
    );
    const receipts = await permanentWorker.replay(async () => {
      throw new SubmissionTransportError(false, 'INVALID_PAYLOAD');
    });
    expect(receipts).toEqual([]);
    expect(await queuedSubmissionsV2()).toMatchObject([
      { attempts: 2, lastError: 'DELIVERY_FAILED', lease: null },
    ]);
    permanentWorker.dispose();

    const retained = (await queuedSubmissionsV2())[0];
    const serverRejection = new SubmissionReplayCoordinator(
      'tab-server-rejection',
      () => retained.nextAttemptAt + 1,
    );
    const rejected: SubmissionReceipt = {
      attemptId: complete.attemptId,
      status: 'rejected',
      serverTimestamp: '2026-07-21T00:00:00.000Z',
      errorCode: 'INVALID_PAYLOAD',
    };
    await expect(serverRejection.replay(async () => rejected)).resolves.toEqual([rejected]);
    expect(await queuedSubmissionsV2()).toHaveLength(0);
    serverRejection.dispose();
  });

  it('requires the teacher phrase and clears every store without claiming remote erasure', async () => {
    const { complete } = await seedCompletedAttempt('attempt-reset');
    const meta = await resumeAttemptV3(complete.student);
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      complete.savedAt + 1,
    );
    await (await openCellGameDatabase()).put('saves', legacySave(), `${ASSIGNMENT.id}:active`);
    await expect(teacherDeviceResetAllLocalData('RESET')).rejects.toThrow(/CONFIRMATION/);
    expect(await localDataCounts()).toMatchObject({
      legacySaves: 1,
      attempts: 1,
      queuedSubmissions: 1,
    });
    await teacherDeviceResetAllLocalData(TEACHER_RESET_CONFIRMATION);
    expect(await localDataCounts()).toEqual({
      legacySaves: 0,
      attempts: 0,
      queuedSubmissions: 0,
      receipts: 0,
    });
  });

  it('invalidates pre-reset save and replay work without recreating cleared data', async () => {
    const base = activeSave('attempt-reset-race');
    await beginAttemptV3(base);
    const coordinator = await SaveCoordinator.create(base.attemptId);
    const pendingSave = coordinator.requestSave({
      ...base,
      activeElapsedMs: base.activeElapsedMs + 1,
      savedAt: base.savedAt + 1,
    });
    const rejectedSave = expect(pendingSave).rejects.toThrow(/PERSISTENCE_RESET/);
    await teacherDeviceResetAllLocalData(TEACHER_RESET_CONFIRMATION);
    await rejectedSave;
    expect(await localDataCounts()).toEqual({
      legacySaves: 0,
      attempts: 0,
      queuedSubmissions: 0,
      receipts: 0,
    });
  });

  it('lets a new replay proceed after reset while an old transport ignores abort', async () => {
    const { complete: oldComplete } = await seedCompletedAttempt('attempt-old-replay');
    const oldMeta = await resumeAttemptV3(oldComplete.student);
    await prepareSubmissionV2(
      oldComplete,
      payloadFromCompleted(oldComplete),
      oldMeta.generation,
      3,
      oldComplete.savedAt + 1,
    );
    let announceStart = () => {};
    const started = new Promise<void>((resolve) => {
      announceStart = resolve;
    });
    let resolveOld: ((receipt: SubmissionReceipt) => void) | undefined;
    const oldWorker = new SubmissionReplayCoordinator(
      'tab-before-reset',
      () => oldComplete.savedAt + 2,
      1_000,
      2_000,
    );
    const oldReplay = oldWorker.replay(
      () =>
        new Promise<SubmissionReceipt>((resolve) => {
          resolveOld = resolve;
          announceStart();
        }),
    );
    await started;
    await teacherDeviceResetAllLocalData(TEACHER_RESET_CONFIRMATION);
    await expect(oldReplay).resolves.toEqual([]);

    const { complete: freshComplete } = await seedCompletedAttempt('attempt-fresh-replay');
    const freshMeta = await resumeAttemptV3(freshComplete.student);
    await prepareSubmissionV2(
      freshComplete,
      payloadFromCompleted(freshComplete),
      freshMeta.generation,
      3,
      freshComplete.savedAt + 1,
    );
    const freshReceipt: SubmissionReceipt = {
      attemptId: freshComplete.attemptId,
      status: 'accepted',
      serverTimestamp: '2026-07-21T00:00:00.000Z',
    };
    const freshWorker = new SubmissionReplayCoordinator(
      'tab-after-reset',
      () => freshComplete.savedAt + 2,
    );
    await expect(freshWorker.replay(async () => freshReceipt)).resolves.toEqual([freshReceipt]);
    resolveOld?.({
      attemptId: oldComplete.attemptId,
      status: 'accepted',
      serverTimestamp: '2026-07-21T00:00:00.000Z',
    });
    await Promise.resolve();
    expect(await localDataCounts()).toEqual({
      legacySaves: 0,
      attempts: 1,
      queuedSubmissions: 0,
      receipts: 1,
    });
    oldWorker.dispose();
    freshWorker.dispose();
  });

  it('namespaces V2 delivery so a colliding V1 receipt cannot delete it', async () => {
    const { complete } = await seedCompletedAttempt('attempt-local-key-collision');
    const meta = await resumeAttemptV3(complete.student);
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      complete.savedAt + 1,
    );
    const legacy = legacySave(complete.attemptId);
    await queueSubmission({ payload: legacyPayload(legacy), queuedAt: 1, attempts: 0 });
    await recordReceipt({
      attemptId: complete.attemptId,
      status: 'accepted',
      serverTimestamp: '2026-07-21T00:00:00.000Z',
    });
    expect(await queuedSubmissionsV2()).toHaveLength(1);
    expect(await (await openCellGameDatabase()).count('submissionQueue')).toBe(1);
  });

  it('fails closed when a valid queue value is stored under the wrong namespace key', async () => {
    const { complete } = await seedCompletedAttempt('attempt-wrong-queue-key');
    const meta = await resumeAttemptV3(complete.student);
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      complete.savedAt + 1,
    );
    const db = await openCellGameDatabase();
    const correctKey = `v2:${complete.attemptId}`;
    const entry = await db.get('submissionQueue', correctKey);
    if (!entry) throw new Error('missing queue fixture');
    await db.delete('submissionQueue', correctKey);
    await db.put('submissionQueue', entry, complete.attemptId);
    await expect(queuedSubmissionsV2()).rejects.toThrow(/CORRUPT_SUBMISSION_QUEUE/);
  });

  it('quarantines shallow legacy queue records instead of treating them as deliverable', async () => {
    const db = await openCellGameDatabase();
    await db.put(
      'submissionQueue',
      { payload: { attemptId: 'legacy-shallow' }, queuedAt: 1, attempts: 0 } as never,
      'legacy-shallow',
    );
    await expect(queuedSubmissionsV2()).rejects.toThrow(/CORRUPT_SUBMISSION_QUEUE/);
    expect(await exportV3Diagnostic()).toContain('corrupt-or-unsupported-queue');
  });

  it('blocks recovery and delivery when V3 records are corrupt', async () => {
    const db = await openCellGameDatabase();
    await db.put('attempts', { recordVersion: 1 } as never, 'corrupt-attempt');
    expect(await findResumeDecision({ firstName: 'Test', lastInitial: 'S', period: 1 })).toEqual({
      kind: 'blocked',
      code: 'CORRUPT_ATTEMPT_STORE',
    });
    await db.put('submissionQueue', { contractVersion: 2 } as never, 'v2:corrupt-queue');
    await expect(queuedSubmissionsV2()).rejects.toThrow(/CORRUPT_SUBMISSION_QUEUE/);
    expect(await exportV3Diagnostic()).toContain('corrupt-v2-queue');
  });

  it('exports diagnostics without names or queued payload bodies', async () => {
    const { complete } = await seedCompletedAttempt('attempt-diagnostic');
    const meta = await resumeAttemptV3(complete.student);
    await prepareSubmissionV2(
      complete,
      payloadFromCompleted(complete),
      meta.generation,
      3,
      complete.savedAt + 1,
    );
    const diagnostic = await exportV3Diagnostic();
    expect(diagnostic).not.toContain(complete.student.firstName);
    expect(diagnostic).not.toContain('objectives');
    expect(diagnostic).not.toContain('firstName');
    expect(diagnostic).not.toContain(complete.attemptId);
    expect(diagnostic).toContain('current-v3');
  });
});
