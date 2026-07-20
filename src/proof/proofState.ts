export type ProofTarget = 'supply' | 'anchor' | 'placed-wall' | null;

export type ProofPhase =
  | 'mine-supply'
  | 'collect-supply'
  | 'select-wall'
  | 'place-wall'
  | 'select-tool'
  | 'remove-wall'
  | 'collect-repair'
  | 'repair-wall'
  | 'complete';

export interface ProofState {
  supplyAvailable: boolean;
  dropAvailable: boolean;
  inventoryCount: number;
  wallPlaced: boolean;
  placementCount: number;
  selectedSlot: number;
  miningProgress: number;
  miningTarget: ProofTarget;
  feedback: string;
}

export interface MiningTransition {
  state: ProofState;
  event: 'none' | 'supply-broken' | 'wall-removed';
}

export interface PlacementTransition {
  state: ProofState;
  event: 'none' | 'wall-placed' | 'wall-repaired';
}

export const initialProofState: ProofState = {
  supplyAvailable: true,
  dropAvailable: false,
  inventoryCount: 0,
  wallPlaced: false,
  placementCount: 0,
  selectedSlot: 0,
  miningProgress: 0,
  miningTarget: null,
  feedback: 'Aim at the Wall Module supply block and hold Mine.',
};

export function proofPhase(state: ProofState): ProofPhase {
  if (state.wallPlaced && state.placementCount >= 2) return 'complete';
  if (state.supplyAvailable) return 'mine-supply';
  if (state.dropAvailable) {
    return state.placementCount === 0 ? 'collect-supply' : 'collect-repair';
  }
  if (!state.wallPlaced && state.inventoryCount > 0) {
    if (state.selectedSlot !== 1) return 'select-wall';
    return state.placementCount === 0 ? 'place-wall' : 'repair-wall';
  }
  if (state.wallPlaced && state.placementCount === 1) {
    return state.selectedSlot === 0 ? 'remove-wall' : 'select-tool';
  }
  return 'mine-supply';
}

export function selectProofSlot(state: ProofState, slot: number): ProofState {
  if (!Number.isInteger(slot) || slot < 0 || slot > 1) return state;
  return {
    ...state,
    selectedSlot: slot,
    miningProgress: 0,
    miningTarget: null,
    feedback: slot === 0 ? "Builder's Pick selected." : 'Wall Module selected.',
  };
}

export function cancelProofMining(state: ProofState): ProofState {
  if (state.miningProgress === 0 && state.miningTarget === null) return state;
  return {
    ...state,
    miningProgress: 0,
    miningTarget: null,
    feedback: 'Mining canceled. Keep the crosshair on the highlighted model block.',
  };
}

export function advanceProofMining(
  state: ProofState,
  target: ProofTarget,
  amount: number,
): MiningTransition {
  if (state.selectedSlot !== 0) {
    return {
      state: {
        ...cancelProofMining(state),
        feedback: "Select the Builder's Pick before mining.",
      },
      event: 'none',
    };
  }

  const validTarget =
    (target === 'supply' && state.supplyAvailable) ||
    (target === 'placed-wall' && state.wallPlaced && state.placementCount === 1);
  if (!validTarget || amount <= 0) {
    return {
      state: {
        ...cancelProofMining(state),
        feedback: target
          ? 'That block is not mineable in this proof.'
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

  if (target === 'supply') {
    return {
      state: {
        ...state,
        supplyAvailable: false,
        dropAvailable: true,
        miningProgress: 0,
        miningTarget: null,
        feedback: 'Supply block broken. Walk over the dropped Wall Module.',
      },
      event: 'supply-broken',
    };
  }

  return {
    state: {
      ...state,
      wallPlaced: false,
      dropAvailable: true,
      miningProgress: 0,
      miningTarget: null,
      feedback: 'Wall Module removed. Walk over it, then rebuild the model.',
    },
    event: 'wall-removed',
  };
}

export function collectProofDrop(state: ProofState): ProofState {
  if (!state.dropAvailable) return state;
  return {
    ...state,
    dropAvailable: false,
    inventoryCount: state.inventoryCount + 1,
    feedback: 'Wall Module collected. Select slot 2.',
  };
}

export function placeProofWall(state: ProofState, target: ProofTarget): PlacementTransition {
  if (target !== 'anchor') {
    return {
      state: {
        ...state,
        feedback: 'Invalid placement: aim at the outlined outer wall anchor.',
      },
      event: 'none',
    };
  }
  if (state.selectedSlot !== 1) {
    return {
      state: {
        ...state,
        feedback: 'Select the Wall Module in slot 2 before placing.',
      },
      event: 'none',
    };
  }
  if (state.inventoryCount < 1 || state.wallPlaced) {
    return {
      state: {
        ...state,
        feedback: state.wallPlaced
          ? 'The outer wall anchor is already filled.'
          : 'Collect a Wall Module first.',
      },
      event: 'none',
    };
  }

  const placementCount = state.placementCount + 1;
  return {
    state: {
      ...state,
      inventoryCount: state.inventoryCount - 1,
      wallPlaced: true,
      placementCount,
      miningProgress: 0,
      miningTarget: null,
      feedback:
        placementCount >= 2
          ? 'Proof complete: the fictional model block was removed and replaced.'
          : "Wall Module installed. Select the Builder's Pick and remove it once.",
    },
    event: placementCount >= 2 ? 'wall-repaired' : 'wall-placed',
  };
}
