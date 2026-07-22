import {
  computeForwardedSubmissionDigestV2,
  normalizeClientSubmissionPayloadV2,
  scoreSubmissionObjectivesV2,
} from '../contracts/submissionV2.js';
import type {
  ClientSubmissionPayloadV2,
  ForwardedSubmissionPayloadV2,
  SubmissionReceipt,
  SubmissionSourceEnvironment,
} from '../types/game.js';

export type RuntimeSubmissionEnvironmentV2 = Extract<
  SubmissionSourceEnvironment,
  'production' | 'preview' | 'development' | 'test'
>;

export interface AppsScriptEnvelopeV2 {
  proxyKey: string;
  submission: ForwardedSubmissionPayloadV2;
}

const RETRYABLE_RECEIPT_CODES_V2 = new Set([
  'BACKEND_NOT_CONFIGURED',
  'BACKEND_UNAVAILABLE',
  'CORRUPT_IDEMPOTENCY_STATE',
  'CORRUPT_RECEIPT_STATE',
  'CORRUPT_SESSION_BINDING',
  'HEADER_MISMATCH',
  'INVALID_UPSTREAM_RECEIPT',
  'RECEIPT_MISMATCH',
  'SERVER_BUSY',
  'SHEET_MISSING',
]);

function sourceEnvironment(value: string): RuntimeSubmissionEnvironmentV2 {
  if (!['production', 'preview', 'development', 'test'].includes(value)) {
    throw new Error('UNKNOWN_SOURCE_ENVIRONMENT');
  }
  return value as RuntimeSubmissionEnvironmentV2;
}

function exactReceiptKeys(value: Record<string, unknown>): boolean {
  const required = ['attemptId', 'status', 'serverTimestamp'];
  const optional = ['errorCode'];
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

export async function buildForwardedSubmissionPayloadV2(
  input: unknown,
  environment: string,
): Promise<ForwardedSubmissionPayloadV2> {
  const normalized = normalizeClientSubmissionPayloadV2(input);
  const source = sourceEnvironment(environment);
  const content = {
    ...normalized,
    score: scoreSubmissionObjectivesV2(normalized.objectives, normalized.completed),
    isTest: source !== 'production',
    sourceEnvironment: source,
  } satisfies Omit<ForwardedSubmissionPayloadV2, 'canonicalDigest'>;
  return {
    ...content,
    canonicalDigest: await computeForwardedSubmissionDigestV2(content),
  };
}

export function buildAppsScriptEnvelopeV2(
  proxyKey: string,
  submission: ForwardedSubmissionPayloadV2,
): AppsScriptEnvelopeV2 {
  if (typeof proxyKey !== 'string' || proxyKey.length < 24) {
    throw new Error('BACKEND_NOT_CONFIGURED');
  }
  return { proxyKey, submission: structuredClone(submission) };
}

export function classifySubmissionReceiptV2(
  value: unknown,
  attemptId: ClientSubmissionPayloadV2['attemptId'],
): { receipt: SubmissionReceipt; retryable: boolean; httpStatus: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('INVALID_UPSTREAM_RECEIPT');
  }
  const raw = value as Record<string, unknown>;
  const receipt = value as Partial<SubmissionReceipt>;
  const terminal = receipt.status === 'accepted' || receipt.status === 'duplicate';
  if (
    !exactReceiptKeys(raw) ||
    receipt.attemptId !== attemptId ||
    !['accepted', 'duplicate', 'rejected'].includes(receipt.status ?? '') ||
    typeof receipt.serverTimestamp !== 'string' ||
    !Number.isFinite(Date.parse(receipt.serverTimestamp)) ||
    (terminal
      ? receipt.errorCode !== undefined
      : typeof receipt.errorCode !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(receipt.errorCode))
  ) {
    throw new Error(
      receipt.attemptId === attemptId ? 'INVALID_UPSTREAM_RECEIPT' : 'RECEIPT_MISMATCH',
    );
  }
  const typed = receipt as SubmissionReceipt;
  if (terminal) return { receipt: typed, retryable: false, httpStatus: 200 };
  const code = typed.errorCode!;
  const retryable = code === 'RATE_LIMITED' || RETRYABLE_RECEIPT_CODES_V2.has(code);
  return {
    receipt: typed,
    retryable,
    httpStatus: code === 'RATE_LIMITED' ? 429 : retryable ? 503 : 422,
  };
}
