import type { IDBPTransaction } from 'idb';
import {
  classifyPersistedSave,
  validateClientSubmissionPayloadV2,
  validateSaveEnvelopeV3,
} from '../contracts/missionContracts';
import { ASSIGNMENT } from '../data/assignment';
import type {
  ClientSubmissionPayloadV2,
  PendingSubmissionV2,
  SaveEnvelopeV3,
  StudentProfile,
  SubmissionReceipt,
} from '../types/game';
import { MISSION_WORLD_OPTIONS } from '../voxel/missionWorld';
import { VoxelWorld } from '../voxel/VoxelWorld';
import { ACTIVE_SAVE_KEY } from './db';
import {
  assertQueueRecordsSafe,
  queueRecordKeyMatches,
  SAFE_DELIVERY_ERROR_CODES,
  v2LocalKey,
  validLegacyPendingSubmission,
  validPendingSubmissionV2,
} from './queueValidation';
import { validSubmissionReceipt } from './receiptValidation';
import {
  closeCellGameDatabase,
  openCellGameDatabase,
  wasCellDatabaseOpenBlocked,
  type ActiveAttemptMetaV1,
  type AttemptRecordV1,
  type CellGameDbV2,
} from './schema';

export const ACTIVE_ATTEMPT_META_KEY = 'activeAttemptId';
export const HEALTH_PROBE_META_KEY = 'healthProbe';
export const TEACHER_RESET_CONFIRMATION = 'DELETE ALL LOCAL DATA';

const contractWorld = new VoxelWorld(MISSION_WORLD_OPTIONS);
const replayWorkers = new Set<SubmissionReplayCoordinator>();
let sharedReplayPromise: Promise<SubmissionReceipt[]> | null = null;
let sharedReplayToken: symbol | null = null;
let replayEpoch = 0;
let persistenceEpoch = 0;

const DEFAULT_LEASE_MS = 15_000;
const DEFAULT_TRANSPORT_TIMEOUT_MS = 8_000;

export type SaveStatus =
  | { state: 'checking' }
  | { state: 'dirty' }
  | { state: 'saving'; requestedStorageRevision: number }
  | { state: 'saved'; storageRevision: number; savedAt: number }
  | { state: 'failed'; code: string }
  | { state: 'unavailable'; code: string };

export type PersistenceHealth =
  { state: 'ready'; checkedAt: number } | { state: 'unavailable'; code: string };

export type ResumeDecision =
  | { kind: 'none' }
  | { kind: 'one'; save: SaveEnvelopeV3 }
  | { kind: 'handoff'; generation: number }
  | { kind: 'multiple' }
  | { kind: 'blocked'; code: string };

export interface LocalDataCounts {
  legacySaves: number;
  attempts: number;
  queuedSubmissions: number;
  receipts: number;
}

export interface SaveCommitResult {
  status: 'written' | 'stale';
  storageRevision: number;
  savedAt: number;
}

export interface SubmissionLeaseClaim {
  entry: PendingSubmissionV2;
  token: string;
}

export type SubmissionTransport = (
  payload: ClientSubmissionPayloadV2,
  signal: AbortSignal,
) => Promise<SubmissionReceipt>;

export class SubmissionTransportError extends Error {
  constructor(
    public readonly retryable: boolean,
    message = 'SUBMISSION_DELIVERY_FAILED',
  ) {
    super(message);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function exactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function safeDeliveryErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : 'DELIVERY_FAILED';
  return SAFE_DELIVERY_ERROR_CODES.has(code) ? code : 'DELIVERY_FAILED';
}

function randomId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function assertValidSave(save: unknown): asserts save is SaveEnvelopeV3 {
  if (!validateSaveEnvelopeV3(save, contractWorld)) {
    throw new Error('INVALID_V3_SAVE');
  }
  if (save.submissionStatus === 'sending') {
    throw new Error('TRANSIENT_SUBMISSION_STATUS_CANNOT_BE_PERSISTED');
  }
}

function validAttemptRecord(value: unknown): value is AttemptRecordV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (
    !exactKeys(value, ['recordVersion', 'attemptId', 'storageRevision', 'resumeVisible', 'save'])
  ) {
    return false;
  }
  const record = value as Partial<AttemptRecordV1>;
  return (
    record.recordVersion === 1 &&
    typeof record.attemptId === 'string' &&
    Number.isInteger(record.storageRevision) &&
    record.storageRevision! >= 1 &&
    typeof record.resumeVisible === 'boolean' &&
    validateSaveEnvelopeV3(record.save, contractWorld) &&
    record.save?.attemptId === record.attemptId &&
    record.save.submissionStatus !== 'sending'
  );
}

function defaultActiveMeta(now = Date.now()): ActiveAttemptMetaV1 {
  return {
    kind: 'active-attempt',
    recordVersion: 1,
    attemptId: null,
    generation: 0,
    updatedAt: now,
  };
}

function validActiveMeta(value: unknown): value is ActiveAttemptMetaV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!exactKeys(value, ['kind', 'recordVersion', 'attemptId', 'generation', 'updatedAt'])) {
    return false;
  }
  const meta = value as Partial<ActiveAttemptMetaV1>;
  return (
    meta.kind === 'active-attempt' &&
    meta.recordVersion === 1 &&
    (meta.attemptId === null || typeof meta.attemptId === 'string') &&
    Number.isInteger(meta.generation) &&
    meta.generation! >= 0 &&
    typeof meta.updatedAt === 'number' &&
    Number.isFinite(meta.updatedAt)
  );
}

