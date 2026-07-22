import type { SubmissionReceipt } from '../types/game';

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

export function validSubmissionReceipt(
  value: unknown,
  attemptId?: string,
): value is SubmissionReceipt {
  if (!exactKeys(value, ['attemptId', 'status', 'serverTimestamp'], ['errorCode'])) return false;
  const receipt = value as Partial<SubmissionReceipt>;
  const terminal = receipt.status === 'accepted' || receipt.status === 'duplicate';
  return (
    typeof receipt.attemptId === 'string' &&
    /^[A-Za-z0-9-]{1,64}$/.test(receipt.attemptId) &&
    (attemptId === undefined || receipt.attemptId === attemptId) &&
    ['accepted', 'duplicate', 'rejected'].includes(receipt.status ?? '') &&
    typeof receipt.serverTimestamp === 'string' &&
    Number.isFinite(Date.parse(receipt.serverTimestamp)) &&
    (terminal
      ? receipt.errorCode === undefined
      : typeof receipt.errorCode === 'string' && /^[A-Z0-9_]{1,64}$/.test(receipt.errorCode))
  );
}
