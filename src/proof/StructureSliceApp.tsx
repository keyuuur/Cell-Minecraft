import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { NearbyStation, NearbyStructure, PlacementPreview } from '../state/gameStore';
import type { PlaceableStructureId } from '../types/game';
import {
  activeStructureSupplies,
  STRUCTURE_FUNCTION_COPY,
  STRUCTURE_LABELS,
  structureMissionCheckpoint,
  VOXEL_STRUCTURE_ORDER,
} from '../voxel/structureMissionAdapter';
import {
  collectStructureSliceModule,
  collectStructureRecoveryDrop,
  initialStructureSliceState,
  inspectStructureSliceModule,
  placeSelectedStructureSliceModule,
  removeStructureSliceModule,
  selectedStructure,
  selectStructureSliceSlot,
  structureSliceObjective,
  STRUCTURE_SLOTS,
} from './structureSliceState';
import { StructureSliceCanvas, type StructureSliceController } from './StructureSliceCanvas';
import './voxelProof.css';
import './structureSlice.css';

const isPlaceable = (id: NearbyStation | NearbyStructure): id is PlaceableStructureId =>
  Boolean(id) && VOXEL_STRUCTURE_ORDER.includes(id as PlaceableStructureId);

const HOTBAR_ICONS: Record<PlaceableStructureId, string> = {
  nucleus: 'DNA',
  ribosomes: 'PRO',
  mitochondria: 'GLU',
  chloroplasts: 'SUN',
  centralVacuole: 'H2O',
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
            // Synthetic browser pointers do not always expose capture state.
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

export default function StructureSliceApp() {
  const controllerRef = useRef<StructureSliceController | null>(null);
  const [state, setState] = useState(initialStructureSliceState);
  const [nearbyStation, setNearbyStation] = useState<NearbyStation>(null);
  const [nearbyStructure, setNearbyStructure] = useState<NearbyStructure>(null);
  const [preview, setPreview] = useState<PlacementPreview | null>(null);
  const [paused, setPaused] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [fps, setFps] = useState(0);
  const [playerPosition, setPlayerPosition] = useState({ x: 10, y: 1, z: 10 });

  const checkpoint = useMemo(() => structureMissionCheckpoint(state.adapter), [state.adapter]);
  const addedPresent = VOXEL_STRUCTURE_ORDER.filter((id) => state.adapter.placements[id]).length;
  const addedObserved = VOXEL_STRUCTURE_ORDER.filter(
    (id) => state.adapter.functionEvidence[id],
  ).length;
  const selected = selectedStructure(state);
  const activeSupplies = activeStructureSupplies(state.adapter);
  const stationAction = isPlaceable(nearbyStation) && activeSupplies.includes(nearbyStation);
  const inspectAction =
    isPlaceable(nearbyStructure) &&
    Boolean(state.adapter.placements[nearbyStructure]) &&
    !state.adapter.functionEvidence[nearbyStructure];
  const removeAction =
    isPlaceable(nearbyStructure) &&
    state.selectedSlot === 0 &&
    Boolean(state.adapter.placements[nearbyStructure]) &&
    checkpoint.addedStructureCreditComplete;

  const handleReady = useCallback((controller: StructureSliceController | null) => {
    controllerRef.current = controller;
  }, []);
  const handleJoystick = useCallback((x: number, z: number) => {
    controllerRef.current?.setJoystick(x, z);
  }, []);

  const interact = () => {
    controllerRef.current?.swingTool();
    if (removeAction) {
      const position = controllerRef.current?.getPlacementPosition() ?? playerPosition;
      setState((current) => removeStructureSliceModule(current, nearbyStructure, position));
      return;
    }
    if (stationAction) {
      setState((current) => collectStructureSliceModule(current, nearbyStation));
      return;
    }
    if (inspectAction) {
      setState((current) => inspectStructureSliceModule(current, nearbyStructure));
    }
  };
  const place = () => {
    const position = controllerRef.current?.getPlacementPosition();
    if (!position) return;
    controllerRef.current?.swingTool();
    setState((current) => placeSelectedStructureSliceModule(current, position));
  };
  const togglePause = () => {
    const next = !paused;
    controllerRef.current?.setPaused(next);
    setPaused(next);
  };

  return (
    <main
      className="voxel-proof structure-slice"
      data-structure-stage={checkpoint.addedStructureCreditComplete ? 'complete' : 'building'}
      data-structure-score={checkpoint.score.total}
      data-structure-count={checkpoint.completedStructures}
      data-structure-selected={selected ?? 'pick'}
      data-structure-nearby-station={nearbyStation ?? 'none'}
      data-structure-nearby={nearbyStructure ?? 'none'}
      data-structure-placement={preview?.status ?? 'none'}
      data-structure-correction-started={state.correctionStarted}
      data-structure-correction-complete={state.correctionCompleted}
      data-structure-context-lost={contextLost}
      data-structure-player={`${playerPosition.x},${playerPosition.z}`}
      data-structure-recovery-drop={state.recoveryDrop?.id ?? 'none'}
      data-structure-recovery-drop-position={
        state.recoveryDrop
          ? `${state.recoveryDrop.position.x},${state.recoveryDrop.position.z}`
          : 'none'
      }
      data-foundation-storage-writes="0"
      data-foundation-api-requests="0"
      {...Object.fromEntries(
        VOXEL_STRUCTURE_ORDER.flatMap((id) => [
          [`data-${id.toLowerCase()}-placed`, Boolean(state.adapter.placements[id])],
          [`data-${id.toLowerCase()}-evidence`, Boolean(state.adapter.functionEvidence[id])],
          [`data-${id.toLowerCase()}-inventory`, state.inventory[id]],
        ]),
      )}
    >
      <StructureSliceCanvas
        mission={checkpoint.mission}
        selectedItem={selected}
        onContextLost={() => setContextLost(true)}
        onFps={setFps}
        onNearbyStation={setNearbyStation}
        onNearbyStructure={setNearbyStructure}
        onPlacementPreview={setPreview}
        onPlayerPosition={setPlayerPosition}
        onRecoveryDropCollected={(id) =>
          setState((current) => collectStructureRecoveryDrop(current, id))
        }
        recoveryDrop={state.recoveryDrop}
        onReady={handleReady}
      />

      <section className="voxel-proof-objective" aria-live="polite">
        <p className="voxel-proof-kicker">PHASE 4 · STRUCTURE MISSION · UNGRADED</p>
        <h1>{structureSliceObjective(state)}</h1>
        <div className="structure-progress" aria-label="Structure function evidence progress">
          <span className={addedPresent === 5 ? 'is-observed' : ''}>
            STRUCTURES {addedPresent}/5
          </span>
          <span className={addedObserved === 5 ? 'is-observed' : ''}>
            FUNCTIONS {addedObserved}/5
          </span>
        </div>
        <p className="boundary-checkpoint-score">
          MODEL CHECKPOINT {checkpoint.score.total}/80 · {checkpoint.completedStructures}/8 present
        </p>
        <p className="voxel-proof-model-note">
          Classroom model: organelles are installed prefabs, not ores. The nuclear membrane is
          visual only and is not a ninth structure.
        </p>
      </section>

      <div className="voxel-proof-utilities">
        <button type="button" onClick={() => controllerRef.current?.recenter()}>
          ⊕ RECENTER
        </button>
        <button type="button" onClick={() => controllerRef.current?.overview()}>
          ◫ OVERVIEW
        </button>
        <button type="button" onClick={togglePause}>
          ‖ PAUSE
        </button>
        <span className="voxel-proof-fps">{fps || '—'} FPS · DESKTOP/EMULATED</span>
      </div>

      <div className="voxel-proof-crosshair" aria-hidden="true">
        <span />
        <span />
      </div>

      {nearbyStation || nearbyStructure ? (
        <div className="voxel-proof-target-label">
          NEARBY: {isPlaceable(nearbyStation) ? STRUCTURE_LABELS[nearbyStation] : nearbyStation}
          {isPlaceable(nearbyStructure) ? STRUCTURE_LABELS[nearbyStructure] : nearbyStructure}
        </div>
      ) : null}

      {preview ? (
        <div className={`structure-zone-cue is-${preview.status}`}>
          {preview.status === 'valid' ? 'VALID' : 'BLOCKED'} · {preview.zoneLabel}
          {preview.reason ? <small>{preview.reason}</small> : null}
        </div>
      ) : null}

      <p
        className={`voxel-proof-feedback${state.invalidPlacement ? ' is-invalid' : ''}`}
        aria-live="assertive"
      >
        {state.feedback}
      </p>

      <MovementJoystick disabled={paused} onMove={handleJoystick} />

      <div className="voxel-proof-actions structure-actions">
        <button
          type="button"
          className="voxel-proof-action voxel-proof-mine structure-context-action"
          onClick={interact}
          disabled={!stationAction && !inspectAction && !removeAction}
          aria-label={
            removeAction
              ? 'REMOVE MODEL MODULE'
              : stationAction
                ? 'COLLECT MODEL MODULE'
                : 'INSPECT STRUCTURE'
          }
        >
          <span aria-hidden="true">{removeAction ? 'PICK' : stationAction ? 'GET' : 'VIEW'}</span>
          {removeAction ? 'REMOVE' : stationAction ? 'COLLECT' : 'INSPECT'}
        </button>
        <button
          type="button"
          className="voxel-proof-action voxel-proof-place structure-place-action"
          onClick={place}
          disabled={!selected}
          aria-label="PLACE MODEL MODULE"
        >
          <span aria-hidden="true">▦</span>
          PLACE
        </button>
      </div>

      <nav className="voxel-proof-hotbar structure-hotbar" aria-label="Structure builder hotbar">
        <button
          type="button"
          className={state.selectedSlot === 0 ? 'is-selected' : ''}
          aria-label={`Slot 1: Builder's Pick${state.selectedSlot === 0 ? ', selected' : ''}`}
          onClick={() => setState((current) => selectStructureSliceSlot(current, 0))}
        >
          <small>1</small>
          <strong aria-hidden="true">PICK</strong>
        </button>
        {VOXEL_STRUCTURE_ORDER.map((id) => {
          const slot = STRUCTURE_SLOTS[id];
          return (
            <button
              type="button"
              key={id}
              className={state.selectedSlot === slot ? 'is-selected' : ''}
              disabled={!state.inventory[id]}
              aria-label={`Slot ${slot + 1}: ${STRUCTURE_LABELS[id]}${state.selectedSlot === slot ? ', selected' : ''}`}
              onClick={() => setState((current) => selectStructureSliceSlot(current, slot))}
            >
              <small>{slot + 1}</small>
              <strong aria-hidden="true">{HOTBAR_ICONS[id]}</strong>
              {state.inventory[id] ? <b>{state.inventory[id]}</b> : null}
            </button>
          );
        })}
      </nav>

      <p className="voxel-proof-controls">
        WASD / ARROWS · DRAG TO LOOK · WALK TO DEPOTS · COLLECT · PLACE · INSPECT
      </p>

      {checkpoint.addedStructureCreditComplete && state.correctionCompleted ? (
        <section className="voxel-proof-complete structure-complete" role="status">
          <p>PHASE 4 CHECKPOINT COMPLETE</p>
          <h2>Eight structures · eight visible functions</h2>
          <p>80/80 available points earned. Drought and final stability remain for Phase 5.</p>
        </section>
      ) : null}

      {paused ? (
        <section className="voxel-proof-modal" role="dialog" aria-modal="true">
          <div>
            <p>STRUCTURE MISSION PAUSED</p>
            <h2>Input is cleared</h2>
            <p>Movement, drag-look, tool actions, and joystick input have stopped.</p>
            <button type="button" autoFocus onClick={togglePause}>
              RESUME STRUCTURE MISSION
            </button>
          </div>
        </section>
      ) : null}

      {contextLost ? (
        <section className="voxel-proof-modal is-error" role="alertdialog">
          <div>
            <p>GRAPHICS CONTEXT LOST</p>
            <h2>The structure slice stopped safely</h2>
            <p>Reload this development-only route before continuing.</p>
            <button type="button" onClick={() => window.location.reload()}>
              RELOAD STRUCTURE SLICE
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

export { STRUCTURE_FUNCTION_COPY };