async function activeMeta(
  transaction?: IDBPTransaction<CellGameDbV2, ['meta'], 'readonly' | 'readwrite'>,
): Promise<ActiveAttemptMetaV1> {
  const raw = transaction
    ? await transaction.objectStore('meta').get(ACTIVE_ATTEMPT_META_KEY)
    : await (await openCellGameDatabase()).get('meta', ACTIVE_ATTEMPT_META_KEY);
  if (raw === undefined) return defaultActiveMeta();
  if (!validActiveMeta(raw)) throw new Error('CORRUPT_ACTIVE_ATTEMPT_META');
  return raw;
}

function normalizedIdentity(student: StudentProfile): string {
  return [
    student.firstName.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US'),
    student.lastInitial.toUpperCase(),
    String(student.period),
  ].join('|');
}

function assertAttemptContinuity(
  existing: AttemptRecordV1,
  save: SaveEnvelopeV3,
  allowedSubmissionTransition?: readonly [
    from: SaveEnvelopeV3['submissionStatus'],
    to: SaveEnvelopeV3['submissionStatus'],
  ],
): void {
  assertSaveContinuity(existing.save, save, allowedSubmissionTransition);
}

function assertSaveContinuity(
  existing: SaveEnvelopeV3,
  save: SaveEnvelopeV3,
  allowedSubmissionTransition?: readonly [
    from: SaveEnvelopeV3['submissionStatus'],
    to: SaveEnvelopeV3['submissionStatus'],
  ],
): void {
  if (
    existing.attemptId !== save.attemptId ||
    existing.sessionId !== save.sessionId ||
    normalizedIdentity(existing.student) !== normalizedIdentity(save.student)
  ) {
    throw new Error('ATTEMPT_IDENTITY_CONFLICT');
  }
  if (save.voxelMission.revision < existing.voxelMission.revision) {
    throw new Error('STALE_MISSION_REVISION');
  }
  if (
    save.activeElapsedMs < existing.activeElapsedMs ||
    [1, 2, 3].some((level) => save.hintsUsed[level] < existing.hintsUsed[level])
  ) {
    throw new Error('STALE_ATTEMPT_PROGRESS');
  }
  if (save.savedAt < existing.savedAt) throw new Error('STALE_SAVE_TIMESTAMP');
  if (
    save.submissionStatus !== existing.submissionStatus &&
    (allowedSubmissionTransition?.[0] !== existing.submissionStatus ||
      allowedSubmissionTransition[1] !== save.submissionStatus)
  ) {
    throw new Error('SUBMISSION_STATUS_TRANSITION_REQUIRES_ATOMIC_OPERATION');
  }
  if (
    existing.gradedSnapshot !== null &&
    !valuesEqual(existing.gradedSnapshot, save.gradedSnapshot)
  ) {
    throw new Error('IMMUTABLE_GRADE_CONFLICT');
  }
}

async function putAttemptInTransaction(
  transaction: IDBPTransaction<CellGameDbV2, ['attempts', 'meta'], 'readwrite'>,
  save: SaveEnvelopeV3,
  storageRevision: number,
  expectedGeneration: number,
  allowedSubmissionTransition?: readonly [
    from: SaveEnvelopeV3['submissionStatus'],
    to: SaveEnvelopeV3['submissionStatus'],
  ],
): Promise<SaveCommitResult> {
  assertValidSave(save);
  if (!Number.isInteger(storageRevision) || storageRevision < 1) {
    throw new Error('INVALID_STORAGE_REVISION');
  }
  const meta = await activeMeta(
    transaction as unknown as IDBPTransaction<CellGameDbV2, ['meta'], 'readwrite'>,
  );
  if (meta.attemptId !== save.attemptId || meta.generation !== expectedGeneration) {
    throw new Error('ACTIVE_ATTEMPT_CHANGED');
  }
  const store = transaction.objectStore('attempts');
  const current = await store.get(save.attemptId);
  if (current !== undefined && !validAttemptRecord(current))
    throw new Error('CORRUPT_ATTEMPT_RECORD');
  if (current && storageRevision <= current.storageRevision) {
    return {
      status: 'stale',
      storageRevision: current.storageRevision,
      savedAt: current.save.savedAt,
    };
  }
  if (current) assertAttemptContinuity(current, save, allowedSubmissionTransition);
  await store.put(
    {
      recordVersion: 1,
      attemptId: save.attemptId,
      storageRevision,
      resumeVisible: current?.resumeVisible ?? true,
      save: clone(save),
    },
    save.attemptId,
  );
  return { status: 'written', storageRevision, savedAt: save.savedAt };
}

