import { calculateObjectiveScore, type ObjectiveScoreInput } from '../biology/submissionScoring';
import { validateClientSubmissionPayloadV2 } from '../contracts/missionContracts';
import { ASSIGNMENT } from '../data/assignment';
import type { PendingSubmission, PendingSubmissionV2, ScoreBreakdown } from '../types/game';

export const SAFE_DELIVERY_ERROR_CODES = new Set([
  'BACKEND_NOT_CONFIGURED',
  'BACKEND_UNAVAILABLE',
  'DELIVERY_FAILED',
  'HEADER_MISMATCH',
  'INVALID_UPSTREAM_RECEIPT',
  'NETWORK_DOWN',
  'RECEIPT_MISMATCH',
  'SERVER_BUSY',
  'SUBMISSION_ABORTED',
  'SUBMISSION_TIMEOUT',
]);

const LEGACY_OBJECTIVE_KEYS = [
  'wallPanels',
  'membranePanels',
  'cytoplasm',
  'nucleus',
  'ribosomes',
  'mitochondria',
  'chloroplasts',
  'centralVacuole',
  'droughtDiagnosed',
  'droughtObserved',
  'recoveryRestored',
  'effectCellWall',
  'effectCellMembrane',
  'effectCytoplasm',
  'effectNucleus',
  'effectRibosomes',
  'effectMitochondria',
  'effectChloroplasts',
  'effectCentralVacuole',
] as const;

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

function scoreMatches(left: ScoreBreakdown, right: ScoreBreakdown): boolean {
  return (Object.keys(left) as Array<keyof ScoreBreakdown>).every(
    (key) => left[key] === right[key],
  );
}

function validLegacySubmissionPayload(value: unknown): value is PendingSubmission['payload'] {
  if (
    !exactKeys(value, [
      'firstName',
      'lastInitial',
      'period',
      'attemptId',
      'sessionId',
      'assignmentId',
      'assignmentVersion',
      'gameVersion',
      'score',
      'completed',
      'early',
      'timeout',
      'activeTimeSeconds',
      'objectives',
      'hintsUsed',
      'isTest',
    ])
  ) {
    return false;
  }
  const payload = value as PendingSubmission['payload'];
  if (
    typeof payload.firstName !== 'string' ||
    payload.firstName.trim().length < 1 ||
    payload.firstName.length > 40 ||
    typeof payload.lastInitial !== 'string' ||
    !/^[A-Za-z]$/.test(payload.lastInitial) ||
    !Number.isInteger(payload.period) ||
    payload.period < 1 ||
    payload.period > 7 ||
    !/^[A-Za-z0-9-]{1,64}$/.test(payload.attemptId) ||
    !/^[A-Za-z0-9-]{1,64}$/.test(payload.sessionId) ||
    payload.assignmentId !== ASSIGNMENT.id ||
    payload.assignmentVersion !== ASSIGNMENT.version ||
    typeof payload.gameVersion !== 'string' ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/i.test(payload.gameVersion) ||
    !Number.isInteger(payload.activeTimeSeconds) ||
    payload.activeTimeSeconds < 0 ||
    payload.activeTimeSeconds > ASSIGNMENT.durationSeconds ||
    typeof payload.completed !== 'boolean' ||
    typeof payload.early !== 'boolean' ||
    typeof payload.timeout !== 'boolean' ||
    typeof payload.isTest !== 'boolean' ||
    [payload.completed, payload.early, payload.timeout].filter(Boolean).length !== 1 ||
    !exactKeys(payload.objectives, [...LEGACY_OBJECTIVE_KEYS]) ||
    !exactKeys(payload.hintsUsed, [], ['1', '2', '3']) ||
    !exactKeys(payload.score, [
      'boundary',
      'requiredStructures',
      'placementContext',
      'activationFunctions',
      'droughtRecovery',
      'finalStability',
      'total',
    ])
  ) {
    return false;
  }
  const objectiveRecord = payload.objectives as Record<string, unknown>;
  if (
    typeof objectiveRecord.wallPanels !== 'number' ||
    !Number.isInteger(objectiveRecord.wallPanels) ||
    objectiveRecord.wallPanels < 0 ||
    objectiveRecord.wallPanels > 6 ||
    typeof objectiveRecord.membranePanels !== 'number' ||
    !Number.isInteger(objectiveRecord.membranePanels) ||
    objectiveRecord.membranePanels < 0 ||
    objectiveRecord.membranePanels > 6 ||
    LEGACY_OBJECTIVE_KEYS.slice(2).some((key) => typeof objectiveRecord[key] !== 'boolean') ||
    Object.values(payload.hintsUsed).some(
      (count) => !Number.isInteger(count) || count < 0 || count > 100,
    )
  ) {
    return false;
  }
  const expected = calculateObjectiveScore(
    objectiveRecord as unknown as ObjectiveScoreInput,
    payload.completed,
  );
  return scoreMatches(payload.score, expected);
}

