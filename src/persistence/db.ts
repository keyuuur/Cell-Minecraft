import { ASSIGNMENT, LEGACY_GAME_VERSION, LEGACY_SAVE_SCHEMA_VERSION } from '../data/assignment';
import type {
  PendingSubmission,
  SaveEnvelope,
  SubmissionPayload,
  SubmissionReceipt,
} from '../types/game';
import {
  assertQueueRecordsSafe,
  validLegacyPendingSubmission,
  validPendingSubmissionV2,
} from './queueValidation';
import { validSubmissionReceipt } from './receiptValidation';
import { openCellGameDatabase } from './schema';

const database = openCellGameDatabase;

export const ACTIVE_SAVE_KEY = `${ASSIGNMENT.id}:active`;

export async function saveProgress(save: SaveEnvelope): Promise<void> {
  const db = await database();
  await db.put('saves', save, ACTIVE_SAVE_KEY);
}

export async function loadProgress(): Promise<SaveEnvelope | null> {
  const db = await database();
  const raw = await db.get('saves', ACTIVE_SAVE_KEY);
  if (!raw) return null;
  validateStoredSave(raw);
  return migrateSave(raw);
}

function validateStoredSave(value: unknown): asserts value is SaveEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The saved attempt is not a valid object.');
  }
  const save = value as Partial<SaveEnvelope>;
  const mission = save.mission;
  const validId = (id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(id);
  const validControls = save.controls === 'keyboard-touch' || save.controls === 'touch-only';
  const validQuality = ['auto', 'low', 'standard'].includes(save.qualityMode ?? '');
  const validStatus = ['idle', 'queued', 'sending', 'accepted', 'duplicate', 'rejected'].includes(
    save.submissionStatus ?? '',
  );
  const validOutcome =
    save.outcome === undefined ||
    ['active', 'complete', 'early', 'timeout', 'practice'].includes(save.outcome);
  if (
    typeof save.schemaVersion !== 'number' ||
    !Number.isInteger(save.schemaVersion) ||
    save.schemaVersion < 1 ||
    save.assignmentId !== ASSIGNMENT.id ||
    save.assignmentVersion !== ASSIGNMENT.version ||
    typeof save.gameVersion !== 'string' ||
    !validId(save.sessionId) ||
    !validId(save.attemptId) ||
    !validControls ||
    !validQuality ||
    !validStatus ||
    !validOutcome ||
    !save.student ||
    typeof save.student.firstName !== 'string' ||
    save.student.firstName.length < 1 ||
    save.student.firstName.length > 40 ||
    typeof save.student.lastInitial !== 'string' ||
    !/^[A-Za-z]$/.test(save.student.lastInitial) ||
    !Number.isInteger(save.student.period) ||
    save.student.period < 1 ||
    save.student.period > 7 ||
    !mission ||
    !Number.isInteger(mission.wallPanels) ||
    mission.wallPanels < 0 ||
    mission.wallPanels > 6 ||
    !Number.isInteger(mission.membranePanels) ||
    mission.membranePanels < 0 ||
    mission.membranePanels > 6 ||
    typeof save.activeElapsedMs !== 'number' ||
    !Number.isFinite(save.activeElapsedMs) ||
    save.activeElapsedMs < 0 ||
    save.activeElapsedMs > ASSIGNMENT.durationSeconds * 1000
  ) {
    throw new Error('The saved attempt failed validation.');
  }
  for (const field of [
    'cytoplasmEstablished',
    'waterAvailable',
    'droughtStarted',
    'droughtDiagnosed',
    'droughtObserved',
    'recoveryRestored',
    'completionLocked',
    'completed',
    'practice',
  ] as const) {
    if (typeof mission[field] !== 'boolean')
      throw new Error('The saved mission failed validation.');
  }
  const allowedPlacements = new Set([
    'nucleus',
    'ribosomes',
    'mitochondria',
    'chloroplasts',
    'centralVacuole',
  ]);
  if (!mission.placements || typeof mission.placements !== 'object') {
    throw new Error('The saved placements failed validation.');
  }
  for (const [id, placement] of Object.entries(mission.placements)) {
    const point = placement?.position;
    if (
      !allowedPlacements.has(id) ||
      placement?.id !== id ||
      !point ||
      ![point.x, point.y, point.z].every(Number.isFinite) ||
      Math.abs(point.x) > 12 ||
      point.y < 0 ||
      point.y > 12 ||
      Math.abs(point.z) > 12 ||
      !Number.isFinite(placement.placedAt)
    ) {
      throw new Error('The saved placements failed validation.');
    }
  }
}

export function migrateSave(save: SaveEnvelope): SaveEnvelope {
  if (save.schemaVersion > LEGACY_SAVE_SCHEMA_VERSION) {
    throw new Error('This save was created by a newer version of the game.');
  }
  return {
    ...save,
    schemaVersion: LEGACY_SAVE_SCHEMA_VERSION,
    gameVersion: LEGACY_GAME_VERSION,
    accessibility: {
      largeText: save.accessibility?.largeText ?? false,
      highContrast: save.accessibility?.highContrast ?? false,
      reducedMotion: save.accessibility?.reducedMotion ?? false,
      muted: save.accessibility?.muted ?? false,
    },
    mission: {
      ...save.mission,
      functionEvidence: save.mission.functionEvidence ?? {},
      vacuoleHydratedObserved: save.mission.vacuoleHydratedObserved ?? false,
    },
    outcome:
      save.outcome ??
      (save.mission.practice ? 'practice' : save.mission.completed ? 'complete' : 'active'),
    gradedScore: save.gradedScore ?? (save.mission.completionLocked ? save.score : null),
    gradedOutcome:
      save.gradedOutcome ??
      (save.outcome === 'complete' || save.outcome === 'early' || save.outcome === 'timeout'
        ? save.outcome
        : null),
    submissionStatus: save.submissionStatus === 'sending' ? 'queued' : save.submissionStatus,
  };
}