export async function beginAttemptV3(save: SaveEnvelopeV3): Promise<AttemptRecordV1> {
  const operationEpoch = persistenceEpoch;
  assertValidSave(save);
  if (save.gradedSnapshot !== null || save.outcome !== 'active') {
    throw new Error('NEW_ATTEMPT_MUST_BE_ACTIVE');
  }
  const db = await openCellGameDatabase();
  if (operationEpoch !== persistenceEpoch) throw new Error('PERSISTENCE_RESET');
  const transaction = db.transaction(
    ['attempts', 'meta', 'submissionQueue', 'receipts'],
    'readwrite',
  );
  const attemptStore = transaction.objectStore('attempts');
  if (await attemptStore.get(save.attemptId)) throw new Error('ATTEMPT_ALREADY_EXISTS');
  const currentMeta = await activeMeta(
    transaction as unknown as IDBPTransaction<CellGameDbV2, ['meta'], 'readwrite'>,
  );
  const existingRecords = await attemptStore.getAll();
  if (existingRecords.some((record) => !validAttemptRecord(record))) {
    throw new Error('CORRUPT_ATTEMPT_STORE');
  }
  const visibleRecords = existingRecords.filter((record) => record.resumeVisible);
  if (visibleRecords.length > 1) throw new Error('AMBIGUOUS_RESUME_STATE');
  if (currentMeta.attemptId !== null) {
    const current = visibleRecords.find((record) => record.attemptId === currentMeta.attemptId);
    if (!current || current.save.gradedSnapshot === null) throw new Error('ACTIVE_ATTEMPT_EXISTS');
    if (
      current.save.sessionId !== save.sessionId ||
      normalizedIdentity(current.save.student) !== normalizedIdentity(save.student)
    ) {
      throw new Error('FRESH_ATTEMPT_IDENTITY_CONFLICT');
    }
    await assertGradedAttemptDurablyRepresented(transaction, current);
    await attemptStore.put(
      { ...current, storageRevision: current.storageRevision + 1, resumeVisible: false },
      current.attemptId,
    );
  } else if (visibleRecords.length > 0) {
    throw new Error('ACTIVE_ATTEMPT_POINTER_MISMATCH');
  }
  const nextMeta: ActiveAttemptMetaV1 = {
    kind: 'active-attempt',
    recordVersion: 1,
    attemptId: save.attemptId,
    generation: currentMeta.generation + 1,
    updatedAt: Date.now(),
  };
  const record: AttemptRecordV1 = {
    recordVersion: 1,
    attemptId: save.attemptId,
    storageRevision: 1,
    resumeVisible: true,
    save: clone(save),
  };
  await attemptStore.put(record, save.attemptId);
  await transaction.objectStore('meta').put(nextMeta, ACTIVE_ATTEMPT_META_KEY);
  await transaction.done;
  return clone(record);
}

async function resumeDecisionInTransaction(
  transaction: IDBPTransaction<CellGameDbV2, ['attempts', 'meta'], 'readonly' | 'readwrite'>,
  student: StudentProfile,
): Promise<ResumeDecision> {
  const records = await transaction.objectStore('attempts').getAll();
  if (records.some((record) => !validAttemptRecord(record))) {
    return { kind: 'blocked', code: 'CORRUPT_ATTEMPT_STORE' };
  }
  const visible = records.filter((record) => record.resumeVisible);
  if (visible.length > 1) return { kind: 'multiple' };
  const current = await activeMeta(
    transaction as unknown as IDBPTransaction<CellGameDbV2, ['meta'], 'readonly' | 'readwrite'>,
  );
  if (visible.length === 0) {
    return current.attemptId === null
      ? { kind: 'none' }
      : { kind: 'blocked', code: 'ACTIVE_ATTEMPT_POINTER_MISMATCH' };
  }
  const record = visible[0];
  if (current.attemptId !== record.attemptId) {
    return { kind: 'blocked', code: 'ACTIVE_ATTEMPT_POINTER_MISMATCH' };
  }
  const sameIdentity = normalizedIdentity(record.save.student) === normalizedIdentity(student);
  if (sameIdentity && resumeEligible(record.save)) return { kind: 'one', save: clone(record.save) };
  return { kind: 'handoff', generation: current.generation };
}

export async function resumeAttemptV3(student: StudentProfile): Promise<ActiveAttemptMetaV1> {
  const operationEpoch = persistenceEpoch;
  const db = await openCellGameDatabase();
  if (operationEpoch !== persistenceEpoch) throw new Error('PERSISTENCE_RESET');
  const transaction = db.transaction(['attempts', 'meta'], 'readwrite');
  const decision = await resumeDecisionInTransaction(transaction, student);
  if (decision.kind !== 'one')
    throw new Error(`ATTEMPT_NOT_RESUMABLE_${decision.kind.toUpperCase()}`);
  const current = await activeMeta(
    transaction as unknown as IDBPTransaction<CellGameDbV2, ['meta'], 'readwrite'>,
  );
  const next: ActiveAttemptMetaV1 = {
    kind: 'active-attempt',
    recordVersion: 1,
    attemptId: decision.save.attemptId,
    generation: current.generation + 1,
    updatedAt: Date.now(),
  };
  await transaction.objectStore('meta').put(next, ACTIVE_ATTEMPT_META_KEY);
  await transaction.done;
  return clone(next);
}

type NewStudentHandoffTransaction = IDBPTransaction<
  CellGameDbV2,
  ['attempts', 'meta', 'submissionQueue', 'receipts'],
  'readwrite'
>;

async function clearCurrentAttemptForNewStudent(
  transaction: NewStudentHandoffTransaction,
  current: ActiveAttemptMetaV1,
): Promise<void> {
  if (current.attemptId) {
    const attemptStore = transaction.objectStore('attempts');
    const record = await attemptStore.get(current.attemptId);
    if (!validAttemptRecord(record)) throw new Error('CORRUPT_ACTIVE_ATTEMPT');
    await assertGradedAttemptDurablyRepresented(transaction, record);
    await attemptStore.put(
      { ...record, storageRevision: record.storageRevision + 1, resumeVisible: false },
      record.attemptId,
    );
  }
  const next: ActiveAttemptMetaV1 = {
    kind: 'active-attempt',
    recordVersion: 1,
    attemptId: null,
    generation: current.generation + 1,
    updatedAt: Date.now(),
  };
  await transaction.objectStore('meta').put(next, ACTIVE_ATTEMPT_META_KEY);
}

