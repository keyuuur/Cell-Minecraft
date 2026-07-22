import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ASSIGNMENT, STRUCTURE_LABELS } from '../data/assignment';
import type { SaveStatus } from '../persistence/v3';
import type {
  AccessibilitySettings,
  ControlProfile,
  MissionHotbarItemId,
  MissionModuleId,
  PlaceableStructureId,
  QualityMode,
  ScoreBreakdown,
  VoxelMissionSnapshotV1,
} from '../types/game';
import { MISSION_STRUCTURE_ORDER } from '../voxel/missionDefinition';
import {
  createInitialVoxelMissionSnapshot,
  selectMissionViewModel,
  voxelMissionStage,
} from '../voxel/missionRuntime';
import type { VoxelMissionSceneSnapshot } from '../game/VoxelMissionScene';
import { VoxelMissionCanvas, type VoxelMissionController } from './VoxelMissionCanvas';
import './voxelProof.css';
import './voxelMission.css';

const HOTBAR: Array<{
  item: MissionHotbarItemId | null;
  label: string;
  icon: string;
}> = [
  { item: 'builder-pick', label: "Builder's Pick", icon: 'PICK' },
  { item: 'cellWall', label: STRUCTURE_LABELS.cellWall, icon: 'WALL' },
  { item: 'cellMembrane', label: STRUCTURE_LABELS.cellMembrane, icon: 'MEM' },
  { item: 'nucleus', label: STRUCTURE_LABELS.nucleus, icon: 'DNA' },
  { item: 'ribosomes', label: STRUCTURE_LABELS.ribosomes, icon: 'PRO' },
  { item: 'mitochondria', label: STRUCTURE_LABELS.mitochondria, icon: 'GLU' },
  { item: 'chloroplasts', label: STRUCTURE_LABELS.chloroplasts, icon: 'SUN' },
  { item: 'centralVacuole', label: STRUCTURE_LABELS.centralVacuole, icon: 'H2O' },
  { item: null, label: 'Reserved', icon: 'X' },
];

function sceneSnapshotFor(mission: VoxelMissionSnapshotV1): VoxelMissionSceneSnapshot {
  return {
    mission,
    target: null,
    targetLabel: '',
    viewModel: selectMissionViewModel(mission, null),
    score: 0,
    fps: 0,
    diagnostics: {
      world: '24x12x24',
      revision: 0,
      playerCell: '0,1,10',
      playerPosition: '0.000,0.500,10.000',
      recenterCell: 'none',
      recenterStage: 'normal',
      targetKind: 'none',
      targetCell: 'none',
      targetFace: 'none',
      placementValid: false,
      pickupsActive: 0,
      prefabCount: 0,
      regionMeshes: 0,
      totalRegionRebuilds: 0,
      actionHeld: false,
      actionProgress: 0,
      paused: false,
      overview: false,
      contextLost: false,
      quality: 'standard',
      renderWidth: 0,
      renderHeight: 0,
      renderLoopActive: false,
      assetRequests: 0,
      assetFailures: 0,
      assetInstances: 0,
      cytoplasmSolidCells: 0,
      storageWrites: 0,
      apiRequests: 0,
    },
  };
}

export interface VoxelMissionAppProps {
  mode?: 'proof' | 'classroom';
  initialMission?: VoxelMissionSnapshotV1;
  controls?: ControlProfile;
  qualityMode?: QualityMode;
  accessibility?: AccessibilitySettings;
  activeElapsedMs?: number;
  scoreBreakdown?: ScoreBreakdown;
  saveStatus?: SaveStatus | null;
  paused?: boolean;
  externalInterruption?: 'orientation' | null;
  finalizing?: boolean;
  finalizationError?: string;
  onMissionSnapshot?: (mission: VoxelMissionSnapshotV1) => void;
  onPauseChange?: (paused: boolean) => void;
  onUseHint?: (level: 1 | 2 | 3) => void;
  onSubmit?: (outcome: 'complete' | 'early') => Promise<void> | void;
  onRetryFinalization?: () => Promise<void> | void;
  onReturnToResults?: () => void;
  onContextLost?: () => void;
}

const SCORE_LABELS: Array<[keyof Omit<ScoreBreakdown, 'total'>, string, number]> = [
  ['boundary', 'Boundary', 15],
  ['requiredStructures', 'Required structures', 30],
  ['placementContext', 'Placement and context', 15],
  ['activationFunctions', 'Activation and functions', 20],
  ['droughtRecovery', 'Drought recovery', 15],
  ['finalStability', 'Final stability', 5],
];

