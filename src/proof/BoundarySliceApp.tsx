import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { initialBoundarySliceState, type BoundarySlicePhase } from './boundarySliceState';
import { BoundarySliceCanvas, type BoundarySliceController } from './BoundarySliceCanvas';
import type { BoundarySliceSnapshot } from './BoundarySliceScene';
import './voxelProof.css';

const PHASE_OBJECTIVES: Record<BoundarySlicePhase, string> = {
  'mine-wall-supply': 'Hold Mine once on the striped Wall Supply crate.',
  'collect-wall-stack': 'Walk over the physical Wall Module stack ×6.',
  'select-wall': 'Select hotbar slot 2: thick Cell Wall Model Module.',
  'build-wall': 'Place the next outer wall model module at the gold brackets.',
  'inspect-wall': 'Aim at the completed wall and Interact to check support.',
  'mine-membrane-supply': 'Select the pick, then mine the Membrane Supply crate once.',
  'collect-membrane-stack': 'Walk over the physical Membrane Module stack ×6.',
  'select-membrane': 'Select hotbar slot 3: thin Cell Membrane Model Module.',
  'build-membrane': 'Place the next membrane module inside its paired wall module.',
  'inspect-membrane': 'Aim at the membrane and Interact to check movement control.',
  'collect-repair': 'Walk over the removed model module to recover it.',
  'repair-module': 'Select the matching module and rebuild the empty gold bracket.',
  'reinspect-module': 'Interact with the rebuilt module to restore function credit.',
  'activate-cytoplasm': 'Aim at the Cytoplasm Control and tap Activate.',
  'inspect-cytoplasm': 'Interact again to inspect the gelatinous interior fill.',
  complete: 'Boundary checkpoint complete: nested layers and cytoplasm are stable.',
};

const initialSnapshot: BoundarySliceSnapshot = {
  state: initialBoundarySliceState,
  phase: 'mine-wall-supply',
  target: null,
  targetLabel: '',
  activeSector: 'none',
  fps: 0,
  score: 0,
  diagnostics: {
    world: '24x12x24',
    regionMeshes: 0,
    lastRebuiltRegions: [],
    totalRegionRebuilds: 0,
    targetCell: 'none',
    targetFace: 'none',
    adjacentCell: 'none',
    placementFailure: 'no-target',
    playerCell: 'none',
    autoSteps: 0,
    pickups: { active: 0, available: 4, reused: 0, capacity: 4 },
    actionHeld: false,
    cytoplasmSolidCells: 0,
    storageWrites: 0,
    apiRequests: 0,
  },
};

interface JoystickProps {
  disabled: boolean;
  onMove: (x: number, z: number) => void;
}