export async function hideActiveAttemptForNewStudent(expectedAttemptId: string): Promise<boolean> {
  const operationEpoch = persistenceEpoch;
  const db = await openCellGameDatabase();
  if (operationEpoch !== persistenceEpoch) throw new Error('PERSISTENCE_RESET');
  const transaction = db.transaction(
    ['attempts', 'meta', 'submissionQueue', 'receipts'],
    'readwrite',
  );
  const current = await activeMeta(
    transaction as unknown as IDBPTransaction<CellGameDbV2, ['meta'], 'readwrite'>,
  );
  if (expectedAttemptId && current.attemptId !== expectedAttemptId) {
    await transaction.done;
    return false;
  }
  await clearCurrentAttemptForNewStudent(transaction, current);
  await transaction.done;
  return true;
}

export async function confirmNewStudentHandoff(expectedGeneration: number): Promise<boolean> {
  const operationEpoch = persistenceEpoch;
  const db = await openCellGameDatabase();
  if (operationEpoch !== persistenceEpoch) throw new Error('PERSISTENCE_RESET');
  const transaction = db.transaction(
    ['attempts', 'meta', 'submissionQueue', 'receipts'],
    'readwrite',
  );
  const current = await activeMeta(
    transaction as unknown as IDBPTransaction<CellGameDbV2, ['meta'], 'readwrite'>,
  );
  if (current.attemptId === null || current.generation !== expectedGeneration) {
    await transaction.done;
    return false;
  }
  await clearCurrentAttemptForNewStudent(transaction, current);
  await transaction.done;
  return true;
}

export async function loadAttemptV3(attemptId: string): Promise<AttemptRecordV1 | null> {
  const raw = await (await openCellGameDatabase()).get('attempts', attemptId);
  if (raw === undefined) return null;
  if (!validAttemptRecord(raw)) throw new Error('CORRUPT_ATTEMPT_RECORD');
  return clone(raw);
}

function resumeEligible(save: SaveEnvelopeV3): boolean {
  return save.submissionStatus !== 'accepted' && save.submissionStatus !== 'duplicate';
}

export async function findResumeDecision(student: StudentProfile): Promise<ResumeDecision> {
  const transaction = (await openCellGameDatabase()).transaction(['attempts', 'meta'], 'readonly');
  const decision = await resumeDecisionInTransaction(transaction, student);
  await transaction.done;
  return decision;
}

export async function classifyLegacyLocalSave() {
  const raw = await (await openCellGameDatabase()).get('saves', ACTIVE_SAVE_KEY);
  if (raw === undefined) return { kind: 'none' } as const;
  return classifyPersistedSave(raw, contractWorld);
}

