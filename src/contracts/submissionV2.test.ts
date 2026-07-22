import { describe, expect, it } from 'vitest';
import { ASSIGNMENT } from '../data/assignment';
import type { ForwardedSubmissionPayloadV2 } from '../types/game';
import {
  canonicalizeForwardedSubmissionPayloadV2,
  computeForwardedSubmissionDigestV2,
  normalizeClientSubmissionPayloadV2,
  scoreSubmissionObjectivesV2,
  submissionIdempotencyKeyV2,
  submissionIdentityKeyV2,
  submissionSessionBindingKeyV2,
  validateForwardedSubmissionPayloadV2,
} from './submissionV2';
import { completeClientSubmissionV2 } from './submissionV2.fixtures';

describe('submission V2 normalized contract', () => {
  it('normalizes the forwarded identity but preserves display casing', () => {
    const normalized = normalizeClientSubmissionPayloadV2(completeClientSubmissionV2());
    expect(normalized.firstName).toBe('Keyur Patel');
    expect(normalized.lastInitial).toBe('K');
    expect(
      submissionIdentityKeyV2({
        firstName: '  KEYUR\u00a0PATEL ',
        lastInitial: 'k',
        period: 3,
      }),
    ).toBe('keyur patel|K|3');
  });

  it('rejects client attempts to inject any server-owned field', () => {
    const client = completeClientSubmissionV2();
    for (const injected of [
      { score: scoreSubmissionObjectivesV2(client.objectives, true) },
      { isTest: false },
      { sourceEnvironment: 'production' },
      { canonicalDigest: 'a'.repeat(64) },
      { unknown: true },
    ]) {
      expect(() => normalizeClientSubmissionPayloadV2({ ...client, ...injected })).toThrow(
        /INVALID_CLIENT_SUBMISSION_V2/,
      );
    }
  });

  it('freezes idempotency and session-binding scopes', () => {
    const client = completeClientSubmissionV2();
    expect(submissionIdempotencyKeyV2(client)).toBe(
      `${ASSIGNMENT.id}|${ASSIGNMENT.version}|${client.attemptId}`,
    );
    expect(submissionSessionBindingKeyV2(client)).toBe(
      `${ASSIGNMENT.id}|${ASSIGNMENT.version}|${client.sessionId}`,
    );
  });

  it('canonicalizes normalized fields and key order into one golden digest', async () => {
    const client = normalizeClientSubmissionPayloadV2(completeClientSubmissionV2());
    const content = {
      ...client,
      score: scoreSubmissionObjectivesV2(client.objectives, true),
      isTest: true,
      sourceEnvironment: 'preview' as const,
    };
    const canonical = canonicalizeForwardedSubmissionPayloadV2(content);
    expect(JSON.parse(canonical)).toMatchObject({
      firstName: 'Keyur Patel',
      lastInitial: 'K',
      isTest: true,
      sourceEnvironment: 'preview',
      score: { total: 100 },
    });
    const digest = await computeForwardedSubmissionDigestV2(content);
    expect(digest).toBe('6599d00f7f08fe138dba2824ca6d7da5ba9d1cced2feb48ecc32b7ec7be74048');

    const forwarded: ForwardedSubmissionPayloadV2 = { ...content, canonicalDigest: digest };
    expect(await validateForwardedSubmissionPayloadV2(forwarded)).toBe(true);
  });
});
