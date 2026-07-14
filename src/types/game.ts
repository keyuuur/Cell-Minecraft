export type StructureId =
  | 'cellWall'
  | 'cellMembrane'
  | 'cytoplasm'
  | 'nucleus'
  | 'ribosomes'
  | 'mitochondria'
  | 'chloroplasts'
  | 'centralVacuole';

export type PlaceableStructureId = Exclude<StructureId, 'cellWall' | 'cellMembrane' | 'cytoplasm'>;

export type ControlProfile = 'keyboard-touch' | 'touch-only';
export type QualityMode = 'auto' | 'low' | 'standard';
export type SubmissionStatus =
  'idle' | 'queued' | 'sending' | 'accepted' | 'duplicate' | 'rejected';

export interface StudentProfile {
  firstName: string;
  lastInitial: string;
  period: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface StructurePlacement {
  id: PlaceableStructureId;
  position: Point3;
  placedAt: number;
}

export interface MissionState {
  wallPanels: number;
  membranePanels: number;
  cytoplasmEstablished: boolean;
  placements: Partial<Record<PlaceableStructureId, StructurePlacement>>;
  collected: Partial<Record<StructureId, boolean>>;
  functionEvidence: Partial<Record<StructureId, boolean>>;
  waterAvailable: boolean;
  vacuoleHydratedObserved: boolean;
  droughtStarted: boolean;
  droughtDiagnosed: boolean;
  droughtObserved: boolean;
  recoveryRestored: boolean;
  completionLocked: boolean;
  completed: boolean;
  practice: boolean;
  lastFeedback: string;
  stageTimestamps: Partial<Record<MissionStage, number>>;
}

export type MissionStage =
  | 'boundary'
  | 'cytoplasm'
  | 'control-and-protein'
  | 'energy-and-photosynthesis'
  | 'water-storage'
  | 'drought-diagnosis'
  | 'recovery'
  | 'stable';

export interface ScoreBreakdown {
  boundary: number;
  requiredStructures: number;
  placementContext: number;
  activationFunctions: number;
  droughtRecovery: number;
  finalStability: number;
  total: number;
}

export interface AccessibilitySettings {
  largeText: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  muted: boolean;
}

export interface AssignmentDefinition {
  id: string;
  version: number;
  title: string;
  periods: number[];
  durationSeconds: number;
  stages: MissionStage[];
  requiredStructures: StructureId[];
  rubric: Omit<ScoreBreakdown, 'total'>;
  featureFlags: {
    practice: boolean;
    earlySubmission: boolean;
    testTools: boolean;
  };
}

export interface SaveEnvelope {
  schemaVersion: number;
  gameVersion: string;
  assignmentId: string;
  assignmentVersion: number;
  sessionId: string;
  attemptId: string;
  student: StudentProfile;
  controls: ControlProfile;
  qualityMode: QualityMode;
  accessibility: AccessibilitySettings;
  activeElapsedMs: number;
  mission: MissionState;
  selectedItem: StructureId | null;
  hintsUsed: Record<number, number>;
  score: ScoreBreakdown;
  gradedScore: ScoreBreakdown | null;
  gradedOutcome: 'complete' | 'early' | 'timeout' | null;
  submissionStatus: SubmissionStatus;
  outcome: 'active' | 'complete' | 'early' | 'timeout' | 'practice';
  savedAt: number;
}

export interface SubmissionPayload {
  firstName: string;
  lastInitial: string;
  period: number;
  attemptId: string;
  sessionId: string;
  assignmentId: string;
  assignmentVersion: number;
  gameVersion: string;
  score: ScoreBreakdown;
  completed: boolean;
  early: boolean;
  timeout: boolean;
  activeTimeSeconds: number;
  objectives: Record<string, boolean | number>;
  hintsUsed: Record<number, number>;
  isTest: boolean;
}

export interface SubmissionReceipt {
  attemptId: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  serverTimestamp: string;
  errorCode?: string;
}

export interface PendingSubmission {
  payload: SubmissionPayload;
  queuedAt: number;
  attempts: number;
  lastError?: string;
}
