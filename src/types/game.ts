import type { BoundaryLayer, BoundaryVoxelStateV1 } from '../voxel/boundaryAdapter';
import type { VoxelPoint } from '../voxel/types';

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

/**
 * The currently deployed classroom route still reads and writes this V2
 * envelope. Phase 4.5 must replace it atomically with SaveEnvelopeV3 rather
 * than relabeling this legacy shape as schema 3.
 */
export interface LegacySaveEnvelopeV2 extends Omit<SaveEnvelope, 'schemaVersion' | 'gameVersion'> {
  schemaVersion: 2;
  gameVersion: '0.1.0';
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

/** The deployed V1 browser/backend payload retained during the V3 transition. */
export type LegacySubmissionPayloadV1 = SubmissionPayload;

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

export const VOXEL_MISSION_SNAPSHOT_VERSION = 1 as const;
export const VOXEL_MISSION_TEMPLATE_ID = 'plant-cell-cutaway-v1' as const;

export type MissionModuleId = Exclude<StructureId, 'cytoplasm'>;
export type MissionHotbarItemId = 'builder-pick' | MissionModuleId;

export interface VoxelMissionPlayerV1 extends VoxelPoint {
  yaw: number;
  pitch: number;
}

export interface MissionModulePickupV1 {
  item: MissionModuleId;
  count: number;
  position: VoxelPoint;
  spawnSequence: number;
}

export interface VoxelMissionHomeostasisV1 {
  waterAvailable: boolean;
  vacuoleHydratedObserved: boolean;
  droughtStarted: boolean;
  droughtDiagnosed: boolean;
  droughtObserved: boolean;
  recoveryRestored: boolean;
}

export type VoxelMissionRemovedTargetV1 =
  | { kind: 'boundary'; layer: BoundaryLayer; sectorId: string }
  | { kind: 'structure'; structureId: PlaceableStructureId };

export type VoxelMissionRecoveryV1 =
  { kind: 'pickup'; spawnSequence: number } | { kind: 'inventory' };

export interface VoxelMissionCorrectionV1 {
  removedTarget: VoxelMissionRemovedTargetV1 | null;
  recovery: VoxelMissionRecoveryV1 | null;
}

export interface VoxelMissionCompletionV1 {
  completionLocked: boolean;
  completed: boolean;
  practice: boolean;
}

/**
 * Serializable authority for the integrated voxel mission. Babylon objects,
 * React state, and derived MissionState/ScoreBreakdown values never belong in
 * this snapshot.
 */
export interface VoxelMissionSnapshotV1 {
  version: 1;
  templateId: typeof VOXEL_MISSION_TEMPLATE_ID;
  paletteVersion: number;
  revision: number;
  player: VoxelMissionPlayerV1;
  boundary: BoundaryVoxelStateV1;
  depotInventory: Record<MissionModuleId, number>;
  placements: Partial<Record<PlaceableStructureId, Point3>>;
  functionEvidence: Partial<Record<PlaceableStructureId, boolean>>;
  moduleInventory: Record<MissionModuleId, number>;
  activeModulePickups: MissionModulePickupV1[];
  selectedHotbarItem: MissionHotbarItemId;
  homeostasis: VoxelMissionHomeostasisV1;
  correction: VoxelMissionCorrectionV1;
  completion: VoxelMissionCompletionV1;
  lastFeedback: string;
  stageTimestamps: Partial<Record<MissionStage, number>>;
}

export type MissionTarget =
  | {
      kind: 'voxel';
      snapshotRevision: number;
      position: VoxelPoint;
      normal: VoxelPoint;
      distance: number;
    }
  | {
      kind: 'pickup';
      snapshotRevision: number;
      spawnSequence: number;
      item: MissionModuleId;
      distance: number;
    }
  | {
      kind: 'boundary';
      snapshotRevision: number;
      layer: BoundaryLayer;
      sectorId: string;
      distance: number;
    }
  | {
      kind: 'structure';
      snapshotRevision: number;
      structureId: PlaceableStructureId;
      distance: number;
    }
  | {
      kind: 'supply';
      snapshotRevision: number;
      structureId: StructureId;
      distance: number;
    }
  | { kind: 'waterStation'; snapshotRevision: number; distance: number };

export type MissionCommand =
  | { type: 'mine'; snapshotRevision: number }
  | { type: 'collect'; snapshotRevision: number }
  | { type: 'place'; snapshotRevision: number }
  | { type: 'inspect'; snapshotRevision: number }
  | { type: 'remove'; snapshotRevision: number }
  | { type: 'interact'; snapshotRevision: number }
  | { type: 'overview'; snapshotRevision: number }
  | { type: 'recover'; snapshotRevision: number };

export type MissionPrimaryVerb = MissionCommand['type'];

export interface MissionHintContext {
  stage: MissionStage;
  currentLevel: 0 | 1 | 2 | 3;
  maxLevel: 3;
}

export interface MissionFeedback {
  tone: 'information' | 'success' | 'correction' | 'warning';
  message: string;
}

/** One semantic selector result shared by the HUD and accessible controls. */
export interface MissionViewModel {
  objective: string;
  highlightedTarget: MissionTarget | null;
  primaryVerb: MissionPrimaryVerb | null;
  primaryActionLabel: string;
  primaryActionAccessibleLabel: string;
  primaryActionEnabled: boolean;
  hintContext: MissionHintContext;
  feedback: MissionFeedback | null;
}

export interface GradedSnapshotV1 {
  score: ScoreBreakdown;
  objectives: SubmissionObjectivesV2;
  hintsUsed: Record<number, number>;
  outcome: 'complete' | 'early' | 'timeout';
  missionRevision: number;
  activeElapsedMs: number;
  lockedAt: number;
}

/** The first persistence envelope for the integrated voxel mission. */
export interface SaveEnvelopeV3 {
  schemaVersion: 3;
  gameVersion: '0.2.0';
  assignmentId: string;
  assignmentVersion: number;
  sessionId: string;
  attemptId: string;
  student: StudentProfile;
  controls: ControlProfile;
  qualityMode: QualityMode;
  accessibility: AccessibilitySettings;
  activeElapsedMs: number;
  voxelMission: VoxelMissionSnapshotV1;
  hintsUsed: Record<number, number>;
  gradedSnapshot: Readonly<GradedSnapshotV1> | null;
  submissionStatus: SubmissionStatus;
  outcome: 'active' | 'complete' | 'early' | 'timeout' | 'practice';
  savedAt: number;
}

export interface SubmissionObjectivesV2 {
  wallPanels: number;
  membranePanels: number;
  cytoplasm: boolean;
  nucleus: boolean;
  ribosomes: boolean;
  mitochondria: boolean;
  chloroplasts: boolean;
  centralVacuole: boolean;
  droughtDiagnosed: boolean;
  droughtObserved: boolean;
  recoveryRestored: boolean;
  effectCellWall: boolean;
  effectCellMembrane: boolean;
  effectCytoplasm: boolean;
  effectNucleus: boolean;
  effectRibosomes: boolean;
  effectMitochondria: boolean;
  effectChloroplasts: boolean;
  effectCentralVacuole: boolean;
}

/** Browser-owned fields only. Score and test classification are forbidden. */
export interface ClientSubmissionPayloadV2 {
  contractVersion: 2;
  firstName: string;
  lastInitial: string;
  period: number;
  attemptId: string;
  sessionId: string;
  assignmentId: string;
  assignmentVersion: number;
  gameVersion: '0.2.0';
  completed: boolean;
  early: boolean;
  timeout: boolean;
  activeTimeSeconds: number;
  objectives: SubmissionObjectivesV2;
  hintsUsed: Record<number, number>;
}

export type SubmissionSourceEnvironment = 'production' | 'preview' | 'development' | 'test';

/** Server-authoritative payload forwarded to Apps Script after validation. */
export interface ForwardedSubmissionPayloadV2 extends ClientSubmissionPayloadV2 {
  score: ScoreBreakdown;
  isTest: boolean;
  sourceEnvironment: SubmissionSourceEnvironment;
  canonicalDigest: string;
}
