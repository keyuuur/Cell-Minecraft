import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { STRUCTURE_LABELS } from '../data/assignment';
import type { MissionHotbarItemId, MissionModuleId, PlaceableStructureId } from '../types/game';
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

const initialMission = createInitialVoxelMissionSnapshot();
const initialSnapshot: VoxelMissionSceneSnapshot = {
  mission: initialMission,
  target: null,
  targetLabel: '',
  viewModel: selectMissionViewModel(initialMission, null),
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
    cytoplasmSolidCells: 0,
    storageWrites: 0,
    apiRequests: 0,
  },
};

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

export default function VoxelMissionApp() {
  const controllerRef = useRef<VoxelMissionController | null>(null);
  const suppressHeldClickRef = useRef(false);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [contextLost, setContextLost] = useState(false);

  const handleReady = useCallback((controller: VoxelMissionController | null) => {
    controllerRef.current = controller;
  }, []);
  const handleSnapshot = useCallback((next: VoxelMissionSceneSnapshot) => {
    setSnapshot(next);
  }, []);
  const handleContextLost = useCallback(() => setContextLost(true), []);
  const handleJoystick = useCallback((x: number, z: number) => {
    controllerRef.current?.setJoystick(x, z);
  }, []);

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
  const disabled =
    snapshot.diagnostics.paused ||
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
  const togglePause = () => {
    controllerRef.current?.setPaused(!snapshot.diagnostics.paused);
  };

  return (
    <main
      className="voxel-proof voxel-mission"
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
      data-mission-paused={snapshot.diagnostics.paused}
      data-mission-overview={snapshot.diagnostics.overview}
      data-mission-context-lost={contextLost || snapshot.diagnostics.contextLost}
      data-mission-cytoplasm-solid-cells={snapshot.diagnostics.cytoplasmSolidCells}
      data-mission-storage-writes={snapshot.diagnostics.storageWrites}
      data-mission-api-requests={snapshot.diagnostics.apiRequests}
      {...structureData(snapshot)}
    >
      <VoxelMissionCanvas
        onContextLost={handleContextLost}
        onReady={handleReady}
        onSnapshot={handleSnapshot}
      />

      <section className="voxel-proof-objective" aria-live="polite">
        <p className="voxel-proof-kicker">PHASE 4.5 · ONE VOXEL RUNTIME · UNGRADED</p>
        <h1>{snapshot.viewModel.objective}</h1>
        <div className="boundary-layer-progress" aria-label="Integrated model progress">
          <span>WALL {mission.boundary.wallAnchors.length}/6</span>
          <span>MEMBRANE {mission.boundary.membraneAnchors.length}/6</span>
          <span>STRUCTURES {structureCount}/5</span>
          <span>
            FUNCTIONS{' '}
            {evidenceCount +
              (mission.boundary.functionEvidence.cellWall ? 1 : 0) +
              (mission.boundary.functionEvidence.cellMembrane ? 1 : 0) +
              (mission.boundary.functionEvidence.cytoplasm ? 1 : 0)}
            /8
          </span>
        </div>
        <p className="boundary-checkpoint-score">MODEL CHECKPOINT {snapshot.score}/80</p>
        <p className="voxel-proof-model-note">
          Classroom model: supplies are prefabs, not organelle ores. Cytoplasm is a non-solid
          interior fill. The nuclear membrane is visual only, not a ninth structure.
        </p>
      </section>

      <div className="voxel-proof-utilities">
        <button type="button" onClick={() => controllerRef.current?.recenter()} disabled={disabled}>
          RECENTER
        </button>
        <button
          type="button"
          onClick={() => controllerRef.current?.toggleOverview()}
          disabled={snapshot.diagnostics.paused || contextLost}
        >
          {snapshot.diagnostics.overview ? 'CLOSE VIEW' : 'OVERVIEW'}
        </button>
        <button type="button" onClick={togglePause} disabled={contextLost}>
          {snapshot.diagnostics.paused ? 'RESUME' : 'PAUSE'}
        </button>
        <span className="voxel-proof-fps">{snapshot.fps || '—'} FPS · DESKTOP/EMULATED</span>
      </div>

      {!snapshot.diagnostics.overview ? (
        <div className="voxel-proof-crosshair" aria-hidden="true">
          <span />
          <span />
        </div>
      ) : null}

      {snapshot.targetLabel ? (
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

      <MovementJoystick
        key={disabled ? 'disabled' : 'active'}
        disabled={disabled}
        onMove={handleJoystick}
      />

      <div className="voxel-proof-actions mission-actions">
        <button
          type="button"
          className={`voxel-proof-action mission-primary-action${holdable ? ' voxel-proof-mine' : ' voxel-proof-place'}`}
          disabled={disabled || !snapshot.viewModel.primaryActionEnabled}
          aria-label={snapshot.viewModel.primaryActionAccessibleLabel}
          onClick={() => {
            if (suppressHeldClickRef.current) {
              suppressHeldClickRef.current = false;
            } else if (!holdable) {
              controllerRef.current?.action();
            }
          }}
          onPointerDown={() => {
            if (!holdable) return;
            suppressHeldClickRef.current = true;
            controllerRef.current?.setActionHeld(true);
          }}
          onPointerUp={stopHeldAction}
          onPointerCancel={stopHeldAction}
          onPointerLeave={stopHeldAction}
          onKeyDown={(event) => {
            if (!holdable) return;
            suppressHeldClickRef.current = true;
            handleActionKeyboard(event, true);
          }}
          onKeyUp={(event) => {
            if (holdable) handleActionKeyboard(event, false);
          }}
        >
          <span aria-hidden="true">{holdable ? 'TOOL' : 'USE'}</span>
          {holdable
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

      {snapshot.score === 80 && evidenceCount === 5 ? (
        <section className="voxel-proof-complete mission-complete" role="status">
          <p>PHASE 4.5 MODEL CHECKPOINT</p>
          <h2>Eight structures · eight visible functions</h2>
          <p>80/80 available points. Drought and final stability remain for the classroom phase.</p>
        </section>
      ) : null}

      {snapshot.diagnostics.overview ? (
        <aside className="mission-overview-note" aria-live="polite">
          <strong>OVERVIEW CUTAWAY</strong>
          <span>Close Overview to resume walking and building.</span>
        </aside>
      ) : null}

      {snapshot.diagnostics.paused && !contextLost ? (
        <section
          className="voxel-proof-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mission-pause-title"
        >
          <div>
            <p>INTEGRATED MISSION PAUSED</p>
            <h2 id="mission-pause-title">Input is cleared</h2>
            <p>Movement, drag-look, held tools, and joystick input have stopped.</p>
            <button type="button" autoFocus onClick={togglePause}>
              RESUME VOXEL MISSION
            </button>
          </div>
        </section>
      ) : null}

      {contextLost || snapshot.diagnostics.contextLost ? (
        <section
          className="voxel-proof-modal is-error"
          role="alertdialog"
          aria-labelledby="mission-context-title"
        >
          <div>
            <p>GRAPHICS CONTEXT LOST</p>
            <h2 id="mission-context-title">The voxel mission stopped safely</h2>
            <p>Reload this development-only route before continuing.</p>
            <button type="button" onClick={() => window.location.reload()}>
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
