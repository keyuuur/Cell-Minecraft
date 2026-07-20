import {
  BOUNDARY_SECTOR_COUNT,
  assessBoundaryPlacement,
  boundaryCheckpoint,
  cloneBoundaryVoxelState,
  createBoundaryVoxelState,
  establishBoundaryCytoplasm,
  placeBoundaryModule,
  recordBoundaryFunction,
  removeBoundaryModule,
  type BoundaryFunctionId,
  type BoundaryLayer,
  type BoundaryVoxelStateV1,
} from '../voxel/boundaryAdapter';
import type { VoxelItemId } from '../voxel/HotbarInventory';

export type BoundarySliceTarget =
  | 'wall-supply'
  | 'membrane-supply'
  | 'wall-anchor'
  | 'membrane-anchor'
  | 'installed-wall'
  | 'installed-membrane'
  | 'cytoplasm-control'
  | null;

export type BoundarySlicePhase =
  | 'mine-wall-supply'
  | 'collect-wall-stack'
  | 'select-wall'
  | 'build-wall'
  | 'inspect-wall'
  | 'mine-membrane-supply'
  | 'collect-membrane-stack'
  | 'select-membrane'
  | 'build-membrane'
  | 'inspect-membrane'
  | 'collect-repair'
  | 'repair-module'
  | 'reinspect-module'
  | 'activate-cytoplasm'
  | 'inspect-cytoplasm'
  | 'complete';

export interface BoundarySliceInventory {
  selectedSlot: 0 | 1 | 2;
  wallModules: number;
  membraneModules: number;
}

export interface BoundaryRepair {
  layer: BoundaryLayer;
  sectorId: string;
  collected: boolean;
  replaced: boolean;
}

export interface BoundarySliceState {
  adapter: BoundaryVoxelStateV1;
  inventory: BoundarySliceInventory;
  wallSupplyReleased: boolean;
  membraneSupplyReleased: boolean;
  miningProgress: number;
  miningTarget: BoundarySliceTarget;
  repair: BoundaryRepair | null;
  feedback: string;
}

export interface BoundaryMiningTransition {
  state: BoundarySliceState;
  event: 'none' | 'wall-stack-released' | 'membrane-stack-released' | 'module-removed';
  removed?: { layer: BoundaryLayer; sectorId: string };
}

export interface BoundaryPlacementTransition {
  state: BoundarySliceState;
  event: 'none' | 'module-placed' | 'module-repaired';
  layer?: BoundaryLayer;
  sectorId?: string;
}

export const initialBoundarySliceState: BoundarySliceState = {
  adapter: createBoundaryVoxelState(),
  inventory: {
    selectedSlot: 0,
    wallModules: 0,
    membraneModules: 0,
  },
  wallSupplyReleased: false,
  membraneSupplyReleased: false,
  miningProgress: 0,
  miningTarget: null,
  repair: null,
  feedback: 'Aim at the striped Wall Supply crate and hold Mine once.',
};

export function cloneBoundarySliceState(state: BoundarySliceState): BoundarySliceState {
  return {
    ...state,
    adapter: cloneBoundaryVoxelState(state.adapter),
    inventory: { ...state.inventory },
    repair: state.repair ? { ...state.repair } : null,
  };
}

export function boundarySlicePhase(state: BoundarySliceState): BoundarySlicePhase {
  if (state.repair) {
    if (!state.repair.collected) return 'collect-repair';
    if (!state.repair.replaced) return 'repair-module';
    return 'reinspect-module';
  }
  if (!state.wallSupplyReleased) return 'mine-wall-supply';
  if (state.adapter.wallAnchors.length === 0 && state.inventory.wallModules === 0) {
    return 'collect-wall-stack';
  }
  if (state.adapter.wallAnchors.length < BOUNDARY_SECTOR_COUNT) {
    return state.inventory.selectedSlot === 1 ? 'build-wall' : 'select-wall';
  }
  if (!state.adapter.functionEvidence.cellWall) return 'inspect-wall';
  if (!state.membraneSupplyReleased) return 'mine-membrane-supply';
  if (state.adapter.membraneAnchors.length === 0 && state.inventory.membraneModules === 0) {
    return 'collect-membrane-stack';
  }
  if (state.adapter.membraneAnchors.length < BOUNDARY_SECTOR_COUNT) {
    return state.inventory.selectedSlot === 2 ? 'build-membrane' : 'select-membrane';
  }
  if (!state.adapter.functionEvidence.cellMembrane) return 'inspect-membrane';
  if (state.adapter.cytoplasm === 'empty') return 'activate-cytoplasm';
  if (!state.adapter.functionEvidence.cytoplasm) return 'inspect-cytoplasm';
  return 'complete';
}