export async function probePersistenceHealth(timeoutMs = 3_000): Promise<PersistenceHealth> {
  const checkedAt = Date.now();
  const nonce = randomId();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = (async () => {
      const db = await openCellGameDatabase();
      const transaction = db.transaction('meta', 'readwrite');
      await transaction
        .objectStore('meta')
        .put(
          { kind: 'health-probe', recordVersion: 1, nonce, createdAt: checkedAt },
          HEALTH_PROBE_META_KEY,
        );
      const readback = await transaction.objectStore('meta').get(HEALTH_PROBE_META_KEY);
      if (readback?.kind !== 'health-probe' || readback.nonce !== nonce) {
        throw new Error('INDEXED_DB_HEALTH_MISMATCH');
      }
      await transaction.objectStore('meta').delete(HEALTH_PROBE_META_KEY);
      await transaction.done;
    })();
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('INDEXED_DB_HEALTH_TIMEOUT')), timeoutMs);
      }),
    ]);
    return { state: 'ready', checkedAt };
  } catch (error) {
    const blocked = wasCellDatabaseOpenBlocked();
    closeCellGameDatabase();
    return {
      state: 'unavailable',
      code: blocked
        ? 'INDEXED_DB_UPGRADE_BLOCKED'
        : error instanceof Error
          ? error.message
          : 'INDEXED_DB_UNAVAILABLE',
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

interface PendingSaveBatch {
  save: SaveEnvelopeV3;
  waiters: Array<{
    resolve: (result: SaveCommitResult) => void;
    reject: (error: unknown) => void;
  }>;
}

export class SaveCoordinator {
  private pending: PendingSaveBatch | null = null;
  private running = false;
  private storageRevision: number;
  private readonly idleWaiters: Array<() => void> = [];
  private statusValue: SaveStatus;
  private finalization: {
    save: SaveEnvelopeV3;
    payload: ClientSubmissionPayloadV2;
    promise: Promise<SaveEnvelopeV3>;
  } | null = null;

  private constructor(
    private readonly attemptId: string,
    private readonly generation: number,
    private readonly epoch: number,
    storageRevision: number,
    savedAt: number,
    private requestedHighWater: SaveEnvelopeV3,
    private readonly onStatus?: (status: SaveStatus) => void,
  ) {
    this.storageRevision = storageRevision;
    this.statusValue = { state: 'saved', storageRevision, savedAt };
  }

  static async create(
    attemptId: string,
    onStatus?: (status: SaveStatus) => void,
  ): Promise<SaveCoordinator> {
    const [record, meta] = await Promise.all([loadAttemptV3(attemptId), activeMeta()]);
    if (!record || meta.attemptId !== attemptId) throw new Error('ATTEMPT_NOT_ACTIVE');
    return new SaveCoordinator(
      attemptId,
      meta.generation,
      persistenceEpoch,
      record.storageRevision,
      record.save.savedAt,
      clone(record.save),
      onStatus,
    );
  }

  get status(): SaveStatus {
    return clone(this.statusValue);
  }

  requestSave(save: SaveEnvelopeV3): Promise<SaveCommitResult> {
    if (this.epoch !== persistenceEpoch) {
      return Promise.reject(new Error('PERSISTENCE_RESET'));
    }
    if (save.attemptId !== this.attemptId) {
      return Promise.reject(new Error('SAVE_ATTEMPT_MISMATCH'));
    }
    if (this.finalization) {
      return Promise.reject(new Error('ATTEMPT_FINALIZATION_IN_PROGRESS'));
    }
    try {
      assertValidSave(save);
      assertSaveContinuity(this.requestedHighWater, save);
    } catch (error) {
      return Promise.reject(error);
    }
    this.requestedHighWater = clone(save);
    this.setStatus({ state: 'dirty' });
    const promise = new Promise<SaveCommitResult>((resolve, reject) => {
      if (this.pending) {
        this.pending.save = clone(save);
        this.pending.waiters.push({ resolve, reject });
      } else {
        this.pending = { save: clone(save), waiters: [{ resolve, reject }] };
      }
    });
    queueMicrotask(() => void this.drain());
    return promise;
  }

  async flush(): Promise<void> {
    if (!this.running && !this.pending) return;
    await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  finalizeAndQueue(
    save: SaveEnvelopeV3,
    payload: ClientSubmissionPayloadV2,
    now = Date.now(),
  ): Promise<SaveEnvelopeV3> {
    if (this.finalization) {
      return valuesEqual(this.finalization.save, save) &&
        valuesEqual(this.finalization.payload, payload)
        ? this.finalization.promise
        : Promise.reject(new Error('ATTEMPT_FINALIZATION_CONFLICT'));
    }
    const promise = this.runFinalization(save, payload, now).catch((error) => {
      this.finalization = null;
      throw error;
    });
    this.finalization = { save: clone(save), payload: clone(payload), promise };
    return promise;
  }

  private async runFinalization(
    save: SaveEnvelopeV3,
    payload: ClientSubmissionPayloadV2,
    now: number,
  ): Promise<SaveEnvelopeV3> {
    if (this.epoch !== persistenceEpoch) throw new Error('PERSISTENCE_RESET');
    if (save.attemptId !== this.attemptId) throw new Error('SAVE_ATTEMPT_MISMATCH');
    assertValidSave(save);
    assertSaveContinuity(this.requestedHighWater, save);
    if (!save.gradedSnapshot || save.submissionStatus !== 'idle') {
      throw new Error('ATTEMPT_FINALIZATION_REQUIRES_IDLE_GRADE');
    }
    await this.flush();
    const storageRevision = this.storageRevision + 1;
    await prepareSubmissionV2(save, payload, this.generation, storageRevision, now);
    const queuedSave: SaveEnvelopeV3 = {
      ...clone(save),
      submissionStatus: 'queued',
      savedAt: now,
    };
    this.storageRevision = storageRevision;
    this.requestedHighWater = clone(queuedSave);
    this.setStatus({ state: 'saved', storageRevision, savedAt: now });
    return queuedSave;
  }

  private setStatus(status: SaveStatus): void {
    this.statusValue = status;
    this.onStatus?.(clone(status));
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.pending) {
      const batch = this.pending;
      this.pending = null;
      const requestedStorageRevision = this.storageRevision + 1;
      this.setStatus({ state: 'saving', requestedStorageRevision });
      try {
        if (this.epoch !== persistenceEpoch) throw new Error('PERSISTENCE_RESET');
        const db = await openCellGameDatabase();
        const transaction = db.transaction(['attempts', 'meta'], 'readwrite');
        const result = await putAttemptInTransaction(
          transaction,
          batch.save,
          requestedStorageRevision,
          this.generation,
        );
        await transaction.done;
        if (this.epoch !== persistenceEpoch) throw new Error('PERSISTENCE_RESET');
        this.storageRevision = Math.max(this.storageRevision, result.storageRevision);
        if (result.status === 'stale') throw new Error('STALE_STORAGE_REVISION');
        this.setStatus({
          state: 'saved',
          storageRevision: result.storageRevision,
          savedAt: result.savedAt,
        });
        batch.waiters.forEach(({ resolve }) => resolve(result));
      } catch (error) {
        const code = error instanceof Error ? error.message : 'SAVE_FAILED';
        this.setStatus({ state: 'failed', code });
        batch.waiters.forEach(({ reject }) => reject(error));
      }
    }
    this.running = false;
    this.idleWaiters.splice(0).forEach((resolve) => resolve());
  }
}

function payloadMatchesGrade(save: SaveEnvelopeV3, payload: ClientSubmissionPayloadV2): boolean {
  const grade = save.gradedSnapshot;
  if (!grade) return false;
  const outcomeMatches =
    payload.completed === (grade.outcome === 'complete') &&
    payload.early === (grade.outcome === 'early') &&
    payload.timeout === (grade.outcome === 'timeout');
  return (
    payload.attemptId === save.attemptId &&
    payload.sessionId === save.sessionId &&
    payload.assignmentId === save.assignmentId &&
    payload.assignmentVersion === save.assignmentVersion &&
    payload.gameVersion === save.gameVersion &&
    normalizedIdentity({
      firstName: payload.firstName,
      lastInitial: payload.lastInitial,
      period: payload.period,
    }) === normalizedIdentity(save.student) &&
    outcomeMatches &&
    payload.activeTimeSeconds ===
      (grade.outcome === 'timeout'
        ? ASSIGNMENT.durationSeconds
        : Math.floor(grade.activeElapsedMs / 1000)) &&
    valuesEqual(payload.objectives, grade.objectives) &&
    valuesEqual(payload.hintsUsed, grade.hintsUsed)
  );
}

type GradedDurabilityTransaction = IDBPTransaction<
  CellGameDbV2,
  ['attempts', 'meta', 'submissionQueue', 'receipts'],
  'readwrite'
>;

async function assertGradedAttemptDurablyRepresented(
  transaction: GradedDurabilityTransaction,
  record: AttemptRecordV1,
): Promise<void> {
  if (record.save.gradedSnapshot === null) return;
  const localKey = v2LocalKey(record.attemptId);
  if (record.save.submissionStatus === 'queued') {
    const queued = await transaction.objectStore('submissionQueue').get(localKey);
    if (!validPendingSubmissionV2(queued) || !payloadMatchesGrade(record.save, queued.payload)) {
      throw new Error('GRADED_ATTEMPT_NOT_DURABLY_QUEUED');
    }
    return;
  }
  if (['accepted', 'duplicate', 'rejected'].includes(record.save.submissionStatus)) {
    const receipt = await transaction.objectStore('receipts').get(localKey);
    if (
      !validSubmissionReceipt(receipt, record.attemptId) ||
      receipt.status !== record.save.submissionStatus
    ) {
      throw new Error('GRADED_ATTEMPT_NOT_DURABLY_SETTLED');
    }
    return;
  }
  throw new Error('GRADED_ATTEMPT_NOT_READY_FOR_REPLACEMENT');
}

export async function prepareSubmissionV2(
  save: SaveEnvelopeV3,
  payload: ClientSubmissionPayloadV2,
  expectedGeneration: number,
  storageRevision: number,
  now = Date.now(),
): Promise<void> {
  const operationEpoch = persistenceEpoch;
  if (!validateClientSubmissionPayloadV2(payload) || !payloadMatchesGrade(save, payload)) {
    throw new Error('SUBMISSION_DOES_NOT_MATCH_GRADE');
  }
  const queuedSave: SaveEnvelopeV3 = {
    ...clone(save),
    submissionStatus: 'queued',
    savedAt: now,
  };
  assertValidSave(queuedSave);
  const db = await openCellGameDatabase();
  if (operationEpoch !== persistenceEpoch) throw new Error('PERSISTENCE_RESET');
  const transaction = db.transaction(
    ['attempts', 'meta', 'submissionQueue', 'receipts'],
    'readwrite',
  );
  const localKey = v2LocalKey(payload.attemptId);
  const existingReceipt = await transaction.objectStore('receipts').get(localKey);
  if (existingReceipt) {
    if (!validSubmissionReceipt(existingReceipt, payload.attemptId))
      throw new Error('CORRUPT_RECEIPT_RECORD');
    throw new Error('SUBMISSION_ALREADY_SETTLED');
  }
  const existingQueue = await transaction.objectStore('submissionQueue').get(localKey);
  if (existingQueue) {
    if (!validPendingSubmissionV2(existingQueue) || !valuesEqual(existingQueue.payload, payload)) {
      throw new Error('LOCAL_IDEMPOTENCY_CONFLICT');
    }
  }
  const result = await putAttemptInTransaction(
    transaction as unknown as IDBPTransaction<CellGameDbV2, ['attempts', 'meta'], 'readwrite'>,
    queuedSave,
    storageRevision,
    expectedGeneration,
    ['idle', 'queued'],
  );
  if (result.status === 'stale') throw new Error('STALE_STORAGE_REVISION');
  const entry: PendingSubmissionV2 =
    existingQueue && validPendingSubmissionV2(existingQueue)
      ? existingQueue
      : {
          contractVersion: 2,
          payload: clone(payload),
          queuedAt: now,
          attempts: 0,
          nextAttemptAt: now,
          lease: null,
        };
  await transaction.objectStore('submissionQueue').put(entry, localKey);
  await transaction.done;
}

export async function queuedSubmissionsV2(): Promise<PendingSubmissionV2[]> {
  const transaction = (await openCellGameDatabase()).transaction('submissionQueue', 'readonly');
  const store = transaction.objectStore('submissionQueue');
  const [keys, records] = await Promise.all([store.getAllKeys(), store.getAll()]);
  assertQueueRecordsSafe(keys, records);
  await transaction.done;
  return records.filter(validPendingSubmissionV2).map(clone);
}

export async function claimNextSubmissionLease(
  ownerId: string,
  now = Date.now(),
  leaseMs = 15_000,
): Promise<SubmissionLeaseClaim | null> {
  if (!ownerId || !Number.isFinite(now) || !Number.isFinite(leaseMs) || leaseMs < 1) {
    throw new Error('INVALID_LEASE_REQUEST');
  }
  const db = await openCellGameDatabase();
  const transaction = db.transaction(['submissionQueue', 'receipts'], 'readwrite');
  const queueStore = transaction.objectStore('submissionQueue');
  const [allKeys, allRecords] = await Promise.all([queueStore.getAllKeys(), queueStore.getAll()]);
  assertQueueRecordsSafe(allKeys, allRecords);
  const records = allRecords
    .filter(validPendingSubmissionV2)
    .sort(
      (left, right) =>
        left.queuedAt - right.queuedAt ||
        left.payload.attemptId.localeCompare(right.payload.attemptId),
    );
  for (const entry of records) {
    const localKey = v2LocalKey(entry.payload.attemptId);
    const existingReceipt = await transaction.objectStore('receipts').get(localKey);
    if (existingReceipt) {
      if (!validSubmissionReceipt(existingReceipt, entry.payload.attemptId)) {
        throw new Error('CORRUPT_RECEIPT_RECORD');
      }
      await queueStore.delete(localKey);
      continue;
    }
    // Expired leases may be reclaimed. A device-clock jump can make that happen
    // while an abort-ignoring transport is still alive, so server idempotency
    // remains the final duplicate-send containment boundary.
    if (entry.nextAttemptAt > now || (entry.lease && entry.lease.expiresAt > now)) continue;
    const token = randomId();
    const claimed: PendingSubmissionV2 = {
      ...entry,
      lease: { ownerId, token, expiresAt: now + leaseMs },
    };
    await queueStore.put(claimed, localKey);
    await transaction.done;
    return { entry: clone(claimed), token };
  }
  await transaction.done;
  return null;
}

export async function settleSubmissionLease(
  ownerId: string,
  token: string,
  receipt: SubmissionReceipt,
): Promise<boolean> {
  if (!validSubmissionReceipt(receipt)) throw new Error('INVALID_RECEIPT');
  const db = await openCellGameDatabase();
  const transaction = db.transaction(
    ['attempts', 'meta', 'submissionQueue', 'receipts'],
    'readwrite',
  );
  const queueStore = transaction.objectStore('submissionQueue');
  const localKey = v2LocalKey(receipt.attemptId);
  const entry = await queueStore.get(localKey);
  const existingReceipt = await transaction.objectStore('receipts').get(localKey);
  if (existingReceipt) {
    if (!validSubmissionReceipt(existingReceipt, receipt.attemptId))
      throw new Error('CORRUPT_RECEIPT_RECORD');
    if (!valuesEqual(existingReceipt, receipt)) throw new Error('RECEIPT_CONFLICT');
    if (entry && !validPendingSubmissionV2(entry)) throw new Error('CORRUPT_SUBMISSION_QUEUE');
    if (entry) await queueStore.delete(localKey);
    await transaction.done;
    return true;
  }
  if (entry !== undefined && !validPendingSubmissionV2(entry)) {
    throw new Error('CORRUPT_SUBMISSION_QUEUE');
  }
  if (!entry || entry.lease?.ownerId !== ownerId || entry.lease.token !== token) {
    await transaction.done;
    return false;
  }
  const attempt = await transaction.objectStore('attempts').get(receipt.attemptId);
  if (!validAttemptRecord(attempt)) throw new Error('RECEIPT_ATTEMPT_MISSING');
  if (attempt.save.submissionStatus !== 'queued') {
    throw new Error('SUBMISSION_NOT_QUEUED');
  }
  const nextSave: SaveEnvelopeV3 = {
    ...attempt.save,
    submissionStatus: receipt.status,
    savedAt: Math.max(Date.now(), attempt.save.savedAt),
  };
  assertValidSave(nextSave);
  await transaction.objectStore('attempts').put(
    {
      ...attempt,
      storageRevision: attempt.storageRevision + 1,
      resumeVisible: receipt.status === 'rejected',
      save: nextSave,
    },
    receipt.attemptId,
  );
  await transaction.objectStore('receipts').put(clone(receipt), localKey);
  await queueStore.delete(localKey);
  if (receipt.status !== 'rejected') {
    const meta = await activeMeta(
      transaction as unknown as IDBPTransaction<CellGameDbV2, ['meta'], 'readwrite'>,
    );
    if (meta.attemptId === receipt.attemptId) {
      await transaction.objectStore('meta').put(
        {
          ...meta,
          attemptId: null,
          generation: meta.generation + 1,
          updatedAt: Math.max(Date.now(), meta.updatedAt),
        },
        ACTIVE_ATTEMPT_META_KEY,
      );
    }
  }
  await transaction.done;
  return true;
}

export async function releaseSubmissionLeaseAfterFailure(
  ownerId: string,
  token: string,
  attemptId: string,
  now = Date.now(),
  errorCode = 'DELIVERY_FAILED',
): Promise<boolean> {
  if (!SAFE_DELIVERY_ERROR_CODES.has(errorCode)) errorCode = 'DELIVERY_FAILED';
  const db = await openCellGameDatabase();
  const transaction = db.transaction(['submissionQueue', 'receipts'], 'readwrite');
  const localKey = v2LocalKey(attemptId);
  const existingReceipt = await transaction.objectStore('receipts').get(localKey);
  if (existingReceipt) {
    if (!validSubmissionReceipt(existingReceipt, attemptId)) {
      throw new Error('CORRUPT_RECEIPT_RECORD');
    }
    await transaction.objectStore('submissionQueue').delete(localKey);
    await transaction.done;
    return false;
  }
  const entry = await transaction.objectStore('submissionQueue').get(localKey);
  if (entry !== undefined && !validPendingSubmissionV2(entry)) {
    throw new Error('CORRUPT_SUBMISSION_QUEUE');
  }
  if (!entry || entry.lease?.ownerId !== ownerId || entry.lease.token !== token) {
    await transaction.done;
    return false;
  }
  const attempts = entry.attempts + 1;
  const delay = Math.min(60_000, 1_000 * 2 ** Math.min(attempts - 1, 6));
  const retainLeaseUntilExpiry =
    errorCode === 'SUBMISSION_TIMEOUT' || errorCode === 'SUBMISSION_ABORTED';
  await transaction.objectStore('submissionQueue').put(
    {
      ...entry,
      attempts,
      nextAttemptAt: now + delay,
      lastError: errorCode,
      lease: retainLeaseUntilExpiry ? entry.lease : null,
    },
    localKey,
  );
  await transaction.done;
  return true;
}

export class SubmissionReplayCoordinator {
  private readonly replayToken = Symbol('submission-replay');
  private replayPromise: Promise<SubmissionReceipt[]> | null = null;
  private abortController: AbortController | null = null;
  private stopped = false;

  constructor(
    private readonly ownerId = randomId(),
    private readonly now: () => number = Date.now,
    private readonly transportTimeoutMs = DEFAULT_TRANSPORT_TIMEOUT_MS,
    private readonly leaseMs = DEFAULT_LEASE_MS,
  ) {
    if (transportTimeoutMs < 1 || leaseMs <= transportTimeoutMs) {
      throw new Error('INVALID_REPLAY_DEADLINE');
    }
    replayWorkers.add(this);
  }

  replay(transport: SubmissionTransport): Promise<SubmissionReceipt[]> {
    if (sharedReplayPromise) return sharedReplayPromise;
    if (this.stopped) return Promise.resolve([]);
    const workerEpoch = replayEpoch;
    this.abortController = new AbortController();
    this.replayPromise = this.run(transport, this.abortController.signal, workerEpoch).finally(
      () => {
        this.replayPromise = null;
        this.abortController = null;
        if (sharedReplayToken === this.replayToken) {
          sharedReplayPromise = null;
          sharedReplayToken = null;
        }
      },
    );
    sharedReplayToken = this.replayToken;
    sharedReplayPromise = this.replayPromise;
    return this.replayPromise;
  }

  stop(): void {
    this.stopped = true;
    this.abortController?.abort();
  }

  dispose(): void {
    this.stop();
    replayWorkers.delete(this);
  }

  private async run(
    transport: SubmissionTransport,
    signal: AbortSignal,
    workerEpoch: number,
  ): Promise<SubmissionReceipt[]> {
    const receipts: SubmissionReceipt[] = [];
    while (!signal.aborted && workerEpoch === replayEpoch) {
      const claim = await claimNextSubmissionLease(this.ownerId, this.now(), this.leaseMs);
      if (!claim) break;
      const attemptId = claim.entry.payload.attemptId;
      try {
        const receipt = await this.deliverWithDeadline(transport, claim.entry.payload, signal);
        if (workerEpoch !== replayEpoch) break;
        if (!validSubmissionReceipt(receipt, attemptId)) {
          throw new SubmissionTransportError(true, 'INVALID_UPSTREAM_RECEIPT');
        }
        if (await settleSubmissionLease(this.ownerId, claim.token, receipt)) receipts.push(receipt);
      } catch (error) {
        if (workerEpoch === replayEpoch) {
          await releaseSubmissionLeaseAfterFailure(
            this.ownerId,
            claim.token,
            attemptId,
            this.now(),
            safeDeliveryErrorCode(error),
          );
        }
      }
    }
    return receipts;
  }

  private async deliverWithDeadline(
    transport: SubmissionTransport,
    payload: ClientSubmissionPayloadV2,
    parentSignal: AbortSignal,
  ): Promise<SubmissionReceipt> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let removeAbortListener: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      const abort = () => {
        controller.abort();
        reject(new SubmissionTransportError(true, 'SUBMISSION_ABORTED'));
      };
      if (parentSignal.aborted) {
        abort();
      } else {
        parentSignal.addEventListener('abort', abort, { once: true });
        removeAbortListener = () => parentSignal.removeEventListener('abort', abort);
      }
      timeout = setTimeout(() => {
        controller.abort();
        reject(new SubmissionTransportError(true, 'SUBMISSION_TIMEOUT'));
      }, this.transportTimeoutMs);
    });
    try {
      return await Promise.race([transport(payload, controller.signal), interrupted]);
    } finally {
      if (timeout) clearTimeout(timeout);
      removeAbortListener();
    }
  }
}