export async function clearLocalData(): Promise<void> {
  const db = await database();
  const transaction = db.transaction(['saves', 'receipts'], 'readwrite');
  await Promise.all([
    transaction.objectStore('saves').clear(),
    transaction.objectStore('receipts').clear(),
    transaction.done,
  ]);
}

export async function clearAllLocalDataForTests(): Promise<void> {
  const db = await database();
  const transaction = db.transaction(
    ['saves', 'attempts', 'meta', 'submissionQueue', 'receipts'],
    'readwrite',
  );
  await Promise.all([
    transaction.objectStore('saves').clear(),
    transaction.objectStore('attempts').clear(),
    transaction.objectStore('meta').clear(),
    transaction.objectStore('submissionQueue').clear(),
    transaction.objectStore('receipts').clear(),
    transaction.done,
  ]);
}

export async function clearCompletedSave(expectedAttemptId?: string): Promise<void> {
  const db = await database();
  if (expectedAttemptId) {
    const active = await db.get('saves', ACTIVE_SAVE_KEY);
    if (active && active.attemptId !== expectedAttemptId) return;
  }
  await db.delete('saves', ACTIVE_SAVE_KEY);
}

export async function clearIdentityForNewStudent(): Promise<void> {
  await clearLocalData();
}

export async function prepareSubmission(
  save: SaveEnvelope,
  payload: SubmissionPayload,
): Promise<void> {
  const db = await database();
  const transaction = db.transaction(['saves', 'submissionQueue'], 'readwrite');
  const queued: PendingSubmission = { payload, queuedAt: Date.now(), attempts: 0 };
  await Promise.all([
    transaction.objectStore('saves').put(save, ACTIVE_SAVE_KEY),
    transaction.objectStore('submissionQueue').put(queued, payload.attemptId),
    transaction.done,
  ]);
}

export async function queueSubmission(entry: PendingSubmission): Promise<void> {
  const db = await database();
  await db.put('submissionQueue', entry, entry.payload.attemptId);
}

export async function queuedSubmissions(): Promise<PendingSubmission[]> {
  const transaction = (await database()).transaction('submissionQueue', 'readonly');
  const store = transaction.objectStore('submissionQueue');
  const [keys, records] = await Promise.all([store.getAllKeys(), store.getAll()]);
  assertQueueRecordsSafe(keys, records);
  await transaction.done;
  return records.filter(validLegacyPendingSubmission);
}

function classifyQueueRecordForDiagnostic(record: unknown): string {
  if (validLegacyPendingSubmission(record)) return 'legacy-v1';
  if (validPendingSubmissionV2(record)) return 'current-v2-queue';
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return 'corrupt-or-unsupported-queue';
  }
  const candidate = record as Record<string, unknown>;
  if (candidate.contractVersion !== 2) return 'corrupt-or-unsupported-queue';
  return 'corrupt-v2-queue';
}

export async function recordReceipt(receipt: SubmissionReceipt): Promise<void> {
  if (!validSubmissionReceipt(receipt)) throw new Error('INVALID_RECEIPT');
  const db = await database();
  const transaction = db.transaction(['submissionQueue', 'receipts'], 'readwrite');
  const queued = await transaction.objectStore('submissionQueue').get(receipt.attemptId);
  if (queued !== undefined && !validLegacyPendingSubmission(queued)) {
    throw new Error('CORRUPT_SUBMISSION_QUEUE');
  }
  await transaction.objectStore('receipts').put(receipt, receipt.attemptId);
  await transaction.objectStore('submissionQueue').delete(receipt.attemptId);
  await transaction.done;
}

export async function exportDiagnostic(): Promise<string> {
  const db = await database();
  const save = await db.get('saves', ACTIVE_SAVE_KEY);
  const queue = await db.getAll('submissionQueue');
  let saveSummary: Record<string, unknown>;
  try {
    if (save === undefined) {
      saveSummary = { classification: 'none' };
    } else {
      validateStoredSave(save);
      const migrated = migrateSave(save);
      saveSummary = {
        classification: 'legacy-v2',
        schemaVersion: migrated.schemaVersion,
        gameVersion: migrated.gameVersion,
        activeElapsedMs: migrated.activeElapsedMs,
        submissionStatus: migrated.submissionStatus,
      };
    }
  } catch {
    saveSummary = { classification: 'corrupt-legacy-save' };
  }
  const safe = {
    generatedAt: new Date().toISOString(),
    save: saveSummary,
    queue: queue.map((record) => ({
      classification: classifyQueueRecordForDiagnostic(record),
    })),
  };
  return JSON.stringify(safe, null, 2);
}
