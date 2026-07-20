import {
  addInventoryItem,
  createHotbar,
  inventoryCount,
  removeInventoryItem,
  selectHotbarSlot,
  type HotbarSnapshot,
} from '../voxel/HotbarInventory';

export type ProofTarget = 'supply' | 'placement' | 'placed-block' | null;

export type ProofPhase =
  | 'mine-supplies'
  | 'collect-supplies'
  | 'select-block'
  | 'place-frame'
  | 'select-tool'
  | 'remove-block'
  | 'collect-repair'
  | 'repair-frame'
  | 'complete';

export interface ProofState {
  inventory: HotbarSnapshot;
  suppliesMined: number;
  pickupsCollected: number;
  blocksPlaced: number;
  repairStarted: boolean;
  miningProgress: number;
  miningTarget: ProofTarget;
  feedback: string;
}

export interface MiningTransition {
  state: ProofState;
  event: 'none' | 'supply-broken' | 'block-removed';
}

export interface PlacementTransition {
  state: ProofState;
  event: 'none' | 'block-placed' | 'block-repaired';
}

export interface CollectionTransition {
  state: ProofState;
  accepted: boolean;
}

export const FOUNDATION_BLOCK_COUNT = 3;

export const initialProofState: ProofState = {
  inventory: createHotbar(),
  suppliesMined: 0,
  pickupsCollected: 0,
  blocksPlaced: 0,
  repairStarted: false,
  miningProgress: 0,
  miningTarget: null,
  feedback: 'Aim at the striped Builder Block supplies and hold Mine.',
};

export function proofPhase(state: ProofState): ProofPhase {
  if (state.repairStarted && state.blocksPlaced === FOUNDATION_BLOCK_COUNT) return 'complete';
  if (state.suppliesMined < FOUNDATION_BLOCK_COUNT) return 'mine-supplies';
  if (state.pickupsCollected < FOUNDATION_BLOCK_COUNT) return 'collect-supplies';
  if (!state.repairStarted && state.blocksPlaced < FOUNDATION_BLOCK_COUNT) {
    return state.inventory.selectedSlot === 1 ? 'place-frame' : 'select-block';
  }
  if (!state.repairStarted && state.blocksPlaced === FOUNDATION_BLOCK_COUNT) {
    return state.inventory.selectedSlot === 0 ? 'remove-block' : 'select-tool';
  }
  if (inventoryCount(state.inventory, 'builder-block') === 0) return 'collect-repair';
  return state.inventory.selectedSlot === 1 ? 'repair-frame' : 'select-block';
}

export function selectProofSlot(state: ProofState, slot: number): ProofState {
  const inventory = selectHotbarSlot(state.inventory, slot);
  if (inventory === state.inventory) return state;
  return {
    ...state,
    inventory,
    miningProgress: 0,
    miningTarget: null,
    feedback: slot === 0 ? "Builder's Pick selected." : 'Builder Block selected.',
  };
}

export function cancelProofMining(state: ProofState): ProofState {
  if (state.miningProgress === 0 && state.miningTarget === null) return state;
  return {
    ...state,
    miningProgress: 0,
    miningTarget: null,
    feedback: 'Mining canceled. Keep the crosshair on one highlighted model block.',
  };
}

export function advanceProofMining(
  state: ProofState,
  target: ProofTarget,
  amount: number,
): MiningTransition {
  if (state.inventory.selectedSlot !== 0) {
    return {
      state: { ...cancelProofMining(state), feedback: "Select the Builder's Pick before mining." },
      event: 'none',
    };
  }
  const validSupply = target === 'supply' && state.suppliesMined < FOUNDATION_BLOCK_COUNT;
  const validRepair =
    target === 'placed-block' &&
    !state.repairStarted &&
    state.blocksPlaced === FOUNDATION_BLOCK_COUNT;
  if ((!validSupply && !validRepair) || amount <= 0) {
    return {
      state: {
        ...cancelProofMining(state),
        feedback: target
          ? 'That model block is not removable now.'
          : 'Put the crosshair on the outlined model block.',
      },
      event: 'none',
    };
  }

  const previous = state.miningTarget === target ? state.miningProgress : 0;
  const miningProgress = Math.min(1, previous + amount);
  if (miningProgress < 1) {
    return {
      state: {
        ...state,
        miningProgress,
        miningTarget: target,
        feedback: `Mining ${Math.round(miningProgress * 100)}%`,
      },
      event: 'none',
    };
  }

  if (validSupply) {
    const suppliesMined = state.suppliesMined + 1;
    return {
      state: {
        ...state,
        suppliesMined,
        miningProgress: 0,
        miningTarget: null,
        feedback:
          suppliesMined === FOUNDATION_BLOCK_COUNT
            ? 'Three physical drops are ready. Walk over each one to collect it.'
            : `Builder Block ${suppliesMined} of ${FOUNDATION_BLOCK_COUNT} mined. Mine the next striped block.`,
      },
      event: 'supply-broken',
    };
  }

  return {
    state: {
      ...state,
      blocksPlaced: state.blocksPlaced - 1,
      repairStarted: true,
      miningProgress: 0,
      miningTarget: null,
      feedback: 'Builder Block removed. Walk over the drop, then repair the frame.',
    },
    event: 'block-removed',
  };
}

export function collectProofDrop(state: ProofState, count = 1): CollectionTransition {
  const result = addInventoryItem(state.inventory, 'builder-block', count);
  if (result.remainder > 0) {
    return {
      state: { ...state, feedback: 'Hotbar full. The model drop remains recoverable.' },
      accepted: false,
    };
  }
  const pickupsCollected = state.pickupsCollected + count;
  return {
    state: {
      ...state,
      inventory: result.inventory,
      pickupsCollected,
      feedback: state.repairStarted
        ? 'Repair block collected. Select slot 2 and restore the empty bracket.'
        : `Collected ${Math.min(pickupsCollected, FOUNDATION_BLOCK_COUNT)} of ${FOUNDATION_BLOCK_COUNT} Builder Blocks.`,
    },
    accepted: true,
  };
}

export function placeProofBlock(state: ProofState, validTarget: boolean): PlacementTransition {
  if (!validTarget) {
    return {
      state: {
        ...state,
        feedback: 'Invalid placement: use a bracketed empty cell beside the targeted face.',
      },
      event: 'none',
    };
  }
  if (state.inventory.selectedSlot !== 1) {
    return {
      state: { ...state, feedback: 'Select the Builder Block in slot 2 before placing.' },
      event: 'none',
    };
  }
  const inventory = removeInventoryItem(state.inventory, 'builder-block', 1);
  if (!inventory) {
    return {
      state: { ...state, feedback: 'Collect a Builder Block before placing.' },
      event: 'none',
    };
  }
  if (state.blocksPlaced >= FOUNDATION_BLOCK_COUNT) {
    return {
      state: { ...state, feedback: 'The yard repair frame is already filled.' },
      event: 'none',
    };
  }

  const blocksPlaced = state.blocksPlaced + 1;
  const repaired = state.repairStarted && blocksPlaced === FOUNDATION_BLOCK_COUNT;
  return {
    state: {
      ...state,
      inventory,
      blocksPlaced,
      feedback: repaired
        ? 'Yard repair complete: the removed model block was recovered and replaced.'
        : blocksPlaced === FOUNDATION_BLOCK_COUNT
          ? "Three-face frame filled. Select the Builder's Pick and remove one block."
          : `Builder Block ${blocksPlaced} of ${FOUNDATION_BLOCK_COUNT} placed by target face.`,
    },
    event: repaired ? 'block-repaired' : 'block-placed',
  };
}