function formatRemaining(activeElapsedMs: number): string {
  const remaining = Math.max(0, ASSIGNMENT.durationSeconds - Math.floor(activeElapsedMs / 1000));
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
}

function saveStatusText(status: SaveStatus | null | undefined): string {
  if (!status) return 'Preparing local save';
  if (status.state === 'checking') return 'Checking local save';
  if (status.state === 'dirty' || status.state === 'saving') return 'Saving locally…';
  if (status.state === 'saved') {
    return `Saved at ${new Date(status.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return 'Unable to save safely';
}

function turgorDescription(mission: VoxelMissionSnapshotV1): string {
  if (!mission.homeostasis.vacuoleHydratedObserved) return 'Not yet established';
  if (mission.homeostasis.droughtStarted && !mission.homeostasis.recoveryRestored) {
    return 'Less turgor pressure · shrunken vacuole · wilted plant';
  }
  if (mission.homeostasis.recoveryRestored) {
    return 'Turgor pressure restored · refilled vacuole · firm plant again';
  }
  return 'More turgor pressure · full vacuole · firm plant';
}

function missionSemanticKey(mission: VoxelMissionSnapshotV1): string {
  return JSON.stringify({
    boundary: mission.boundary,
    depotInventory: mission.depotInventory,
    placements: mission.placements,
    functionEvidence: mission.functionEvidence,
    moduleInventory: mission.moduleInventory,
    activeModulePickups: mission.activeModulePickups,
    selectedHotbarItem: mission.selectedHotbarItem,
    homeostasis: mission.homeostasis,
    correction: mission.correction,
    completion: mission.completion,
    lastFeedback: mission.lastFeedback,
    stageTimestamps: mission.stageTimestamps,
  });
}

function MovementJoystick({
  disabled,
  onMove,
}: {
  disabled: boolean;
  onMove: (x: number, z: number) => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });

  useEffect(
    () => () => {
      const element = padRef.current;
      const pointerId = pointerRef.current;
      if (element && pointerId !== null && element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
      pointerRef.current = null;
      onMove(0, 0);
    },
    [onMove],
  );

  const update = (clientX: number, clientY: number) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = Math.max(1, rect.width * 0.32);
    const rawX = clientX - (rect.left + rect.width / 2);
    const rawY = clientY - (rect.top + rect.height / 2);
    const scale = Math.min(1, radius / Math.max(radius, Math.hypot(rawX, rawY)));
    const x = rawX * scale;
    const y = rawY * scale;
    setThumb({ x, y });
    onMove(x / radius, -y / radius);
  };

  const release = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && event.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    setThumb({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div className="voxel-proof-joystick-wrap">
      <div
        ref={padRef}
        className="voxel-proof-joystick"
        role="application"
        aria-label="Movement joystick. Drag to walk."
        aria-disabled={disabled}
        onPointerDown={(event) => {
          if (disabled || pointerRef.current !== null) return;
          pointerRef.current = event.pointerId;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Synthetic pointers do not always create capture state.
          }
          update(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (!disabled && event.pointerId === pointerRef.current) {
            update(event.clientX, event.clientY);
          }
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <span className="voxel-proof-joystick-arrows" aria-hidden="true">
          UP
          <br />
          LEFT&nbsp;&nbsp;RIGHT
          <br />
          DOWN
        </span>
        <span
          className="voxel-proof-joystick-thumb"
          style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}
          aria-hidden="true"
        />
      </div>
      <span>MOVE</span>
    </div>
  );
}

function structureData(snapshot: VoxelMissionSceneSnapshot) {
  return Object.fromEntries(
    MISSION_STRUCTURE_ORDER.flatMap((id) => [
      [`data-mission-${id.toLowerCase()}-placed`, Boolean(snapshot.mission.placements[id])],
      [`data-mission-${id.toLowerCase()}-evidence`, Boolean(snapshot.mission.functionEvidence[id])],
      [`data-mission-${id.toLowerCase()}-inventory`, snapshot.mission.moduleInventory[id]],
    ]),
  ) as Record<string, string | number | boolean>;
}

function recoveryLabel(snapshot: VoxelMissionSceneSnapshot): string {
  const recovery = snapshot.mission.correction.recovery;
  if (!recovery) return 'none';
  return recovery.kind === 'pickup' ? 'pickup' : 'inventory';
}

export default function VoxelMissionApp({
  mode = 'proof',
  initialMission = createInitialVoxelMissionSnapshot(),
  controls = 'touch-only',
  qualityMode = 'auto',
  accessibility,
  activeElapsedMs = 0,
  scoreBreakdown,
  saveStatus,
  paused,
  externalInterruption = null,
  finalizing = false,
  finalizationError = '',
  onMissionSnapshot,
  onPauseChange,
  onUseHint,
  onSubmit,
  onRetryFinalization,
  onReturnToResults,
  onContextLost,
}: VoxelMissionAppProps = {}) {
  const classroom = mode === 'classroom';
  const missionRootRef = useRef<HTMLElement>(null);
  const controllerRef = useRef<VoxelMissionController | null>(null);
  const suppressHeldClickRef = useRef(false);
  const pausedRef = useRef(Boolean(paused || externalInterruption));
  const lastForwardedAtRef = useRef(0);
  const lastSemanticKeyRef = useRef('');
  const [snapshot, setSnapshot] = useState(() => sceneSnapshotFor(initialMission));
  const [contextLost, setContextLost] = useState(false);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [earlyConfirm, setEarlyConfirm] = useState(false);
  const [hintState, setHintState] = useState({ objective: '', level: 0 as 0 | 1 | 2 | 3 });

  const handleReady = useCallback((controller: VoxelMissionController | null) => {
    controllerRef.current = controller;
    controller?.setPaused(pausedRef.current);
  }, []);
  const handleSnapshot = useCallback(
    (next: VoxelMissionSceneSnapshot) => {
      setSnapshot(next);
      if (!onMissionSnapshot) return;
      const now = performance.now();
      const semanticKey = missionSemanticKey(next.mission);
      const semanticChanged = semanticKey !== lastSemanticKeyRef.current;
      if (semanticChanged || now - lastForwardedAtRef.current >= 750) {
        lastSemanticKeyRef.current = semanticKey;
        lastForwardedAtRef.current = now;
        onMissionSnapshot(next.mission);
      }
    },
    [onMissionSnapshot],
  );
  const handleContextLost = useCallback(() => {
    setContextLost(true);
    onContextLost?.();
  }, [onContextLost]);
  const handleJoystick = useCallback((x: number, z: number) => {
    controllerRef.current?.setJoystick(x, z);
  }, []);

  useEffect(() => {
    const interrupted = Boolean(paused || externalInterruption);
    pausedRef.current = interrupted;
    suppressHeldClickRef.current = false;
    controllerRef.current?.clearInput();
    controllerRef.current?.setPaused(interrupted);
  }, [externalInterruption, paused]);

  const mission = snapshot.mission;
  const stage = voxelMissionStage(mission);
  const structureCount = MISSION_STRUCTURE_ORDER.filter((id) => mission.placements[id]).length;
  const evidenceCount = MISSION_STRUCTURE_ORDER.filter((id) => mission.functionEvidence[id]).length;
  const holdable =
    snapshot.viewModel.primaryVerb === 'mine' || snapshot.viewModel.primaryVerb === 'remove';
  const invalid =
    snapshot.target?.kind === 'voxel' &&
    mission.selectedHotbarItem !== 'builder-pick' &&
    !snapshot.diagnostics.placementValid;
  const missionPaused = Boolean(paused || snapshot.diagnostics.paused);
  const activeModal =
    contextLost || snapshot.diagnostics.contextLost
      ? 'context-loss'
      : finalizationError
        ? 'finalization-error'
        : finalizing
          ? 'finalizing'
          : externalInterruption === 'orientation'
            ? 'orientation'
            : gradeOpen
              ? 'grade'
              : missionPaused
                ? 'pause'
                : null;
  const disabled =
    Boolean(activeModal) ||
    missionPaused ||
    snapshot.diagnostics.overview ||
    contextLost ||
    snapshot.diagnostics.contextLost;

  const stopHeldAction = () => {
    controllerRef.current?.setActionHeld(false);
    window.setTimeout(() => {
      suppressHeldClickRef.current = false;
    }, 0);
  };
  const handleActionKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>, active: boolean) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    controllerRef.current?.setActionHeld(active);
  };
  const togglePause = useCallback(() => {
    if (
      gradeOpen ||
      finalizing ||
      finalizationError ||
      externalInterruption ||
      contextLost ||
      snapshot.diagnostics.contextLost
    )
      return;
    const next = !missionPaused;
    controllerRef.current?.setPaused(next);
    onPauseChange?.(next);
  }, [
    contextLost,
    externalInterruption,
    finalizationError,
    finalizing,
    gradeOpen,
    onPauseChange,
    missionPaused,
    snapshot.diagnostics.contextLost,
  ]);
  const openGrade = useCallback(() => {
    if (
      finalizing ||
      finalizationError ||
      externalInterruption ||
      contextLost ||
      snapshot.diagnostics.contextLost
    )
      return;
    controllerRef.current?.setPaused(true);
    onPauseChange?.(true);
    setEarlyConfirm(false);
    setGradeOpen(true);
  }, [
    contextLost,
    externalInterruption,
    finalizationError,
    finalizing,
    onPauseChange,
    snapshot.diagnostics.contextLost,
  ]);
  const closeGrade = useCallback(() => {
    setGradeOpen(false);
    setEarlyConfirm(false);
    controllerRef.current?.setPaused(false);
    onPauseChange?.(false);
  }, [onPauseChange]);

  useEffect(() => {
    if (!activeModal && !snapshot.diagnostics.overview) return;
    suppressHeldClickRef.current = false;
    controllerRef.current?.clearInput();
  }, [activeModal, snapshot.diagnostics.overview]);

  useEffect(() => {
    const root = missionRootRef.current;
    if (!root || !activeModal) return;
    const modal = root.querySelector<HTMLElement>(`[data-mission-modal="${activeModal}"]`);
    if (!modal) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const isolated = Array.from(root.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && child !== modal)
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute('aria-hidden'),
      }));
    for (const record of isolated) {
      record.element.inert = true;
      record.element.setAttribute('aria-hidden', 'true');
    }

    const focusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hidden);
    const focusFirst = () => {
      const candidates = focusable();
      const preferred = modal.querySelector<HTMLElement>('[autofocus]');
      (preferred ?? candidates[0] ?? modal).focus();
    };
    if (!modal.contains(document.activeElement)) focusFirst();

    const handleFocus = (event: FocusEvent) => {
      if (!modal.contains(event.target as Node)) focusFirst();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (activeModal === 'grade') {
          event.preventDefault();
          if (earlyConfirm) setEarlyConfirm(false);
          else closeGrade();
        } else if (activeModal === 'pause') {
          event.preventDefault();
          togglePause();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const candidates = focusable();
      if (candidates.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = candidates[0];
      const last = candidates[candidates.length - 1];
      if (!modal.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('keydown', handleKey);
      for (const record of isolated) {
        record.element.inert = record.inert;
        if (record.ariaHidden === null) record.element.removeAttribute('aria-hidden');
        else record.element.setAttribute('aria-hidden', record.ariaHidden);
      }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [activeModal, closeGrade, earlyConfirm, togglePause]);

  const currentHintLevel =
    hintState.objective === snapshot.viewModel.objective ? hintState.level : 0;
  const nextHintLevel = Math.min(3, currentHintLevel + 1) as 1 | 2 | 3;
  const hintText =
    currentHintLevel === 1
      ? snapshot.viewModel.objective
      : currentHintLevel === 2
        ? 'Use Recenter to face the current goal, then walk until the target label appears near the crosshair.'
        : currentHintLevel === 3
          ? `Aim at the labeled target and use ${snapshot.viewModel.primaryActionLabel || 'the highlighted action'}.`
          : 'Hints become more specific one level at a time. They never deduct points.';
  const resolvedScore = useMemo(
    () => scoreBreakdown ?? ({ total: snapshot.score } as ScoreBreakdown),
    [scoreBreakdown, snapshot.score],
  );
  const finalReady =
    classroom &&
    !mission.completion.practice &&
    !mission.completion.completionLocked &&
    Boolean(mission.stageTimestamps.stable);
  const actionHoldable = !finalReady && holdable;
  const canSubmitEarly =
    classroom &&
    !mission.completion.practice &&
    !mission.completion.completionLocked &&
    mission.boundary.wallAnchors.length === 6 &&
    mission.boundary.membraneAnchors.length === 6 &&
    !finalReady;

  return (
    <main
      ref={missionRootRef}
      className="voxel-proof voxel-mission"
      data-active-modal={activeModal ?? 'none'}
      data-mission-phase={stage}
      data-mission-revision={snapshot.diagnostics.revision}
      data-mission-score={snapshot.score}
      data-mission-target={snapshot.diagnostics.targetKind}
      data-mission-target-cell={snapshot.diagnostics.targetCell}
      data-mission-target-face={snapshot.diagnostics.targetFace}
      data-mission-target-label={snapshot.targetLabel}
      data-mission-player={snapshot.diagnostics.playerCell}
      data-mission-player-position={snapshot.diagnostics.playerPosition}
      data-mission-recenter={snapshot.diagnostics.recenterCell}
      data-mission-recenter-stage={snapshot.diagnostics.recenterStage}
      data-mission-selected={mission.selectedHotbarItem}
      data-mission-action={snapshot.viewModel.primaryVerb ?? 'none'}
      data-mission-action-enabled={snapshot.viewModel.primaryActionEnabled}
      data-mission-wall-count={mission.boundary.wallAnchors.length}
      data-mission-membrane-count={mission.boundary.membraneAnchors.length}
      data-mission-cellwall-inventory={mission.moduleInventory.cellWall}
      data-mission-cellmembrane-inventory={mission.moduleInventory.cellMembrane}
      data-mission-cytoplasm={mission.boundary.cytoplasm}
      data-mission-wall-evidence={mission.boundary.functionEvidence.cellWall}
      data-mission-membrane-evidence={mission.boundary.functionEvidence.cellMembrane}
      data-mission-cytoplasm-evidence={mission.boundary.functionEvidence.cytoplasm}
      data-mission-prefab-count={snapshot.diagnostics.prefabCount}
      data-mission-pickups={snapshot.diagnostics.pickupsActive}
      data-mission-correction={mission.correction.removedTarget?.kind ?? 'none'}
      data-mission-recovery={recoveryLabel(snapshot)}
      data-mission-action-held={snapshot.diagnostics.actionHeld}
      data-mission-action-progress={snapshot.diagnostics.actionProgress.toFixed(3)}
      data-mission-paused={missionPaused}
      data-mission-overview={snapshot.diagnostics.overview}
      data-mission-context-lost={contextLost || snapshot.diagnostics.contextLost}
      data-mission-quality={snapshot.diagnostics.quality}
      data-mission-render-size={`${snapshot.diagnostics.renderWidth}x${snapshot.diagnostics.renderHeight}`}
      data-mission-render-loop={snapshot.diagnostics.renderLoopActive ? 'active' : 'suspended'}
      data-mission-asset-requests={snapshot.diagnostics.assetRequests}
      data-mission-asset-failures={snapshot.diagnostics.assetFailures}
      data-mission-asset-instances={snapshot.diagnostics.assetInstances}
      data-mission-active-ms={classroom ? Math.floor(activeElapsedMs) : undefined}
      data-mission-save-state={classroom ? (saveStatus?.state ?? 'checking') : undefined}
      data-mission-cytoplasm-solid-cells={snapshot.diagnostics.cytoplasmSolidCells}
      data-mission-storage-writes={classroom ? undefined : snapshot.diagnostics.storageWrites}
      data-mission-api-requests={classroom ? undefined : snapshot.diagnostics.apiRequests}
      {...structureData(snapshot)}
    >
      <VoxelMissionCanvas
        initialMission={initialMission}
        reducedMotion={accessibility?.reducedMotion}
        qualityMode={qualityMode}
        onContextLost={handleContextLost}
        onReady={handleReady}
        onSnapshot={handleSnapshot}
      />

      <section className="voxel-proof-objective" aria-live="polite">
        <p className="voxel-proof-kicker">
          {classroom
            ? mission.completion.practice
              ? 'UNGRADED PRACTICE · RECORDED RESULT STAYS LOCKED'
              : '15-MINUTE BIOLOGY BUILD · PLANT CELL MODEL'
            : 'PHASE 4.5 · ONE VOXEL RUNTIME · UNGRADED'}
        </p>
        <h1>{snapshot.viewModel.objective}</h1>
        <div className="boundary-layer-progress" aria-label="Integrated model progress">
          <span>WALL {mission.boundary.wallAnchors.length}/6</span>
          <span>MEMBRANE {mission.boundary.membraneAnchors.length}/6</span>
          <span>INTERIOR COMPONENTS {structureCount}/5</span>
          <span>
            FUNCTIONS{' '}
            {evidenceCount +
              (mission.boundary.functionEvidence.cellWall ? 1 : 0) +
              (mission.boundary.functionEvidence.cellMembrane ? 1 : 0) +
              (mission.boundary.functionEvidence.cytoplasm ? 1 : 0)}
            /8
          </span>
        </div>
        <p className="boundary-checkpoint-score">
          {classroom
            ? `CHECKPOINT GRADE ${snapshot.score}/100`
            : `MODEL CHECKPOINT ${snapshot.score}/80`}
        </p>
        <p className="voxel-proof-model-note">
          Classroom model: supplies are prefabs, not organelle ores. Cytoplasm is a non-solid
          interior fill. The nuclear membrane is visual only, not a ninth structure.
        </p>
      </section>

      <div className="voxel-proof-utilities">
        {snapshot.diagnostics.overview ? (
          <>
            <button
              type="button"
              className="mission-overview-close"
              onClick={() => controllerRef.current?.toggleOverview()}
              disabled={missionPaused || contextLost}
            >
              CLOSE VIEW
            </button>
            {classroom ? (
              <>
                <span className="voxel-classroom-timer">
                  {mission.completion.practice
                    ? 'UNTIMED PRACTICE'
                    : `${formatRemaining(activeElapsedMs)} LEFT`}
                </span>
                <span className="voxel-classroom-save">{saveStatusText(saveStatus)}</span>
              </>
            ) : null}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => controllerRef.current?.recenter()}
              disabled={disabled}
            >
              RECENTER
            </button>
            <button
              type="button"
              onClick={() => controllerRef.current?.toggleOverview()}
              disabled={missionPaused || contextLost}
            >
              OVERVIEW
            </button>
            <button type="button" onClick={togglePause} disabled={Boolean(activeModal)}>
              {activeModal === 'pause' ? 'RESUME' : 'PAUSE'}
            </button>
            {classroom ? (
              <>
                <button type="button" onClick={openGrade} disabled={disabled}>
                  GRADE
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const level = nextHintLevel;
                    setHintState({ objective: snapshot.viewModel.objective, level });
                    onUseHint?.(level);
                  }}
                  disabled={disabled || currentHintLevel >= 3}
                >
                  {currentHintLevel >= 3 ? 'HINT 3/3' : `HINT ${nextHintLevel}/3`}
                </button>
                {mission.completion.practice ? (
                  <button type="button" onClick={onReturnToResults} disabled={finalizing}>
                    END PRACTICE
                  </button>
                ) : null}
                <span className="voxel-classroom-timer">
                  {mission.completion.practice
                    ? 'UNTIMED PRACTICE'
                    : `${formatRemaining(activeElapsedMs)} LEFT`}
                </span>
                <span className="voxel-classroom-save">{saveStatusText(saveStatus)}</span>
              </>
            ) : (
              <span className="voxel-proof-fps">{snapshot.fps || '—'} FPS · DESKTOP/EMULATED</span>
            )}
          </>
        )}
        {snapshot.diagnostics.quality === 'low' ? (
          <span className="mission-quality-badge">LOW MODE · REDUCED GRAPHICS</span>
        ) : null}
      </div>

      {!snapshot.diagnostics.overview ? (
        <div className="voxel-proof-crosshair" aria-hidden="true">
          <span />
          <span />
        </div>
      ) : null}

      {!snapshot.diagnostics.overview && snapshot.targetLabel ? (
        <div className="voxel-proof-target-label">{snapshot.targetLabel}</div>
      ) : null}

      {snapshot.diagnostics.actionHeld ? (
        <div
          className="voxel-proof-mining"
          role="progressbar"
          aria-label={
            snapshot.viewModel.primaryVerb === 'remove' ? 'Removal progress' : 'Mining progress'
          }
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(snapshot.diagnostics.actionProgress * 100)}
        >
          <span>
            {snapshot.viewModel.primaryVerb === 'remove' ? 'REMOVING MODEL' : 'OPENING SUPPLY'}
          </span>
          <div>
            <i style={{ width: `${Math.round(snapshot.diagnostics.actionProgress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      <p className={`voxel-proof-feedback${invalid ? ' is-invalid' : ''}`} aria-live="assertive">
        {snapshot.viewModel.feedback?.message ?? 'Aim at the current model objective.'}
      </p>

      {classroom && currentHintLevel > 0 ? (
        <aside className="voxel-classroom-hint" aria-live="polite">
          <strong>HINT {currentHintLevel}/3</strong>
          <span>{hintText}</span>
        </aside>
      ) : null}

      {!classroom || controls === 'touch-only' ? (
        <MovementJoystick
          key={disabled ? 'disabled' : 'active'}
          disabled={disabled}
          onMove={handleJoystick}
        />
      ) : null}

      <div className="voxel-proof-actions mission-actions">
        <button
          type="button"
          className={`voxel-proof-action mission-primary-action${actionHoldable ? ' voxel-proof-mine' : ' voxel-proof-place'}`}
          disabled={
            finalizing || (!finalReady && (disabled || !snapshot.viewModel.primaryActionEnabled))
          }
          aria-label={
            finalReady
              ? 'Submit the final graded result'
              : snapshot.viewModel.primaryActionAccessibleLabel
          }
          onClick={() => {
            if (finalReady) {
              void onSubmit?.('complete');
              return;
            }
            if (suppressHeldClickRef.current) {
              suppressHeldClickRef.current = false;
            } else if (!actionHoldable) {
              controllerRef.current?.action();
            }
          }}
          onPointerDown={() => {
            if (!actionHoldable) return;
            suppressHeldClickRef.current = true;
            controllerRef.current?.setActionHeld(true);
          }}
          onPointerUp={stopHeldAction}
          onPointerCancel={stopHeldAction}
          onPointerLeave={stopHeldAction}
          onKeyDown={(event) => {
            if (!actionHoldable) return;
            suppressHeldClickRef.current = true;
            handleActionKeyboard(event, true);
          }}
          onKeyUp={(event) => {
            if (actionHoldable) handleActionKeyboard(event, false);
          }}
        >
          <span aria-hidden="true">{finalReady ? 'GRADE' : actionHoldable ? 'TOOL' : 'USE'}</span>
          {finalizing
            ? 'LOCKING RESULT…'
            : finalReady
              ? 'SUBMIT FINAL RESULT'
              : actionHoldable
                ? `HOLD ${snapshot.viewModel.primaryActionLabel}`
                : snapshot.viewModel.primaryActionLabel}
        </button>
      </div>

      <nav className="voxel-proof-hotbar mission-hotbar" aria-label="Integrated model hotbar">
        {HOTBAR.map(({ item, label, icon }, index) => {
          const count =
            item && item !== 'builder-pick' ? mission.moduleInventory[item as MissionModuleId] : 0;
          const selected = mission.selectedHotbarItem === item;
          const enabled = item === 'builder-pick' || Boolean(item && count > 0);
          return (
            <button
              type="button"
              key={`${index}-${label}`}
              className={selected ? 'is-selected' : ''}
              disabled={!enabled || disabled}
              aria-label={`Slot ${index + 1}: ${label}${selected ? ', selected' : ''}`}
              onClick={() => item && controllerRef.current?.selectItem(item)}
            >
              <small>{index + 1}</small>
              <strong aria-hidden="true">{icon}</strong>
              {count > 0 ? <b>{count}</b> : null}
            </button>
          );
        })}
      </nav>

      <p className="voxel-proof-controls">
        WASD / ARROWS · DRAG TO LOOK · HOLD TOOL · USE · 1–8 HOTBAR
      </p>

      {!classroom && snapshot.score === 80 && evidenceCount === 5 ? (
        <section className="voxel-proof-complete mission-complete" role="status">
          <p>PHASE 4.5 MODEL CHECKPOINT</p>
          <h2>Eight structures · eight visible functions</h2>
          <p>80/80 available points. Drought and final stability remain for the classroom phase.</p>
        </section>
      ) : null}

      {snapshot.diagnostics.overview ? (
        <aside className="mission-overview-note" aria-live="polite">
          <strong>{classroom ? 'CELL SYSTEM OVERVIEW' : 'OVERVIEW CUTAWAY'}</strong>
          <span>
            {classroom
              ? turgorDescription(mission)
              : 'Close Overview to resume walking and building.'}
          </span>
          {classroom ? <small>Close Overview to resume walking and building.</small> : null}
        </aside>
      ) : null}

      {classroom && activeModal === 'finalizing' ? (
        <section
          className="voxel-proof-modal"
          data-mission-modal="finalizing"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mission-finalizing-title"
          tabIndex={-1}
        >
          <div>
            <p>LOCKING GRADED RESULT</p>
            <h2 id="mission-finalizing-title">Confirming the local save</h2>
            <p>
              Gameplay and the active timer are frozen until the immutable grade and delivery queue
              are both stored on this device.
            </p>
          </div>
        </section>
      ) : null}

      {classroom && activeModal === 'grade' ? (
        <section
          className="voxel-proof-modal voxel-classroom-grade"
          data-mission-modal="grade"
          role="dialog"
          aria-modal="true"
          aria-labelledby="voxel-grade-title"
          tabIndex={-1}
        >
          <div>
            <p>CHECKPOINT GRADE · NO QUIZ</p>
            <h2 id="voxel-grade-title">{Math.round(resolvedScore.total)}%</h2>
            <dl className="voxel-grade-breakdown">
              {SCORE_LABELS.map(([key, label, maximum]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {resolvedScore[key]} / {maximum}
                  </dd>
                </div>
              ))}
            </dl>
            {earlyConfirm ? (
              <div className="voxel-early-confirm" role="alert">
                <strong>Lock {Math.round(resolvedScore.total)}% now?</strong>
                <span>Unfinished objectives remain unearned in this graded result.</span>
                <div>
                  <button type="button" onClick={() => setEarlyConfirm(false)}>
                    KEEP BUILDING
                  </button>
                  <button
                    type="button"
                    disabled={finalizing}
                    onClick={() => void onSubmit?.('early')}
                  >
                    {finalizing ? 'LOCKING RESULT…' : 'SUBMIT EARLY RESULT'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="voxel-grade-actions">
                <button type="button" autoFocus onClick={closeGrade}>
                  RETURN TO MISSION
                </button>
                {canSubmitEarly ? (
                  <button type="button" onClick={() => setEarlyConfirm(true)}>
                    SUBMIT THIS GRADE EARLY
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {classroom && activeModal === 'finalization-error' ? (
        <section
          className="voxel-proof-modal is-error"
          data-mission-modal="finalization-error"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="mission-save-error-title"
          tabIndex={-1}
        >
          <div>
            <p>RESULT NOT LOCKED</p>
            <h2 id="mission-save-error-title">Local finalization did not finish</h2>
            <p>{finalizationError}</p>
            <p>Your mission remains available. No successful submission is being claimed.</p>
            <button type="button" autoFocus onClick={() => void onRetryFinalization?.()}>
              RETRY LOCAL FINALIZATION
            </button>
          </div>
        </section>
      ) : null}

      {activeModal === 'orientation' ? (
        <section
          className="voxel-proof-modal"
          data-mission-modal="orientation"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mission-orientation-title"
          aria-describedby="mission-orientation-description"
          tabIndex={-1}
        >
          <div>
            <p>MISSION INTERRUPTED · TIMER STOPPED</p>
            <h2 id="mission-orientation-title">Rotate to landscape</h2>
            <p id="mission-orientation-description">
              Movement, looking, and held actions are cleared. {saveStatusText(saveStatus)}. After
              rotating back, press Resume Mission before play continues.
            </p>
          </div>
        </section>
      ) : null}

      {activeModal === 'pause' ? (
        <section
          className="voxel-proof-modal"
          data-mission-modal="pause"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mission-pause-title"
          tabIndex={-1}
        >
          <div>
            <p>{classroom ? 'MISSION PAUSED · TIMER STOPPED' : 'INTEGRATED MISSION PAUSED'}</p>
            <h2 id="mission-pause-title">Input is cleared</h2>
            <p>
              Movement, drag-look, held tools, and joystick input have stopped.
              {classroom ? ` ${saveStatusText(saveStatus)}.` : ''}
            </p>
            <button type="button" autoFocus onClick={togglePause}>
              RESUME MISSION
            </button>
          </div>
        </section>
      ) : null}

      {activeModal === 'context-loss' ? (
        <section
          className="voxel-proof-modal is-error"
          data-mission-modal="context-loss"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="mission-context-title"
          tabIndex={-1}
        >
          <div>
            <p>GRAPHICS CONTEXT LOST</p>
            <h2 id="mission-context-title">The voxel mission stopped safely</h2>
            <p>
              {classroom
                ? 'Gameplay and the active timer are frozen. Reload to restore the last confirmed local save.'
                : 'Reload this development-only route before continuing.'}
            </p>
            <button type="button" autoFocus onClick={() => window.location.reload()}>
              RELOAD VOXEL MISSION
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

export const MISSION_HOTBAR_STRUCTURE_IDS: readonly PlaceableStructureId[] =
  MISSION_STRUCTURE_ORDER;