export function selectBoundarySlot(
  state: BoundarySliceState,
  selectedSlot: number,
): BoundarySliceState {
  if (!Number.isInteger(selectedSlot) || selectedSlot < 0 || selectedSlot > 2) return state;
  const label =
    selectedSlot === 0
      ? "Builder's Pick selected."
      : selectedSlot === 1
        ? 'Cell Wall Model Module selected.'
        : 'Cell Membrane Model Module selected.';
  return {
    ...cloneBoundarySliceState(state),
    inventory: { ...state.inventory, selectedSlot: selectedSlot as 0 | 1 | 2 },
    miningProgress: 0,
    miningTarget: null,
    feedback: label,
  };
}

export function cancelBoundaryMining(state: BoundarySliceState): BoundarySliceState {
  if (state.miningProgress === 0 && state.miningTarget === null) return state;
  return {
    ...cloneBoundarySliceState(state),
    miningProgress: 0,
    miningTarget: null,
    feedback: 'Action canceled. Keep the crosshair on one highlighted model target.',
  };
}

export function advanceBoundaryMining(
  state: BoundarySliceState,
  target: BoundarySliceTarget,
  amount: number,
  installed?: { layer: BoundaryLayer; sectorId: string },
): BoundaryMiningTransition {
  if (state.inventory.selectedSlot !== 0) {
    return {
      state: {
        ...cancelBoundaryMining(state),
        feedback: "Select the Builder's Pick before mining or removing.",
      },
      event: 'none',
    };
  }
  const phase = boundarySlicePhase(state);
  const validWall = target === 'wall-supply' && phase === 'mine-wall-supply';
  const validMembrane = target === 'membrane-supply' && phase === 'mine-membrane-supply';
  const validRemoval =
    Boolean(installed) &&
    ((target === 'installed-wall' && installed?.layer === 'cellWall') ||
      (target === 'installed-membrane' && installed?.layer === 'cellMembrane')) &&
    phase === 'activate-cytoplasm';
  if ((!validWall && !validMembrane && !validRemoval) || amount <= 0) {
    return {
      state: {
        ...cancelBoundaryMining(state),
        feedback: target
          ? 'That classroom-model block is not removable now.'
          : 'Put the crosshair on the highlighted model target.',
      },
      event: 'none',
    };
  }

  const previous = state.miningTarget === target ? state.miningProgress : 0;
  const miningProgress = Math.min(1, previous + amount);
  if (miningProgress < 1) {
    return {
      state: {
        ...cloneBoundarySliceState(state),
        miningProgress,
        miningTarget: target,
        feedback: `${validRemoval ? 'Removing' : 'Opening supply'} ${Math.round(
          miningProgress * 100,
        )}%`,
      },
      event: 'none',
    };
  }

  if (validWall) {
    return {
      state: {
        ...cloneBoundarySliceState(state),
        wallSupplyReleased: true,
        miningProgress: 0,
        miningTarget: null,
        feedback: 'Wall Module stack x6 released. Walk over the physical drop.',
      },
      event: 'wall-stack-released',
    };
  }
  if (validMembrane) {
    return {
      state: {
        ...cloneBoundarySliceState(state),
        membraneSupplyReleased: true,
        miningProgress: 0,
        miningTarget: null,
        feedback: 'Membrane Module stack x6 released. Walk over the physical drop.',
      },
      event: 'membrane-stack-released',
    };
  }

  const removed = removeBoundaryModule(state.adapter, installed!.layer, installed!.sectorId);
  if (!removed) {
    return {
      state: {
        ...cancelBoundaryMining(state),
        feedback: 'That model module cannot be removed in this checkpoint.',
      },
      event: 'none',
    };
  }
  return {
    state: {
      ...cloneBoundarySliceState(state),
      adapter: removed,
      miningProgress: 0,
      miningTarget: null,
      repair: {
        layer: installed!.layer,
        sectorId: installed!.sectorId,
        collected: false,
        replaced: false,
      },
      feedback: 'Model module removed. Collect the physical drop, rebuild, then reinspect.',
    },
    event: 'module-removed',
    removed: { ...installed! },
  };
}

export function collectBoundaryStack(
  state: BoundarySliceState,
  item: VoxelItemId,
  count: number,
): BoundarySliceState | null {
  if (!Number.isInteger(count) || count <= 0) return null;
  if (item !== 'cell-wall-module' && item !== 'cell-membrane-module') return null;
  const layer = item === 'cell-wall-module' ? 'cellWall' : 'cellMembrane';
  const expectedRepair = state.repair?.layer === layer && !state.repair.collected;
  const expectedSupply =
    (!state.repair &&
      layer === 'cellWall' &&
      state.wallSupplyReleased &&
      state.adapter.wallAnchors.length === 0) ||
    (!state.repair &&
      layer === 'cellMembrane' &&
      state.membraneSupplyReleased &&
      state.adapter.membraneAnchors.length === 0);
  if (!expectedRepair && !expectedSupply) return null;
  const next = cloneBoundarySliceState(state);
  if (layer === 'cellWall') next.inventory.wallModules += count;
  else next.inventory.membraneModules += count;
  if (next.repair) next.repair.collected = true;
  next.feedback = expectedRepair
    ? 'Repair module recovered. Select its hotbar slot and restore the gold bracket.'
    : `${layer === 'cellWall' ? 'Wall' : 'Membrane'} Module stack x${count} collected.`;
  return next;
}

