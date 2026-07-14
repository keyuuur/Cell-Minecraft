import type { ScoreBreakdown, SubmissionPayload } from '../src/types/game';

const ALLOWED_ASSIGNMENTS = new Set(['build-a-living-cell-unit1']);
const MAX_BODY_BYTES = 24_000;
const FORMULA_PREFIX = /^[=+\-@]/;
// Sheet cells must not retain ASCII control characters from untrusted input.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

export class ValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function validateContentLength(value: string | undefined): void {
  if (value && Number(value) > MAX_BODY_BYTES) throw new ValidationError('PAYLOAD_TOO_LARGE');
}

export function validatePayloadSize(value: unknown): void {
  const bytes = new TextEncoder().encode(
    typeof value === 'string' ? value : JSON.stringify(value),
  ).byteLength;
  if (bytes > MAX_BODY_BYTES) throw new ValidationError('PAYLOAD_TOO_LARGE');
}

export function sanitizeSheetText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') throw new ValidationError('INVALID_TEXT');
  const normalized = value.trim().replace(CONTROL_CHARACTERS, '').slice(0, maxLength);
  return FORMULA_PREFIX.test(normalized) ? `'${normalized}` : normalized;
}

function rawText(value: unknown, maxLength: number, pattern?: RegExp): string {
  if (typeof value !== 'string') throw new ValidationError('INVALID_TEXT');
  const text = value.trim();
  if (!text || text.length > maxLength || (pattern && !pattern.test(text))) {
    throw new ValidationError('INVALID_TEXT');
  }
  return text;
}

function finiteNumber(value: unknown, min: number, max: number, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new ValidationError('INVALID_NUMBER');
  }
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ValidationError('INVALID_BOOLEAN');
  return value;
}

export function validateSubmission(input: unknown): SubmissionPayload {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('INVALID_PAYLOAD');
  }
  const raw = input as Record<string, unknown>;
  const assignmentId = rawText(raw.assignmentId, 64, /^[a-z0-9-]+$/);
  if (!ALLOWED_ASSIGNMENTS.has(assignmentId)) throw new ValidationError('UNKNOWN_ASSIGNMENT');
  const firstName = sanitizeSheetText(raw.firstName, 40);
  if (!firstName) throw new ValidationError('INVALID_NAME');
  const lastInitial = rawText(raw.lastInitial, 1, /^[A-Za-z]$/).toUpperCase();
  const objectives = raw.objectives;
  if (!objectives || typeof objectives !== 'object' || Array.isArray(objectives)) {
    throw new ValidationError('INVALID_OBJECTIVES');
  }
  const cleanObjectives: Record<string, boolean | number> = {};
  const objectiveRecord = objectives as Record<string, unknown>;
  for (const key of [
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
  ]) {
    const value = objectiveRecord[key];
    cleanObjectives[key] =
      key === 'wallPanels' || key === 'membranePanels'
        ? finiteNumber(value, 0, 6, true)
        : boolean(value);
  }
  const hints = raw.hintsUsed;
  if (!hints || typeof hints !== 'object' || Array.isArray(hints)) {
    throw new ValidationError('INVALID_HINTS');
  }
  const cleanHints: Record<number, number> = {};
  for (const level of [1, 2, 3]) {
    const value = (hints as Record<string, unknown>)[String(level)] ?? 0;
    cleanHints[level] = finiteNumber(value, 0, 100, true);
  }

  const payload: SubmissionPayload = {
    firstName,
    lastInitial,
    period: finiteNumber(raw.period, 1, 7, true),
    attemptId: rawText(raw.attemptId, 64, /^[a-zA-Z0-9-]+$/),
    sessionId: rawText(raw.sessionId, 64, /^[a-zA-Z0-9-]+$/),
    assignmentId,
    assignmentVersion: finiteNumber(raw.assignmentVersion, 1, 1, true),
    gameVersion: rawText(raw.gameVersion, 24, /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/i),
    score: serverScore(cleanObjectives, boolean(raw.completed)),
    completed: boolean(raw.completed),
    early: boolean(raw.early),
    timeout: boolean(raw.timeout),
    activeTimeSeconds: finiteNumber(raw.activeTimeSeconds, 0, 15 * 60, true),
    objectives: cleanObjectives,
    hintsUsed: cleanHints,
    isTest: boolean(raw.isTest),
  };
  if ([payload.completed, payload.early, payload.timeout].filter(Boolean).length !== 1) {
    throw new ValidationError('INVALID_OUTCOME');
  }
  if (payload.completed && payload.score.total < 100)
    throw new ValidationError('IMPOSSIBLE_COMPLETION');
  return payload;
}

export function serverScore(
  objectives: Record<string, boolean | number>,
  claimedComplete: boolean,
): ScoreBreakdown {
  const wallPanels = Number(objectives.wallPanels ?? 0);
  const membranePanels = Number(objectives.membranePanels ?? 0);
  const booleanKeys = [
    'cytoplasm',
    'nucleus',
    'ribosomes',
    'mitochondria',
    'chloroplasts',
    'centralVacuole',
  ];
  const present = booleanKeys.filter((key) => objectives[key] === true).length;
  const completeWall = wallPanels === 6;
  const completeMembrane = membranePanels === 6;
  const totalPresent = present + Number(completeWall) + Number(completeMembrane);
  const boundary = round(15 * ((wallPanels + membranePanels) / 12));
  const requiredStructures = round(30 * (totalPresent / 8));
  const broadInternals = ['nucleus', 'ribosomes', 'mitochondria', 'chloroplasts'].filter(
    (key) => objectives[key] === true,
  ).length;
  const placementContext = round(
    (completeWall ? 5 : 0) + (objectives.centralVacuole ? 4 : 0) + broadInternals * 1.5,
  );
  const effectKeys = [
    'effectCellWall',
    'effectCellMembrane',
    'effectCytoplasm',
    'effectNucleus',
    'effectRibosomes',
    'effectMitochondria',
    'effectChloroplasts',
    'effectCentralVacuole',
  ];
  const activationFunctions = round(
    20 * (effectKeys.filter((key) => objectives[key] === true).length / 8),
  );
  const recovery = objectives.recoveryRestored === true;
  const drought = objectives.droughtDiagnosed === true;
  const observed = objectives.droughtObserved === true;
  const droughtRecovery = (drought ? 5 : 0) + (observed ? 5 : 0) + (recovery ? 5 : 0);
  const logicallyComplete = totalPresent === 8 && recovery;
  const effectsObserved = effectKeys.every((key) => objectives[key] === true);
  const finalStability = claimedComplete && logicallyComplete && effectsObserved ? 5 : 0;
  return {
    boundary,
    requiredStructures,
    placementContext,
    activationFunctions,
    droughtRecovery,
    finalStability,
    total: round(
      boundary +
        requiredStructures +
        placementContext +
        activationFunctions +
        droughtRecovery +
        finalStability,
    ),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
