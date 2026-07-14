import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllLocalDataForTests, queuedSubmissions } from '../persistence/db';
import type { SubmissionPayload } from '../types/game';
import { submitOrQueue } from './submissions';

const payload: SubmissionPayload = {
  firstName: 'Test',
  lastInitial: 'S',
  period: 1,
  attemptId: 'attempt-1',
  sessionId: 'session-1',
  assignmentId: 'build-a-living-cell-unit1',
  assignmentVersion: 1,
  gameVersion: '0.1.0',
  score: {
    boundary: 0,
    requiredStructures: 0,
    placementContext: 0,
    activationFunctions: 0,
    droughtRecovery: 0,
    finalStability: 0,
    total: 0,
  },
  completed: false,
  early: true,
  timeout: false,
  activeTimeSeconds: 15,
  objectives: {},
  hintsUsed: {},
  isTest: true,
};

function receiptResponse(status: number, errorCode: string) {
  return new Response(
    JSON.stringify({
      attemptId: payload.attemptId,
      status: 'rejected',
      serverTimestamp: new Date().toISOString(),
      errorCode,
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('submission retry behavior', () => {
  beforeEach(async () => {
    await clearAllLocalDataForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('removes permanent validation failures from the retry queue', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(receiptResponse(400, 'INVALID_PAYLOAD')));
    await expect(submitOrQueue(payload)).resolves.toMatchObject({ status: 'rejected' });
    await expect(queuedSubmissions()).resolves.toHaveLength(0);
  });

  it('keeps temporary service failures queued for replay', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(receiptResponse(503, 'SERVER_BUSY')));
    await expect(submitOrQueue(payload)).resolves.toBeNull();
    await expect(queuedSubmissions()).resolves.toHaveLength(1);
  });
});