export function validLegacyPendingSubmission(value: unknown): value is PendingSubmission {
  if (!exactKeys(value, ['payload', 'queuedAt', 'attempts'], ['lastError'])) return false;
  const entry = value as Partial<PendingSubmission>;
  return (
    validLegacySubmissionPayload(entry.payload) &&
    typeof entry.queuedAt === 'number' &&
    Number.isFinite(entry.queuedAt) &&
    Number.isInteger(entry.attempts) &&
    entry.attempts! >= 0 &&
    (entry.lastError === undefined || typeof entry.lastError === 'string')
  );
}

export function validPendingSubmissionV2(value: unknown): value is PendingSubmissionV2 {
  if (
    !exactKeys(
      value,
      ['contractVersion', 'payload', 'queuedAt', 'attempts', 'nextAttemptAt', 'lease'],
      ['lastError'],
    )
  ) {
    return false;
  }
  const entry = value as Partial<PendingSubmissionV2>;
  return (
    entry.contractVersion === 2 &&
    validateClientSubmissionPayloadV2(entry.payload) &&
    typeof entry.queuedAt === 'number' &&
    Number.isFinite(entry.queuedAt) &&
    Number.isInteger(entry.attempts) &&
    entry.attempts! >= 0 &&
    typeof entry.nextAttemptAt === 'number' &&
    Number.isFinite(entry.nextAttemptAt) &&
    (entry.lastError === undefined || SAFE_DELIVERY_ERROR_CODES.has(entry.lastError)) &&
    (entry.lease === null ||
      (exactKeys(entry.lease, ['ownerId', 'token', 'expiresAt']) &&
        typeof entry.lease?.ownerId === 'string' &&
        entry.lease.ownerId.length >= 1 &&
        entry.lease.ownerId.length <= 128 &&
        typeof entry.lease.token === 'string' &&
        entry.lease.token.length >= 1 &&
        entry.lease.token.length <= 128 &&
        typeof entry.lease.expiresAt === 'number' &&
        Number.isFinite(entry.lease.expiresAt) &&
        entry.lease.expiresAt >= 0))
  );
}

export function v2LocalKey(attemptId: string): string {
  return `v2:${attemptId}`;
}

export function queueRecordKeyMatches(key: IDBValidKey, record: unknown): boolean {
  if (typeof key !== 'string') return false;
  if (validPendingSubmissionV2(record)) return key === v2LocalKey(record.payload.attemptId);
  if (validLegacyPendingSubmission(record)) return key === record.payload.attemptId;
  return false;
}

export function assertQueueRecordsSafe(keys: IDBValidKey[], records: unknown[]): void {
  if (
    keys.length !== records.length ||
    records.some((record, index) => !queueRecordKeyMatches(keys[index], record))
  ) {
    throw new Error('CORRUPT_SUBMISSION_QUEUE');
  }
}
