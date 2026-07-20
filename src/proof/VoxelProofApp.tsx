import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { VoxelProofCanvas, type VoxelProofController } from './VoxelProofCanvas';
import { initialProofState, proofPhase, type ProofPhase } from './proofState';
import type { VoxelProofSnapshot } from './VoxelProofScene';
import './voxelProof.css';

const PHASE_OBJECTIVES: Record<ProofPhase, string> = {
  'mine-supply': 'Aim at the striped Wall Module supply block. Hold Mine.',
  'collect-supply': 'Walk over the dropped Wall Module to collect it.',
  'select-wall': 'Select hotbar slot 2: Wall Module.',
  'place-wall': 'Follow the path, aim at the outlined outer wall anchor, then Place.',
  'select-tool': "Select hotbar slot 1: Builder's Pick.",
  'remove-wall': 'Aim at the installed wall and hold Remove.',
  'collect-repair': 'Walk over the dropped module to collect it again.',
  'repair-wall': 'Select slot 2, aim at the anchor, and replace the wall.',
  complete: 'Proof complete: you mined, collected, placed, removed, and repaired.',
};

const initialSnapshot: VoxelProofSnapshot = {
  state: { ...initialProofState },
  phase: proofPhase(initialProofState),
  target: null,
  targetLabel: '',
  fps: 0,
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

export default function VoxelProofApp() {
  const controllerRef = useRef<VoxelProofController | null>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [paused, setPaused] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const handleReady = useCallback((controller: VoxelProofController | null) => {
    controllerRef.current = controller;
  }, []);
  const handleSnapshot = useCallback((next: VoxelProofSnapshot) => {
    setSnapshot(next);
  }, []);
  const handleContextLost = useCallback(() => {
    setContextLost(true);
  }, []);
  const handleJoystick = useCallback((x: number, z: number) => {
    controllerRef.current?.setJoystick(x, z);
  }, []);

  const setMining = (active: boolean) => {
    controllerRef.current?.setMining(active);
  };
  const stopMining = () => setMining(false);
  const handleMineKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>, active: boolean) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setMining(active);
    }
  };
  const togglePause = () => {
    const next = !paused;
    controllerRef.current?.setPaused(next);
    setPaused(next);
  };

  const isInvalid = snapshot.state.feedback.startsWith('Invalid placement');
  const actionLabel = snapshot.target === 'placed-wall' ? 'REMOVE' : 'MINE';

  return (
    <main
      className="voxel-proof"
      data-proof-phase={snapshot.phase}
      data-proof-target={snapshot.target ?? 'none'}
    >
      <VoxelProofCanvas
        onContextLost={handleContextLost}
        onReady={handleReady}
        onSnapshot={handleSnapshot}
      />

      <section className="voxel-proof-objective" aria-live="polite">
        <p className="voxel-proof-kicker">VOXEL GAMEPLAY PROOF · UNGRADED</p>
        <h1>{PHASE_OBJECTIVES[snapshot.phase]}</h1>
        <p>A plant cell&apos;s wall provides support.</p>
        <p className="voxel-proof-model-note">
          Fictional model: real cells do not mine blocks, craft parts, or install organelles.
        </p>
      </section>

      <div className="voxel-proof-utilities">
        <button type="button" onClick={() => controllerRef.current?.recenter()}>
          ⊕ RECENTER
        </button>
        <button type="button" onClick={togglePause}>
          ‖ PAUSE
        </button>
        <span className="voxel-proof-fps">{snapshot.fps || '—'} FPS</span>
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
          aria-label="Mining progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(snapshot.state.miningProgress * 100)}
        >
          <span>BREAKING MODEL BLOCK</span>
          <div>
            <i style={{ width: `${Math.round(snapshot.state.miningProgress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      <p className={`voxel-proof-feedback${isInvalid ? ' is-invalid' : ''}`} aria-live="assertive">
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
          className="voxel-proof-action voxel-proof-mine"
          onPointerDown={() => setMining(true)}
          onPointerUp={stopMining}
          onPointerCancel={stopMining}
          onPointerLeave={stopMining}
          onKeyDown={(event) => handleMineKeyboard(event, true)}
          onKeyUp={(event) => handleMineKeyboard(event, false)}
        >
          <span aria-hidden="true">⛏</span>
          HOLD {actionLabel}
        </button>
        <button
          type="button"
          className="voxel-proof-action voxel-proof-place"
          onClick={() => controllerRef.current?.place()}
        >
          <span aria-hidden="true">▦</span>
          PLACE
        </button>
      </div>

      <nav className="voxel-proof-hotbar" aria-label="Builder hotbar">
        {Array.from({ length: 9 }, (_, index) => {
          const enabled = index < 2;
          const selected = snapshot.state.selectedSlot === index;
          const label = index === 0 ? "Builder's Pick" : index === 1 ? 'Wall Module' : 'Locked';
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
              <strong aria-hidden="true">{index === 0 ? '⛏' : index === 1 ? '▦' : '×'}</strong>
              {index === 1 && snapshot.state.inventoryCount > 0 ? (
                <b>{snapshot.state.inventoryCount}</b>
              ) : null}
            </button>
          );
        })}
      </nav>

      <p className="voxel-proof-controls">
        WASD / ARROWS · DRAG TO LOOK · F HOLD MINE · E PLACE · 1–2 HOTBAR
      </p>

      {snapshot.phase === 'complete' ? (
        <section className="voxel-proof-complete" role="status">
          <p>MODEL REPAIRED</p>
          <h2>Voxel interaction loop complete</h2>
          <p>
            Walking, targeting, mining, pickup, hotbar selection, placement, removal, and repair all
            passed in memory.
          </p>
        </section>
      ) : null}

      {paused ? (
        <section className="voxel-proof-modal" role="dialog" aria-modal="true">
          <div>
            <p>PROOF PAUSED</p>
            <h2>Input is cleared</h2>
            <p>Movement, mining, drag-look, and joystick state have stopped.</p>
            <button type="button" autoFocus onClick={togglePause}>
              RESUME PROOF
            </button>
          </div>
        </section>
      ) : null}

      {contextLost ? (
        <section className="voxel-proof-modal is-error" role="alertdialog">
          <div>
            <p>GRAPHICS CONTEXT LOST</p>
            <h2>The proof stopped safely</h2>
            <p>Reload this development-only route before continuing.</p>
            <button type="button" onClick={() => window.location.reload()}>
              RELOAD PROOF
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
