import type { PlaceableStructureId, Point3 } from '../types/game';
import {
  activeStructureSupplies,
  assessStructureMissionPlacement,
  cloneStructureMissionVoxelState,
  collectStructureModule,
  createStructureMissionVoxelState,
  placeStructureMissionModule,
  recordStructureMissionFunction,
  removeStructureMissionModule,
  STRUCTURE_FUNCTION_COPY,
  STRUCTURE_LABELS,
  structureMissionCheckpoint,
  structureMissionStage,
  VOXEL_STRUCTURE_ORDER,
  type StructureMissionVoxelStateV2,
} from '../voxel/structureMissionAdapter';

export type StructureSliceSlot = 0 | 1 | 2 | 3 | 4 | 5;

export interface StructureSliceState {
  adapter: StructureMissionVoxelStateV2;
  selectedSlot: StructureSliceSlot;
  inventory: Record<PlaceableStructureId, number>;
  correctionStarted: boolean;
  correctionCompleted: boolean;
  recoveryDrop: { id: PlaceableStructureId; position: Point3 } | null;
  feedback: string;
  invalidPlacement: string | null;
}

export const STRUCTURE_SLOTS: Record<PlaceableStructureId, StructureSliceSlot> = {
  nucleus: 1,
  ribosomes: 2,
  mitochondria: 3,
  chloroplasts: 4,
  centralVacuole: 5,
};

export const SLOT_STRUCTURES: Partial<Record<StructureSliceSlot, PlaceableStructureId>> =
  Object.fromEntries(Object.entries(STRUCTURE_SLOTS).map(([id, slot]) => [slot, id]));

const emptyInventory = (): Record<PlaceableStructureId, number> => ({
  nucleus: 0,
  ribosomes: 0,
  mitochondria: 0,
  chloroplasts: 0,
  centralVacuole: 0,
});

export const initialStructureSliceState: StructureSliceState = {
  adapter: createStructureMissionVoxelState(),
  selectedSlot: 0,
  inventory: emptyInventory(),
  correctionStarted: false,
  correctionCompleted: false,
  recoveryDrop: null,
  feedback: 'Walk to a glowing Nucleus or Ribosomes model depot and tap Collect.',
  invalidPlacement: null,
};

export function cloneStructureSliceState(state: StructureSliceState): StructureSliceState {
  return {
    ...state,
    adapter: cloneStructureMissionVoxelState(state.adapter),
    inventory: { ...state.inventory },
    recoveryDrop: state.recoveryDrop
      ? { id: state.recoveryDrop.id, position: { ...state.recoveryDrop.position } }
      : null,
  };
}

export function selectedStructure(state: StructureSliceState): PlaceableStructureId | null {
  return SLOT_STRUCTURES[state.selectedSlot] ?? null;
}

export function selectStructureSliceSlot(
  state: StructureSliceState,
  slot: number,
): StructureSliceState {
  if (!Number.isInteger(slot) || slot < 0 || slot > 5) return state;
  const next = cloneStructureSliceState(state);
  next.selectedSlot = slot as StructureSliceSlot;
  next.invalidPlacement = null;
  const id = SLOT_STRUCTURES[next.selectedSlot];
  next.feedback = id
    ? `${STRUCTURE_LABELS[id]} model module selected.`
    : "Builder's Pick selected.";
  return next;
}

export function collectStructureSliceModule(
  state: StructureSliceState,
  id: PlaceableStructureId,
): StructureSliceState {
  const adapter = collectStructureModule(state.adapter, id);
  if (!adapter) {
    return {
      ...cloneStructureSliceState(state),
      feedback: 'That supply is not active for the current model stage.',
    };
  }
  const next = cloneStructureSliceState(state);
  next.adapter = adapter;
  next.inventory[id] += 1;
  next.selectedSlot = STRUCTURE_SLOTS[id];
  next.invalidPlacement = null;
  next.feedback = `${STRUCTURE_LABELS[id]} model module collected and selected.`;
  return next;
}

