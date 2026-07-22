import { ASSIGNMENT, GAME_VERSION, SUBMISSION_CONTRACT_VERSION } from '../data/assignment';
import type { ClientSubmissionPayloadV2, SubmissionObjectivesV2 } from '../types/game';

export const COMPLETE_SUBMISSION_OBJECTIVES_V2: SubmissionObjectivesV2 = {
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

export function completeClientSubmissionV2(): ClientSubmissionPayloadV2 {
  return {
    contractVersion: SUBMISSION_CONTRACT_VERSION,
    firstName: '  Keyur   Patel  ',
    lastInitial: 'k',
    period: 3,
    attemptId: 'attempt-contract-v2',
    sessionId: 'session-contract-v2',
    assignmentId: ASSIGNMENT.id,
    assignmentVersion: ASSIGNMENT.version,
    gameVersion: GAME_VERSION,
    completed: true,
    early: false,
    timeout: false,
    activeTimeSeconds: 480,
    objectives: structuredClone(COMPLETE_SUBMISSION_OBJECTIVES_V2),
    hintsUsed: { 1: 0, 2: 1, 3: 0 },
  };
}
