import { describe, expect, it } from 'vitest';
import {
  computeForwardedSubmissionDigestV2,
  validateForwardedSubmissionPayloadV2,
} from '../contracts/submissionV2';
import { completeClientSubmissionV2 } from '../contracts/submissionV2.fixtures';
import {
  buildAppsScriptEnvelopeV2,
  buildForwardedSubmissionPayloadV2,
  classifySubmissionReceiptV2,
} from './submissionV2.server';

describe('submission V2 server trust boundary', () => {
  it.each([
    ['production', false],
    ['preview', true],
    ['development', true],
    ['test', true],
  ] as const)('forces %s test classification to %s', async (environment, isTest) => {
    const forwarded = await buildForwardedSubmissionPayloadV2(
      completeClientSubmissionV2(),
      environment,
    );
    expect(forwarded).toMatchObject({
      firstName: 'Keyur Patel',
      lastInitial: 'K',
      score: { total: 100 },
      isTest,
      sourceEnvironment: environment,
    });
    expect(await validateForwardedSubmissionPayloadV2(forwarded)).toBe(true);
  });

  it('fails closed on unknown environments and server-field injection', async () => {
    await expect(
      buildForwardedSubmissionPayloadV2(completeClientSubmissionV2(), 'unknown'),
    ).rejects.toThrow(/UNKNOWN_SOURCE_ENVIRONMENT/);
    await expect(
      buildForwardedSubmissionPayloadV2(
        { ...completeClientSubmissionV2(), score: { total: 100 } },
        'preview',
      ),
    ).rejects.toThrow(/INVALID_CLIENT_SUBMISSION_V2/);
  });

  it('changes the digest when a forwarded field changes', async () => {
    const forwarded = await buildForwardedSubmissionPayloadV2(
      completeClientSubmissionV2(),
      'preview',
    );
    const { canonicalDigest, ...content } = forwarded;
    const changed = { ...content, period: 4 };
    expect(await computeForwardedSubmissionDigestV2(changed)).not.toBe(canonicalDigest);
  });

  it('keeps the proxy key outside the canonical submission', async () => {
    const forwarded = await buildForwardedSubmissionPayloadV2(
      completeClientSubmissionV2(),
      'preview',
    );
    const envelope = buildAppsScriptEnvelopeV2('a'.repeat(24), forwarded);
    expect(Object.keys(envelope)).toEqual(['proxyKey', 'submission']);
    expect(envelope.submission).toEqual(forwarded);
    expect(envelope.submission).not.toHaveProperty('proxyKey');
    expect(() => buildAppsScriptEnvelopeV2('short', forwarded)).toThrow(/BACKEND_NOT_CONFIGURED/);
  });

  it('keeps conflicts permanent while treating backend schema outages as retryable', () => {
    const attemptId = completeClientSubmissionV2().attemptId;
    expect(
      classifySubmissionReceiptV2(
        {
          attemptId,
          status: 'rejected',
          serverTimestamp: '2026-07-21T00:00:00.000Z',
          errorCode: 'IDEMPOTENCY_CONFLICT',
        },
        attemptId,
      ),
    ).toMatchObject({ retryable: false, httpStatus: 422 });
    for (const errorCode of ['SERVER_BUSY', 'SHEET_MISSING', 'HEADER_MISMATCH']) {
      expect(
        classifySubmissionReceiptV2(
          {
            attemptId,
            status: 'rejected',
            serverTimestamp: '2026-07-21T00:00:00.000Z',
            errorCode,
          },
          attemptId,
        ),
      ).toMatchObject({ retryable: true, httpStatus: 503 });
    }
  });

  it('rejects mismatched, extra-field, and status-inconsistent receipts', () => {
    const attemptId = completeClientSubmissionV2().attemptId;
    expect(() =>
      classifySubmissionReceiptV2(
        {
          attemptId: 'another-attempt',
          status: 'accepted',
          serverTimestamp: '2026-07-21T00:00:00.000Z',
        },
        attemptId,
      ),
    ).toThrow(/RECEIPT_MISMATCH/);
    for (const receipt of [
      {
        attemptId,
        status: 'accepted',
        serverTimestamp: '2026-07-21T00:00:00.000Z',
        extra: true,
      },
      {
        attemptId,
        status: 'accepted',
        serverTimestamp: '2026-07-21T00:00:00.000Z',
        errorCode: 'UNEXPECTED',
      },
      { attemptId, status: 'rejected', serverTimestamp: '2026-07-21T00:00:00.000Z' },
    ]) {
      expect(() => classifySubmissionReceiptV2(receipt, attemptId)).toThrow(
        /INVALID_UPSTREAM_RECEIPT/,
      );
    }
  });
});