export function stopAllSubmissionReplay(): void {
  replayEpoch += 1;
  replayWorkers.forEach((worker) => worker.stop());
  sharedReplayPromise = null;
  sharedReplayToken = null;
}

export async function localDataCounts(): Promise<LocalDataCounts> {
  const db = await openCellGameDatabase();
  return {
    legacySaves: await db.count('saves'),
    attempts: await db.count('attempts'),
    queuedSubmissions: await db.count('submissionQueue'),
    receipts: await db.count('receipts'),
  };
}

export async function teacherDeviceResetAllLocalData(confirmation: string): Promise<void> {
  if (confirmation !== TEACHER_RESET_CONFIRMATION) {
    throw new Error('TEACHER_RESET_CONFIRMATION_MISMATCH');
  }
  persistenceEpoch += 1;
  stopAllSubmissionReplay();
  const db = await openCellGameDatabase();
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
  ]);
  await transaction.done;
}

export async function exportV3Diagnostic(): Promise<string> {
  const db = await openCellGameDatabase();
  const records = await db.getAll('attempts');
  const queueTransaction = db.transaction('submissionQueue', 'readonly');
  const queueStore = queueTransaction.objectStore('submissionQueue');
  const [queueKeys, queue] = await Promise.all([queueStore.getAllKeys(), queueStore.getAll()]);
  await queueTransaction.done;
  const safe = {
    generatedAt: new Date().toISOString(),
    databaseVersion: 2,
    attempts: records.map((record) =>
      validAttemptRecord(record)
        ? {
            classification: 'current-v3',
            storageRevision: record.storageRevision,
            schemaVersion: record.save.schemaVersion,
            gameVersion: record.save.gameVersion,
            missionRevision: record.save.voxelMission.revision,
            submissionStatus: record.save.submissionStatus,
          }
        : { classification: 'corrupt-v3' },
    ),
    queue: queue.map((entry, index) =>
      validPendingSubmissionV2(entry) && queueRecordKeyMatches(queueKeys[index], entry)
        ? {
            classification: 'current-v2-queue',
            contractVersion: entry.contractVersion,
            attempts: entry.attempts,
            leased: entry.lease !== null,
          }
        : validLegacyPendingSubmission(entry) && queueRecordKeyMatches(queueKeys[index], entry)
          ? { classification: 'legacy-v1' }
          : entry && typeof entry === 'object' && 'contractVersion' in entry
            ? { classification: 'corrupt-v2-queue' }
            : { classification: 'corrupt-or-unsupported-queue' },
    ),
  };
  return JSON.stringify(safe, null, 2);
}