export function placeSelectedStructureSliceModule(
  state: StructureSliceState,
  position: Point3,
): StructureSliceState {
  const id = selectedStructure(state);
  if (!id || state.inventory[id] <= 0) {
    return {
      ...cloneStructureSliceState(state),
      invalidPlacement: 'Select a collected model module in the hotbar first.',
      feedback: 'Invalid placement: select a collected model module first.',
    };
  }
  const assessment = assessStructureMissionPlacement(state.adapter, id, position);
  if (!assessment.allowed) {
    return {
      ...cloneStructureSliceState(state),
      invalidPlacement: assessment.reason ?? 'That model placement is blocked.',
      feedback: `Invalid placement: ${assessment.reason ?? 'use the highlighted zone.'}`,
    };
  }
  const adapter = placeStructureMissionModule(state.adapter, id, position);
  if (!adapter) return state;
  const next = cloneStructureSliceState(state);
  next.adapter = adapter;
  next.inventory[id] -= 1;
  next.selectedSlot = 0;
  next.invalidPlacement = null;
  next.feedback = `${STRUCTURE_LABELS[id]} installed. Walk nearby and tap Inspect for function evidence.`;
  return next;
}

export function inspectStructureSliceModule(
  state: StructureSliceState,
  id: PlaceableStructureId,
): StructureSliceState {
  const adapter = recordStructureMissionFunction(state.adapter, id);
  if (!adapter) {
    return {
      ...cloneStructureSliceState(state),
      feedback: 'Move near an installed structure before inspecting it.',
    };
  }
  const next = cloneStructureSliceState(state);
  const wasRepair = Boolean(state.adapter.placements[id]) && !state.adapter.functionEvidence[id];
  next.adapter = adapter;
  next.invalidPlacement = null;
  if (
    state.correctionCompleted ||
    (state.correctionStarted && wasRepair && structureMissionCheckpoint(adapter).score.total === 80)
  ) {
    next.correctionCompleted = true;
  }
  next.feedback = `${STRUCTURE_FUNCTION_COPY[id]} Visible model evidence recorded.`;
  return next;
}

export function removeStructureSliceModule(
  state: StructureSliceState,
  id: PlaceableStructureId,
  dropPosition: Point3 = { x: 0, y: 1, z: 0 },
): StructureSliceState {
  const adapter = removeStructureMissionModule(state.adapter, id);
  if (!adapter) {
    return {
      ...cloneStructureSliceState(state),
      feedback: 'Aim near an installed model structure before removing it.',
    };
  }
  const next = cloneStructureSliceState(state);
  next.adapter = adapter;
  next.inventory[id] = 0;
  next.selectedSlot = 0;
  next.correctionStarted = true;
  next.recoveryDrop = {
    id,
    position: { x: dropPosition.x + 1.8, y: 1, z: dropPosition.z },
  };
  next.invalidPlacement = null;
  next.feedback = `${STRUCTURE_LABELS[id]} removed. Walk over the physical model drop, rebuild, then reinspect.`;
  return next;
}

export function collectStructureRecoveryDrop(
  state: StructureSliceState,
  id: PlaceableStructureId,
): StructureSliceState {
  if (!state.recoveryDrop || state.recoveryDrop.id !== id) return state;
  const next = cloneStructureSliceState(state);
  next.inventory[id] = 1;
  next.selectedSlot = STRUCTURE_SLOTS[id];
  next.recoveryDrop = null;
  next.feedback = `${STRUCTURE_LABELS[id]} model drop recovered. Rebuild, then reinspect.`;
  return next;
}

export function structureSliceObjective(state: StructureSliceState): string {
  if (state.recoveryDrop) {
    return `Walk over the physical ${STRUCTURE_LABELS[state.recoveryDrop.id]} model drop.`;
  }
  const missingEvidence = VOXEL_STRUCTURE_ORDER.find(
    (id) => state.adapter.placements[id] && !state.adapter.functionEvidence[id],
  );
  if (missingEvidence) {
    return `Move near the ${STRUCTURE_LABELS[missingEvidence]} and tap Inspect.`;
  }
  const active = activeStructureSupplies(state.adapter);
  if (active.length > 0) {
    return `Collect ${active.map((id) => STRUCTURE_LABELS[id]).join(' or ')} from a glowing model depot.`;
  }
  const stage = structureMissionStage(state.adapter);
  if (stage === 'complete') {
    return state.correctionCompleted
      ? 'Phase 4 checkpoint complete: all eight structures have visible function evidence.'
      : 'Checkpoint ready. Use the pick to remove one prefab, rebuild it, and reinspect.';
  }
  const selected = selectedStructure(state);
  return selected
    ? `Place the ${STRUCTURE_LABELS[selected]} in its highlighted valid zone.`
    : 'Select the collected model module in the hotbar.';
}

export function structureSliceCheckpoint(state: StructureSliceState) {
  return structureMissionCheckpoint(state.adapter);
}
