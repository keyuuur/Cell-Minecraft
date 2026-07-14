import { describe, expect, it } from 'vitest';
import {
  sanitizeSheetText,
  serverScore,
  validatePayloadSize,
  validateSubmission,
  ValidationError,
} from './validation';

const objectives = {
  wallPanels: 6,
  membranePanels: 6,
  cytoplasm: true,
  nucleus: true,
  ribosomes: true,
  mitochondria: true,
  chloroplasts: true,
  centralVacuole: true,
  droughtDiagnosed: true,
  droughtObserved: true,
  recoveryRestored: true,
  effectCellWall: true,
  effectCellMembrane: true,
  effectCytoplasm: true,
  effectNucleus: true,
  effectRibosomes: true,
  effectMitochondria: true,
  effectChloroplasts: true,
  effectCentralVacuole: true,
};

const validPayload = {
  firstName: 'Test',
  lastInitial: 'S',
  period: 1,
  attemptId: '123e4567-e89b-12d3-a456-426614174000',
  sessionId: '123e4567-e89b-12d3-a456-426614174001',
  assignmentId: 'build-a-living-cell-unit1',
  assignmentVersion: 1,
  gameVersion: '0.1.0',
  score: { total: 3 },
  completed: true,
  early: false,
  timeout: false,
  activeTimeSeconds: 720,
  objectives,
  hintsUsed: { 1: 0, 2: 0, 3: 0 },
  isTest: true,
};

describe('submission validation', () => {
  it('recomputes a complete score rather than trusting the client total', () => {
    expect(validateSubmission(validPayload).score.total).toBe(100);
    expect(serverScore(objectives, true).total).toBe(100);
  });

  it('neutralizes spreadsheet formulas', () => {
    expect(sanitizeSheetText('=IMPORTXML("bad")', 40)).toBe('\'=IMPORTXML("bad")');
  });

  it('rejects unknown assignments', () => {
    expect(() => validateSubmission({ ...validPayload, assignmentId: 'unknown' })).toThrow(
      ValidationError,
    );
  });

  it('rejects fractional discrete values', () => {
    expect(() => validateSubmission({ ...validPayload, period: 1.5 })).toThrow(ValidationError);
    expect(() =>
      validateSubmission({
        ...validPayload,
        objectives: { ...objectives, wallPanels: 5.5 },
      }),
    ).toThrow(ValidationError);
  });

  it('enforces the payload byte limit even without a content-length header', () => {
    expect(() => validatePayloadSize({ large: 'a'.repeat(24_100) })).toThrow(ValidationError);
  });

  it('requires the supported assignment version and one valid outcome', () => {
    expect(() => validateSubmission({ ...validPayload, assignmentVersion: 2 })).toThrow(
      ValidationError,
    );
    expect(() => validateSubmission({ ...validPayload, early: true })).toThrow(ValidationError);
    expect(() =>
      validateSubmission({ ...validPayload, completed: false, early: false, timeout: false }),
    ).toThrow(ValidationError);
  });
});
