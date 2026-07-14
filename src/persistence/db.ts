import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { ASSIGNMENT, GAME_VERSION, SAVE_SCHEMA_VERSION } from '../data/assignment';
import type {
  PendingSubmission,
  SaveEnvelope,
  SubmissionPayload,
  SubmissionReceipt,
} from '../types/game';

interface CellGameDb extends DBSchema {
  saves: {
    key: string;
    value: SaveEnvelope;
  };
  submissionQueue: {
    key: string;
    value: PendingSubmission;
  };
  receipts: {
    key: string;
    value: SubmissionReceipt;
  };
}

let databasePromise: Promise<IDBPDatabase<CellGameDb>> | null = null;

function database(): Promise<IDBPDatabase<CellGameDb>> {
  if (!databasePromise) {
    databasePromise = openDB<CellGameDb>('build-a-living-cell', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');
        if (!db.objectStoreNames.contains('submissionQueue')) {
          db.createObjectStore('submissionQueue');
        }
        if (!db.objectStoreNames.contains('receipts')) db.createObjectStore('receipts');
      },
    });
  }
  return databasePromise;
}

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
  if (save.schemaVersion > SAVE_SCHEMA_VERSION) {
    throw new Error('This save was created by a newer version of the game.');
  }
  return {
    ...save,
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: GAME_VERSION,
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
  const transaction = db.transaction(['saves', 'submissionQueue', 'receipts'], 'readwrite');
  await Promise.all([
    transaction.objectStore('saves').clear(),
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
  return (await database()).getAll('submissionQueue');
}

export async function recordReceipt(receipt: SubmissionReceipt): Promise<void> {
  const db = await database();
  const transaction = db.transaction(['submissionQueue', 'receipts'], 'readwrite');
  await transaction.objectStore('receipts').put(receipt, receipt.attemptId);
  await transaction.objectStore('submissionQueue').delete(receipt.attemptId);
  await transaction.done;
}

export async function exportDiagnostic(): Promise<string> {
  const db = await database();
  const save = await db.get('saves', ACTIVE_SAVE_KEY);
  const queue = await db.getAll('submissionQueue');
  const safe = {
    generatedAt: new Date().toISOString(),
    schemaVersion: save?.schemaVersion,
    gameVersion: save?.gameVersion,
    assignmentId: save?.assignmentId,
    attemptId: save?.attemptId,
    activeElapsedMs: save?.activeElapsedMs,
    mission: save?.mission,
    score: save?.score,
    submissionStatus: save?.submissionStatus,
    pendingAttemptIds: queue.map((item) => item.payload.attemptId),
  };
  return JSON.stringify(safe, null, 2);
}
