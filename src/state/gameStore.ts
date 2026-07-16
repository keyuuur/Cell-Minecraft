import { create } from 'zustand';
import { calculateScore } from '../biology/scoring';
import {
  canEstablishCytoplasm,
  canPlaceStructure,
  createInitialMission,
  currentStage,
  isStructurePresent,
  PANEL_TARGET,
} from '../biology/rules';
import { ASSIGNMENT, REQUIRED_STRUCTURES } from '../data/assignment';
import type {
  AccessibilitySettings,
  ControlProfile,
  MissionState,
  Point3,
  QualityMode,
  SaveEnvelope,
  ScoreBreakdown,
  StudentProfile,
  StructureId,
  SubmissionStatus,
} from '../types/game';

export type AppScreen = 'identify' | 'tutorial' | 'mission' | 'results';
export type NearbyStation = StructureId | 'waterStation' | null;
export type NearbyStructure = StructureId | null;

interface GameStore {
  screen: AppScreen;
  student: StudentProfile | null;
  sessionId: string;
  attemptId: string;
  controls: ControlProfile;
  qualityMode: QualityMode;
  accessibility: AccessibilitySettings;
  activeElapsedMs: number;
  mission: MissionState;
  selectedItem: StructureId | null;
  nearbyStation: NearbyStation;
  nearbyStructure: NearbyStructure;
  hintsUsed: Record<number, number>;
  score: ScoreBreakdown;
  gradedScore: ScoreBreakdown | null;
  gradedOutcome: 'complete' | 'early' | 'timeout' | null;
  submissionStatus: SubmissionStatus;
  paused: boolean;
  timedOut: boolean;
  earlySubmission: boolean;
  lastSavedAt: number | null;
  identifyStudent: (student: StudentProfile) => void;
  setControls: (controls: ControlProfile) => void;
  setQualityMode: (mode: QualityMode) => void;
  updateAccessibility: (settings: Partial<AccessibilitySettings>) => void;
  startMission: (practice?: boolean) => void;
  tickActiveTime: (deltaMs: number) => void;
  setPaused: (paused: boolean) => void;
  setNearbyStation: (station: NearbyStation) => void;
  setNearbyStructure: (structure: NearbyStructure) => void;
  interact: () => void;
  selectItem: (item: StructureId | null) => void;
  placeSelected: (position: Point3) => void;
  removeSelected: () => void;
  openOverview: () => void;
  beginDroughtChallenge: () => void;
  useHint: (level: number) => void;
  submitAttempt: (early?: boolean) => void;
  continuePractice: () => void;
  endPractice: () => void;
  setSubmissionStatus: (status: SubmissionStatus) => void;
  hydrate: (save: SaveEnvelope) => void;
  markSaved: (savedAt: number) => void;
  resetForNewStudent: () => void;
  testAdvanceStage: () => void;
}

const emptyScore = calculateScore(createInitialMission());

const stationLabel = (station: StructureId): string => {
  const labels: Record<StructureId, string> = {
    cellWall: 'wall panels',
    cellMembrane: 'membrane panels',
    cytoplasm: 'cytoplasm system',
    nucleus: 'nucleus module',
    ribosomes: 'ribosome module',
    mitochondria: 'mitochondria module',
    chloroplasts: 'chloroplast module',
    centralVacuole: 'central vacuole module',
  };
  return labels[station];
};

const withFeedback = (mission: MissionState, lastFeedback: string): MissionState => ({
  ...mission,
  lastFeedback,
});

