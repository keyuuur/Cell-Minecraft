import { GAME_VERSION } from '../data/assignment';
import { queueSubmission, queuedSubmissions, recordReceipt } from '../persistence/db';
import type { SaveEnvelope, SubmissionPayload, SubmissionReceipt } from '../types/game';

export function payloadFromSave(
  save: SaveEnvelope,
  options: { early: boolean; timeout: boolean; isTest: boolean },
): SubmissionPayload {
  return {
    firstName: save.student.firstName,
    lastInitial: save.student.lastInitial,
    period: save.student.period,
    attemptId: save.attemptId,
    sessionId: save.sessionId,
    assignmentId: save.assignmentId,
    assignmentVersion: save.assignmentVersion,
    gameVersion: GAME_VERSION,
    score: save.score,
    completed: save.mission.completed,
    early: options.early,
    timeout: options.timeout,
    activeTimeSeconds: Math.round(save.activeElapsedMs / 1000),
    objectives: {
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
    },
    hintsUsed: save.hintsUsed,
    isTest: options.isTest,
  };
}

export async function submitOrQueue(payload: SubmissionPayload): Promise<SubmissionReceipt | null> {
  const entry = { payload, queuedAt: Date.now(), attempts: 0 };
  await queueSubmission(entry);
  try {
    const receipt = await sendSubmission(payload);
    await recordReceipt(receipt);
    return receipt;
  } catch (error) {
    if (error instanceof SubmissionHttpError && !error.retryable && error.receipt) {
      await recordReceipt(error.receipt);
      return error.receipt;
    }
    return null;
  }
}

export async function replaySubmissionQueue(): Promise<SubmissionReceipt[]> {
  const receipts: SubmissionReceipt[] = [];
  for (const entry of await queuedSubmissions()) {
    try {
      const receipt = await sendSubmission(entry.payload);
      await recordReceipt(receipt);
      receipts.push(receipt);
    } catch (error) {
      if (error instanceof SubmissionHttpError && !error.retryable && error.receipt) {
        await recordReceipt(error.receipt);
        receipts.push(error.receipt);
        continue;
      }
      await queueSubmission({
        ...entry,
        attempts: entry.attempts + 1,
        lastError: 'Delivery failed. The saved result will retry on this device.',
      });
    }
  }
  return receipts;
}

class SubmissionHttpError extends Error {
  constructor(
    public readonly retryable: boolean,
    public readonly receipt?: SubmissionReceipt,
  ) {
    super(receipt?.errorCode ?? 'SUBMISSION_DELIVERY_FAILED');
  }
}

function isReceipt(value: unknown): value is SubmissionReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Partial<SubmissionReceipt>;
  return (
    typeof receipt.attemptId === 'string' &&
    ['accepted', 'duplicate', 'rejected'].includes(receipt.status ?? '') &&
    typeof receipt.serverTimestamp === 'string'
  );
}

async function sendSubmission(payload: SubmissionPayload): Promise<SubmissionReceipt> {
  let response: Response;
  try {
    response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new SubmissionHttpError(true);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new SubmissionHttpError(response.status === 429 || response.status >= 500);
  }
  if (!isReceipt(raw) || raw.attemptId !== payload.attemptId) {
    throw new SubmissionHttpError(response.status === 429 || response.status >= 500);
  }
  if (!response.ok || !['accepted', 'duplicate'].includes(raw.status)) {
    throw new SubmissionHttpError(response.status === 429 || response.status >= 500, raw);
  }
  return raw;
}