export function placeBoundarySliceModule(
  state: BoundarySliceState,
  layer: BoundaryLayer,
  sectorId: string | null,
): BoundaryPlacementTransition {
  const selected = layer === 'cellWall' ? 1 : 2;
  const inventoryCount =
    layer === 'cellWall' ? state.inventory.wallModules : state.inventory.membraneModules;
  const repairMatches =
    !state.repair ||
    (state.repair.layer === layer &&
      state.repair.sectorId === sectorId &&
      state.repair.collected &&
      !state.repair.replaced);
  const assessment = assessBoundaryPlacement(state.adapter, layer, sectorId);
  if (
    state.inventory.selectedSlot !== selected ||
    inventoryCount <= 0 ||
    !repairMatches ||
    !assessment.allowed ||
    !assessment.sector
  ) {
    const reason =
      state.inventory.selectedSlot !== selected
        ? `Select the ${layer === 'cellWall' ? 'Wall' : 'Membrane'} Module hotbar slot first.`
        : !repairMatches
          ? 'Repair the exact empty gold bracket so the model geometry stays correct.'
          : (assessment.reason ?? 'That model placement is blocked.');
    return {
      state: {
        ...cloneBoundarySliceState(state),
        feedback: `Invalid placement: ${reason}`,
      },
      event: 'none',
    };
  }
  const adapter = placeBoundaryModule(state.adapter, layer, sectorId);
  if (!adapter) {
    return {
      state: {
        ...cloneBoundarySliceState(state),
        feedback: assessment.reason ?? 'That model placement is blocked.',
      },
      event: 'none',
    };
  }
  const next = cloneBoundarySliceState(state);
  next.adapter = adapter;
  if (layer === 'cellWall') next.inventory.wallModules -= 1;
  else next.inventory.membraneModules -= 1;
  const repaired = Boolean(next.repair);
  if (next.repair) next.repair.replaced = true;
  const count = layer === 'cellWall' ? adapter.wallAnchors.length : adapter.membraneAnchors.length;
  next.feedback = repaired
    ? 'Model geometry restored. Interact nearby to restore function credit.'
    : `${layer === 'cellWall' ? 'Outer wall' : 'Inner membrane'} model module ${count}/${BOUNDARY_SECTOR_COUNT} installed.`;
  return {
    state: next,
    event: repaired ? 'module-repaired' : 'module-placed',
    layer,
    sectorId: assessment.sector.id,
  };
}

export function interactBoundarySlice(
  state: BoundarySliceState,
  target: BoundarySliceTarget,
): BoundarySliceState {
  const phase = boundarySlicePhase(state);
  let evidenceId: BoundaryFunctionId | null = null;
  if (
    (phase === 'inspect-wall' ||
      (phase === 'reinspect-module' && state.repair?.layer === 'cellWall')) &&
    target === 'installed-wall'
  ) {
    evidenceId = 'cellWall';
  } else if (
    (phase === 'inspect-membrane' ||
      (phase === 'reinspect-module' && state.repair?.layer === 'cellMembrane')) &&
    target === 'installed-membrane'
  ) {
    evidenceId = 'cellMembrane';
  } else if (phase === 'activate-cytoplasm' && target === 'cytoplasm-control') {
    const adapter = establishBoundaryCytoplasm(state.adapter);
    if (!adapter) {
      return {
        ...cloneBoundarySliceState(state),
        feedback: 'Complete and inspect both nested boundary layers before activating cytoplasm.',
      };
    }
    return {
      ...cloneBoundarySliceState(state),
      adapter,
      feedback:
        'Cytoplasm established as the gelatinous interior fill. Interact once more to inspect it.',
    };
  } else if (phase === 'inspect-cytoplasm' && target === 'cytoplasm-control') {
    evidenceId = 'cytoplasm';
  }

  if (!evidenceId) {
    return {
      ...cloneBoundarySliceState(state),
      feedback: 'Move the crosshair onto the highlighted model evidence before interacting.',
    };
  }
  const adapter = recordBoundaryFunction(state.adapter, evidenceId);
  if (!adapter) return cloneBoundarySliceState(state);
  const next = cloneBoundarySliceState(state);
  next.adapter = adapter;
  if (next.repair) next.repair = null;
  next.feedback =
    evidenceId === 'cellWall'
      ? 'Cell wall: provides support. Function evidence recorded.'
      : evidenceId === 'cellMembrane'
        ? 'Cell membrane: protects and controls movement in and out. Function evidence recorded.'
        : 'Cytoplasm: gelatinous material filling the inside. Function evidence recorded.';
  return next;
}

export function boundarySliceCheckpoint(state: BoundarySliceState) {
  return boundaryCheckpoint(state.adapter);
}