function MovementJoystick({ disabled, onMove }: JoystickProps) {
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

  const updatePosition = (clientX: number, clientY: number) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = Math.max(1, rect.width * 0.32);
    const rawX = clientX - (rect.left + rect.width / 2);
    const rawY = clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > radius ? radius / distance : 1;
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
          event.currentTarget.setPointerCapture(event.pointerId);
          updatePosition(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (!disabled && event.pointerId === pointerRef.current) {
            updatePosition(event.clientX, event.clientY);
          }
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <span className="voxel-proof-joystick-arrows" aria-hidden="true">
          ▲
          <br />
          ◀&nbsp;&nbsp;▶
          <br />▼
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

export default function BoundarySliceApp() {
  const controllerRef = useRef<BoundarySliceController | null>(null);
  const suppressHeldClickRef = useRef(false);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [paused, setPaused] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const handleReady = useCallback((controller: BoundarySliceController | null) => {
    controllerRef.current = controller;
  }, []);
  const handleSnapshot = useCallback((next: BoundarySliceSnapshot) => {
    setSnapshot(next);
  }, []);
  const handleContextLost = useCallback(() => {
    setContextLost(true);
  }, []);
  const handleJoystick = useCallback((x: number, z: number) => {
    controllerRef.current?.setJoystick(x, z);
  }, []);

  const setHeldAction = (active: boolean) => {
    controllerRef.current?.setActionHeld(active);
  };
  const stopHeldAction = () => {
    setHeldAction(false);
    window.setTimeout(() => {
      suppressHeldClickRef.current = false;
    }, 0);
  };
  const handleActionKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>, active: boolean) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setHeldAction(active);
    }
  };
  const togglePause = () => {
    const next = !paused;
    controllerRef.current?.setPaused(next);
    setPaused(next);
  };

  const selectedSlot = snapshot.state.inventory.selectedSlot;
  const removable =
    snapshot.phase === 'activate-cytoplasm' &&
    selectedSlot === 0 &&
    (snapshot.target === 'installed-wall' || snapshot.target === 'installed-membrane');
  const holdable =
    snapshot.target === 'wall-supply' || snapshot.target === 'membrane-supply' || removable;
  const interacting =
    snapshot.target === 'cytoplasm-control' ||
    snapshot.phase === 'inspect-wall' ||
    snapshot.phase === 'inspect-membrane' ||
    snapshot.phase === 'reinspect-module';
  const actionLabel = holdable
    ? `HOLD ${removable ? 'REMOVE' : 'MINE'}`
    : snapshot.phase === 'activate-cytoplasm'
      ? 'ACTIVATE'
      : interacting
        ? 'INTERACT'
        : 'USE PICK';
  const invalid = snapshot.state.feedback.startsWith('Invalid placement');
  const wallCount = snapshot.state.adapter.wallAnchors.length;
  const membraneCount = snapshot.state.adapter.membraneAnchors.length;

  return (
    <main
      className="voxel-proof boundary-slice"
      data-boundary-phase={snapshot.phase}
      data-boundary-target={snapshot.target ?? 'none'}
      data-boundary-target-label={snapshot.targetLabel}
      data-boundary-active-sector={snapshot.activeSector}
      data-boundary-wall-count={wallCount}
      data-boundary-membrane-count={membraneCount}
      data-boundary-cytoplasm={snapshot.state.adapter.cytoplasm}
      data-boundary-wall-evidence={snapshot.state.adapter.functionEvidence.cellWall}
      data-boundary-membrane-evidence={snapshot.state.adapter.functionEvidence.cellMembrane}
      data-boundary-cytoplasm-evidence={snapshot.state.adapter.functionEvidence.cytoplasm}
      data-boundary-score={snapshot.score}
      data-boundary-wall-inventory={snapshot.state.inventory.wallModules}
      data-boundary-membrane-inventory={snapshot.state.inventory.membraneModules}
      data-boundary-repair={snapshot.state.repair?.sectorId ?? 'none'}
      data-boundary-mining-progress={snapshot.state.miningProgress}
      data-boundary-action-held={snapshot.diagnostics.actionHeld}
      data-foundation-world={snapshot.diagnostics.world}
      data-foundation-target-cell={snapshot.diagnostics.targetCell}
      data-foundation-target-face={snapshot.diagnostics.targetFace}
      data-foundation-adjacent-cell={snapshot.diagnostics.adjacentCell}
      data-boundary-placement-failure={snapshot.diagnostics.placementFailure}
      data-foundation-player-cell={snapshot.diagnostics.playerCell}
      data-foundation-auto-steps={snapshot.diagnostics.autoSteps}
      data-foundation-last-regions={snapshot.diagnostics.lastRebuiltRegions.join(',')}
      data-foundation-region-meshes={snapshot.diagnostics.regionMeshes}
      data-foundation-region-rebuilds={snapshot.diagnostics.totalRegionRebuilds}
      data-foundation-pickups-active={snapshot.diagnostics.pickups.active}
      data-foundation-pickups-reused={snapshot.diagnostics.pickups.reused}
      data-boundary-cytoplasm-solid-cells={snapshot.diagnostics.cytoplasmSolidCells}
      data-foundation-storage-writes={snapshot.diagnostics.storageWrites}
      data-foundation-api-requests={snapshot.diagnostics.apiRequests}
    >
      <BoundarySliceCanvas
        onContextLost={handleContextLost}
        onReady={handleReady}
        onSnapshot={handleSnapshot}
      />

      <section className="voxel-proof-objective" aria-live="polite">
        <p className="voxel-proof-kicker">PHASE 3 · BOUNDARY SLICE · UNGRADED</p>
        <h1>{PHASE_OBJECTIVES[snapshot.phase]}</h1>
        <div className="boundary-layer-progress">
          <span>OUTER WALL {wallCount}/6</span>
          <span>INNER MEMBRANE {membraneCount}/6</span>
        </div>
        <p className="boundary-checkpoint-score">
          MODEL CHECKPOINT {snapshot.score}/100 · Later structures remain unbuilt.
        </p>
        <p className="voxel-proof-model-note">
          Classroom model: cells do not grow by mining or placing modules. Six cutaway sectors
          represent continuous nested boundaries.
        </p>
      </section>

      <div className="voxel-proof-utilities">
        <button type="button" onClick={() => controllerRef.current?.recenter()}>
          ⊕ RECENTER
        </button>
        <button type="button" onClick={togglePause}>
          ‖ PAUSE
        </button>
        <span className="voxel-proof-fps">{snapshot.fps || '—'} FPS · DESKTOP/EMULATED</span>
      </div>

      <div className="voxel-proof-crosshair" aria-hidden="true">
        <span />
        <span />
      </div>

      {snapshot.targetLabel ? (
        <div className="voxel-proof-target-label">{snapshot.targetLabel}</div>
      ) : null}

      {snapshot.state.miningProgress > 0 ? (
        <div
          className="voxel-proof-mining"
          role="progressbar"
          aria-label={removable ? 'Removal progress' : 'Mining progress'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(snapshot.state.miningProgress * 100)}
        >
          <span>{removable ? 'REMOVING MODEL MODULE' : 'OPENING MODEL SUPPLY'}</span>
          <div>
            <i style={{ width: `${Math.round(snapshot.state.miningProgress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      <p className={`voxel-proof-feedback${invalid ? ' is-invalid' : ''}`} aria-live="assertive">
        {snapshot.state.feedback}
      </p>

      <MovementJoystick
        key={paused ? 'paused' : 'active'}
        disabled={paused}
        onMove={handleJoystick}
      />

      <div className="voxel-proof-actions">
        <button
          type="button"
          className="voxel-proof-action voxel-proof-mine boundary-context-action"
          onClick={() => {
            if (suppressHeldClickRef.current) {
              suppressHeldClickRef.current = false;
            } else if (!holdable) {
              controllerRef.current?.interact();
            }
          }}
          onPointerDown={() => {
            if (holdable) {
              suppressHeldClickRef.current = true;
              setHeldAction(true);
            }
          }}
          onPointerUp={stopHeldAction}
          onPointerCancel={stopHeldAction}
          onPointerLeave={stopHeldAction}
          onKeyDown={(event) => {
            if (holdable) {
              suppressHeldClickRef.current = true;
              handleActionKeyboard(event, true);
            }
          }}
          onKeyUp={(event) => {
            if (holdable) handleActionKeyboard(event, false);
          }}
          aria-label={actionLabel}
        >
          <span aria-hidden="true">{holdable ? '⛏' : '◎'}</span>
          {actionLabel}
        </button>
        <button
          type="button"
          className="voxel-proof-action voxel-proof-place"
          onClick={() => controllerRef.current?.place()}
          aria-label="PLACE MODEL MODULE"
        >
          <span aria-hidden="true">▦</span>
          PLACE
        </button>
      </div>

      <nav className="voxel-proof-hotbar" aria-label="Boundary builder hotbar">
        {Array.from({ length: 9 }, (_, index) => {
          const enabled = index < 3;
          const selected = selectedSlot === index;
          const label =
            index === 0
              ? "Builder's Pick"
              : index === 1
                ? 'Cell Wall Model Module'
                : index === 2
                  ? 'Cell Membrane Model Module'
                  : 'Locked';
          const count =
            index === 1
              ? snapshot.state.inventory.wallModules
              : index === 2
                ? snapshot.state.inventory.membraneModules
                : 0;
          return (
            <button
              type="button"
              key={index}
              className={selected ? 'is-selected' : ''}
              disabled={!enabled}
              aria-label={`Slot ${index + 1}: ${label}${selected ? ', selected' : ''}`}
              onClick={() => controllerRef.current?.selectSlot(index)}
            >
              <small>{index + 1}</small>
              <strong aria-hidden="true">
                {index === 0 ? '⛏' : index === 1 ? '▤' : index === 2 ? '═' : '×'}
              </strong>
              {count > 0 ? <b>{count}</b> : null}
            </button>
          );
        })}
      </nav>

      <p className="voxel-proof-controls">
        WASD / ARROWS · DRAG TO LOOK · F HOLD ACTION · E USE / PLACE · 1–3 HOTBAR
      </p>

      {snapshot.phase === 'complete' ? (
        <section className="voxel-proof-complete" role="status">
          <p>BOUNDARY CHECKPOINT COMPLETE</p>
          <h2>Nested model layers stable</h2>
          <p>
            The thick outer wall supports the model, the thin inner membrane controls movement in
            and out, and cytoplasm fills the interior.
          </p>
          <p>This is a Phase 3 checkpoint, not a final classroom grade.</p>
        </section>
      ) : null}

      {paused ? (
        <section className="voxel-proof-modal" role="dialog" aria-modal="true">
          <div>
            <p>BOUNDARY SLICE PAUSED</p>
            <h2>Input is cleared</h2>
            <p>Movement, mining, removal, drag-look, and joystick state have stopped.</p>
            <button type="button" autoFocus onClick={togglePause}>
              RESUME BOUNDARY SLICE
            </button>
          </div>
        </section>
      ) : null}

      {contextLost ? (
        <section className="voxel-proof-modal is-error" role="alertdialog">
          <div>
            <p>GRAPHICS CONTEXT LOST</p>
            <h2>The boundary slice stopped safely</h2>
            <p>Reload this development-only route before continuing.</p>
            <button type="button" onClick={() => window.location.reload()}>
              RELOAD BOUNDARY SLICE
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
