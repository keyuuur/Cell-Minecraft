import {
  canonicalizeForwardedSubmissionPayloadV2,
  computeForwardedSubmissionDigestV2,
  scoreSubmissionObjectivesV2,
  validateClientSubmissionPayloadV2,
  validateForwardedSubmissionPayloadV2,
} from './missionContracts';
import type {
  ClientSubmissionPayloadV2,
  ForwardedSubmissionPayloadV2,
  StudentProfile,
} from '../types/game';

export {
  canonicalizeForwardedSubmissionPayloadV2,
  computeForwardedSubmissionDigestV2,
  scoreSubmissionObjectivesV2,
  validateClientSubmissionPayloadV2,
  validateForwardedSubmissionPayloadV2,
};

/**
 * Normalize only after an exact client-contract validation. The normalized
 * display value is forwarded and hashed; case folding is reserved for
 * equality checks so the teacher-facing spelling remains recognizable.
 */
export function normalizeClientSubmissionPayloadV2(value: unknown): ClientSubmissionPayloadV2 {
  if (!validateClientSubmissionPayloadV2(value)) throw new Error('INVALID_CLIENT_SUBMISSION_V2');
  const normalized: ClientSubmissionPayloadV2 = {
    ...structuredClone(value),
    firstName: value.firstName.normalize('NFKC').trim().replace(/\s+/g, ' '),
    lastInitial: value.lastInitial.toUpperCase(),
  };
  if (!validateClientSubmissionPayloadV2(normalized)) {
    throw new Error('INVALID_NORMALIZED_SUBMISSION_V2');
  }
  return normalized;
}

export function submissionIdentityKeyV2(
  student: Pick<StudentProfile, 'firstName' | 'lastInitial' | 'period'>,
): string {
  return [
    student.firstName.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US'),
    student.lastInitial.toUpperCase(),
    String(student.period),
  ].join('|');
}

export function submissionIdempotencyKeyV2(
  payload: Pick<ClientSubmissionPayloadV2, 'assignmentId' | 'assignmentVersion' | 'attemptId'>,
): string {
  return [payload.assignmentId, String(payload.assignmentVersion), payload.attemptId].join('|');
}

export function submissionSessionBindingKeyV2(
  payload: Pick<ClientSubmissionPayloadV2, 'assignmentId' | 'assignmentVersion' | 'sessionId'>,
): string {
  return [payload.assignmentId, String(payload.assignmentVersion), payload.sessionId].join('|');
}

export type ForwardedSubmissionContentV2 = Omit<ForwardedSubmissionPayloadV2, 'canonicalDigest'>;