const recalculate = (mission: MissionState) => ({ mission, score: calculateScore(mission) });

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'identify',
  student: null,
  sessionId: crypto.randomUUID(),
  attemptId: crypto.randomUUID(),
  controls: 'keyboard-touch',
  qualityMode: 'auto',
  accessibility: {
    largeText: false,
    highContrast: false,
    reducedMotion: false,
    muted: false,
  },
  activeElapsedMs: 0,
  mission: createInitialMission(),
  selectedItem: null,
  nearbyStation: null,
  nearbyStructure: null,
  hintsUsed: {},
  score: emptyScore,
  gradedScore: null,
  gradedOutcome: null,
  submissionStatus: 'idle',
  paused: false,
  timedOut: false,
  earlySubmission: false,
  lastSavedAt: null,

  identifyStudent: (student) => set({ student, screen: 'tutorial' }),
  setControls: (controls) => set({ controls }),
  setQualityMode: (qualityMode) => set({ qualityMode }),
  updateAccessibility: (settings) =>
    set((state) => ({ accessibility: { ...state.accessibility, ...settings } })),
  startMission: (practice = false) =>
    set({
      screen: 'mission',
      mission: createInitialMission(practice),
      activeElapsedMs: 0,
      selectedItem: null,
      nearbyStation: null,
      nearbyStructure: null,
      hintsUsed: {},
      score: emptyScore,
      gradedScore: null,
      gradedOutcome: null,
      paused: false,
      timedOut: false,
      earlySubmission: false,
      submissionStatus: 'idle',
      attemptId: crypto.randomUUID(),
    }),
  tickActiveTime: (deltaMs) => {
    const state = get();
    if (
      state.screen !== 'mission' ||
      state.paused ||
      state.mission.practice ||
      state.mission.completionLocked
    )
      return;
    const next = Math.min(
      state.activeElapsedMs + Math.max(0, deltaMs),
      ASSIGNMENT.durationSeconds * 1000,
    );
    if (next >= ASSIGNMENT.durationSeconds * 1000) {
      const mission = { ...state.mission, completionLocked: true };
      const gradedScore = calculateScore(mission);
      set({
        activeElapsedMs: next,
        timedOut: true,
        screen: 'results',
        gradedScore,
        gradedOutcome: 'timeout',
        ...recalculate(mission),
      });
      return;
    }
    set({ activeElapsedMs: next });
  },
  setPaused: (paused) => set({ paused }),
  setNearbyStation: (nearbyStation) => set({ nearbyStation }),
  setNearbyStructure: (nearbyStructure) => set({ nearbyStructure }),
  interact: () => {
    const state = get();
    const station = state.nearbyStation;
    const structure = state.nearbyStructure;
    if (!station && structure) {
      if (state.mission.functionEvidence[structure]) {
        set({
          mission: withFeedback(
            state.mission,
            `${stationLabel(structure)} effect is already recorded in Overview.`,
          ),
        });
        return;
      }
      const mission = {
        ...state.mission,
        functionEvidence: { ...state.mission.functionEvidence, [structure]: true },
        lastFeedback: `${stationLabel(structure)} function observed. A visible system signal appeared.`,
      };
      set(recalculate(mission));
      return;
    }
    if (!station) {
      set({ mission: withFeedback(state.mission, 'Move closer to a labeled supply depot.') });
      return;
    }
    if (station === 'waterStation') {
      if (!state.mission.droughtObserved) {
        set({
          mission: withFeedback(
            state.mission,
            'Observe the wilted cell and low turgor in Overview before choosing a repair.',
          ),
        });
        return;
      }
      const mission: MissionState = {
        ...state.mission,
        waterAvailable: true,
        droughtDiagnosed: true,
        recoveryRestored: true,
        completed: false,
        lastFeedback:
          'Water availability is restored. Open Overview to verify turgor and firmness.',
        stageTimestamps: { ...state.mission.stageTimestamps, recovery: Date.now() },
      };
      set({ ...recalculate(mission), selectedItem: null });
      return;
    }
    if (station === 'cytoplasm') {
      if (!canEstablishCytoplasm(state.mission)) {
        set({
          mission: withFeedback(
            state.mission,
            'Finish the outside wall and inside membrane before establishing cytoplasm.',
          ),
        });
        return;
      }
      const mission: MissionState = {
        ...state.mission,
        cytoplasmEstablished: true,
        collected: { ...state.mission.collected, cytoplasm: true },
        lastFeedback: 'Cytoplasm now fills the cell interior.',
        stageTimestamps: {
          ...state.mission.stageTimestamps,
          'control-and-protein': Date.now(),
        },
      };
      set({ ...recalculate(mission), selectedItem: null });
      return;
    }
    const mission = {
      ...state.mission,
      collected: { ...state.mission.collected, [station]: true },
      lastFeedback: `Collected ${stationLabel(station)}. Select Place when you are inside the cell.`,
    };
    set({ mission, selectedItem: station });
  },
  selectItem: (selectedItem) => set({ selectedItem }),
  placeSelected: (position) => {
    const state = get();
    const selected = state.selectedItem;
    if (!selected || !state.mission.collected[selected]) {
      set({ mission: withFeedback(state.mission, 'Collect a module from a supply depot first.') });
      return;
    }
    if (selected === 'cellWall') {
      const radius = Math.hypot(position.x, position.z);
      if (radius < 8.5 || radius > 12.5) {
        set({
          mission: withFeedback(
            state.mission,
            'Move to the chamber boundary before snapping a wall panel into place.',
          ),
        });
        return;
      }
      if (state.mission.wallPanels >= PANEL_TARGET) {
        set({ mission: withFeedback(state.mission, 'All six outside wall panels are installed.') });
        return;
      }
      const wallPanels = state.mission.wallPanels + 1;
      const mission = {
        ...state.mission,
        wallPanels,
        lastFeedback:
          wallPanels === PANEL_TARGET
            ? 'Wall complete. Collect membrane panels for the inside layer.'
            : `Wall panel snapped into the outside frame (${wallPanels}/${PANEL_TARGET}).`,
      };
      set({ ...recalculate(mission), selectedItem: wallPanels === PANEL_TARGET ? null : selected });
      return;
    }
    if (selected === 'cellMembrane') {
      if (state.mission.wallPanels < PANEL_TARGET) {
        set({
          mission: withFeedback(state.mission, 'The supporting wall must be built outside first.'),
        });
        return;
      }
      const radius = Math.hypot(position.x, position.z);
      if (radius < 7.5 || radius > 11.5) {
        set({
          mission: withFeedback(
            state.mission,
            'Move to the inside boundary before snapping a membrane panel into place.',
          ),
        });
        return;
      }
      if (state.mission.membranePanels >= PANEL_TARGET) return;
      const membranePanels = state.mission.membranePanels + 1;
      const mission = {
        ...state.mission,
        membranePanels,
        lastFeedback:
          membranePanels === PANEL_TARGET
            ? 'Boundary complete. Establish the cytoplasm.'
            : `Membrane panel snapped just inside the wall (${membranePanels}/${PANEL_TARGET}).`,
      };
      set({
        ...recalculate(mission),
        selectedItem: membranePanels === PANEL_TARGET ? null : selected,
      });
      return;
    }
    if (selected === 'cytoplasm') return;
    const validation = canPlaceStructure(state.mission, selected, position);
    if (!validation.allowed) {
      set({
        mission: withFeedback(state.mission, validation.reason ?? 'That placement is blocked.'),
      });
      return;
    }
    let mission: MissionState = {
      ...state.mission,
      placements: {
        ...state.mission.placements,
        [selected]: { id: selected, position, placedAt: Date.now() },
      },
      lastFeedback: `${stationLabel(selected)} installed. Move near it until Inspect appears, then tap Interact.`,
    };
    if (selected === 'centralVacuole') {
      mission = {
        ...mission,
        waterAvailable: true,
        droughtStarted: false,
        lastFeedback:
          'Water storage is established. Move near the vacuole until Inspect appears, then tap Interact.',
        stageTimestamps: { ...mission.stageTimestamps, 'water-storage': Date.now() },
      };
    } else {
      const nextStage = currentStage(mission);
      mission.stageTimestamps = { ...mission.stageTimestamps, [nextStage]: Date.now() };
    }
    set({ ...recalculate(mission), selectedItem: null });
  },
  removeSelected: () => {
    const state = get();
    const selected = state.selectedItem;
    if (!selected) {
      set({
        mission: withFeedback(state.mission, 'Select a placed structure before removing it.'),
      });
      return;
    }
    if (selected === 'cellWall' && state.mission.wallPanels > 0) {
      const functionEvidence = { ...state.mission.functionEvidence };
      delete functionEvidence.cellWall;
      const mission = withFeedback(
        {
          ...state.mission,
          wallPanels: state.mission.wallPanels - 1,
          functionEvidence,
          completed: false,
        },
        'Removed one wall panel. You can replace it for full credit.',
      );
      set(recalculate(mission));
      return;
    }
    if (selected === 'cellWall') return;
    if (selected === 'cellMembrane' && state.mission.membranePanels > 0) {
      const functionEvidence = { ...state.mission.functionEvidence };
      delete functionEvidence.cellMembrane;
      const mission = withFeedback(
        {
          ...state.mission,
          membranePanels: state.mission.membranePanels - 1,
          functionEvidence,
          completed: false,
        },
        'Removed one membrane panel. You can replace it for full credit.',
      );
      set(recalculate(mission));
      return;
    }
    if (selected === 'cellMembrane') return;
    if (selected === 'cytoplasm') return;
    const placements = { ...state.mission.placements };
    delete placements[selected];
    const functionEvidence = { ...state.mission.functionEvidence };
    delete functionEvidence[selected];
    const mission = withFeedback(
      {
        ...state.mission,
        placements,
        functionEvidence,
        completed: false,
        ...(selected === 'centralVacuole'
          ? {
              vacuoleHydratedObserved: false,
              droughtStarted: false,
              droughtDiagnosed: false,
              droughtObserved: false,
              recoveryRestored: false,
            }
          : {}),
      },
      'Structure removed. Replace it to restore full credit.',
    );
    set({ ...recalculate(mission), selectedItem: null });
  },
  openOverview: () => {
    const state = get();
    if (state.mission.placements.centralVacuole && !state.mission.vacuoleHydratedObserved) {
      const mission: MissionState = {
        ...state.mission,
        vacuoleHydratedObserved: true,
        lastFeedback: 'Baseline observed: the full vacuole supports high turgor and a firm plant.',
      };
      set(recalculate(mission));
      return;
    }
    if (state.mission.droughtStarted && !state.mission.droughtObserved) {
      const mission: MissionState = {
        ...state.mission,
        droughtObserved: true,
        lastFeedback:
          'Observed: the vacuole shrank, turgor dropped, and the plant wilted when water became limited.',
      };
      set(recalculate(mission));
      return;
    }
    if (state.mission.recoveryRestored && !state.mission.completed) {
      const stable = REQUIRED_STRUCTURES.every(
        (id) => isStructurePresent(state.mission, id) && state.mission.functionEvidence[id],
      );
      const mission: MissionState = {
        ...state.mission,
        completed: stable,
        lastFeedback: stable
          ? 'Recovery verified: the vacuole is full, turgor is high, and the plant is firm again.'
          : 'Water recovered, but repair the missing structure evidence before final stability.',
        stageTimestamps: stable
          ? { ...state.mission.stageTimestamps, stable: Date.now() }
          : state.mission.stageTimestamps,
      };
      set(recalculate(mission));
    }
  },
  beginDroughtChallenge: () => {
    const state = get();
    if (
      !state.mission.vacuoleHydratedObserved ||
      REQUIRED_STRUCTURES.some((id) => !state.mission.functionEvidence[id])
    )
      return;
    const mission: MissionState = {
      ...state.mission,
      waterAvailable: false,
      droughtStarted: true,
      droughtDiagnosed: false,
      droughtObserved: false,
      recoveryRestored: false,
      completed: false,
      lastFeedback: 'External water availability dropped. Observe how the cell and plant change.',
      stageTimestamps: {
        ...state.mission.stageTimestamps,
        'drought-diagnosis': Date.now(),
      },
    };
    set(recalculate(mission));
  },
  useHint: (level) => {
    const state = get();
    set({ hintsUsed: { ...state.hintsUsed, [level]: (state.hintsUsed[level] ?? 0) + 1 } });
  },
  submitAttempt: (early = false) => {
    const state = get();
    const mission = { ...state.mission, completionLocked: true };
    const gradedScore = calculateScore(mission);
    set({
      screen: 'results',
      earlySubmission: early && !mission.completed,
      gradedScore,
      gradedOutcome: mission.completed ? 'complete' : 'early',
      ...recalculate(mission),
    });
  },
  continuePractice: () =>
    set((state) => ({
      screen: 'mission',
      mission: { ...state.mission, practice: true, completionLocked: false },
      paused: false,
    })),
  endPractice: () => set({ screen: 'results', paused: false }),
  setSubmissionStatus: (submissionStatus) => set({ submissionStatus }),
  hydrate: (save) =>
    set({
      screen: save.mission.completionLocked ? 'results' : 'mission',
      student: save.student,
      sessionId: save.sessionId,
      attemptId: save.attemptId,
      controls: save.controls,
      qualityMode: save.qualityMode,
      accessibility: save.accessibility,
      activeElapsedMs: save.activeElapsedMs,
      mission: save.mission,
      selectedItem: save.selectedItem,
      hintsUsed: save.hintsUsed,
      score: calculateScore(save.mission),
      gradedScore: save.gradedScore ?? (save.mission.completionLocked ? save.score : null),
      gradedOutcome:
        save.gradedOutcome ??
        (save.outcome === 'complete' || save.outcome === 'early' || save.outcome === 'timeout'
          ? save.outcome
          : null),
      submissionStatus: save.submissionStatus === 'sending' ? 'queued' : save.submissionStatus,
      timedOut: save.outcome === 'timeout',
      earlySubmission: save.outcome === 'early',
    }),
  markSaved: (lastSavedAt) => set({ lastSavedAt }),
  resetForNewStudent: () =>
    set({
      screen: 'identify',
      student: null,
      sessionId: crypto.randomUUID(),
      attemptId: crypto.randomUUID(),
      activeElapsedMs: 0,
      mission: createInitialMission(),
      selectedItem: null,
      nearbyStation: null,
      nearbyStructure: null,
      hintsUsed: {},
      score: emptyScore,
      gradedScore: null,
      gradedOutcome: null,
      submissionStatus: 'idle',
      paused: false,
      timedOut: false,
      earlySubmission: false,
    }),
  testAdvanceStage: () => {
    const state = get();
    const stage = currentStage(state.mission);
    let mission = state.mission;
    if (stage === 'boundary') {
      mission = { ...mission, wallPanels: PANEL_TARGET, membranePanels: PANEL_TARGET };
    } else if (stage === 'cytoplasm') {
      mission = { ...mission, cytoplasmEstablished: true };
    } else if (stage === 'control-and-protein') {
      mission = {
        ...mission,
        placements: {
          ...mission.placements,
          nucleus: { id: 'nucleus', position: { x: -5, y: 1, z: 0 }, placedAt: Date.now() },
          ribosomes: { id: 'ribosomes', position: { x: 5, y: 1, z: 0 }, placedAt: Date.now() },
        },
      };
    } else if (stage === 'energy-and-photosynthesis') {
      mission = {
        ...mission,
        placements: {
          ...mission.placements,
          mitochondria: {
            id: 'mitochondria',
            position: { x: -5, y: 1, z: 5 },
            placedAt: Date.now(),
          },
          chloroplasts: {
            id: 'chloroplasts',
            position: { x: 5, y: 1, z: 5 },
            placedAt: Date.now(),
          },
        },
      };
    } else if (stage === 'water-storage' && !mission.placements.centralVacuole) {
      mission = {
        ...mission,
        placements: {
          ...mission.placements,
          centralVacuole: {
            id: 'centralVacuole',
            position: { x: 0, y: 1, z: 0 },
            placedAt: Date.now(),
          },
        },
        waterAvailable: true,
      };
    } else if (
      stage === 'water-storage' &&
      REQUIRED_STRUCTURES.some((id) => !mission.functionEvidence[id])
    ) {
      mission = {
        ...mission,
        vacuoleHydratedObserved: true,
        functionEvidence: Object.fromEntries(
          ASSIGNMENT.requiredStructures.map((id) => [id, true]),
        ) as MissionState['functionEvidence'],
      };
    } else if (stage === 'water-storage') {
      mission = { ...mission, droughtStarted: true, waterAvailable: false };
    } else if (stage === 'drought-diagnosis' && !mission.droughtObserved) {
      mission = { ...mission, droughtObserved: true };
    } else if (stage === 'drought-diagnosis') {
      mission = {
        ...mission,
        droughtDiagnosed: true,
        waterAvailable: true,
        recoveryRestored: true,
      };
    } else if (stage === 'recovery') {
      mission = {
        ...mission,
        completed: true,
      };
    }
    set(recalculate(mission));
  },
}));
