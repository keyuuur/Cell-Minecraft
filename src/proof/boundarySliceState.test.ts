import { describe, expect, it } from 'vitest';
import { BOUNDARY_SECTORS } from '../voxel/boundaryAdapter';
import {
  advanceBoundaryMining,
  boundarySliceCheckpoint,
  boundarySlicePhase,
  collectBoundaryStack,
  initialBoundarySliceState,
  interactBoundarySlice,
  placeBoundarySliceModule,
  selectBoundarySlot,
  type BoundarySliceState,
} from './boundarySliceState';

function releaseAndCollect(
  state: BoundarySliceState,
  target: 'wall-supply' | 'membrane-supply',
): BoundarySliceState {
  const mined = advanceBoundaryMining(selectBoundarySlot(state, 0), target, 1);
  expect(mined.event).not.toBe('none');
  const item = target === 'wall-supply' ? 'cell-wall-module' : 'cell-membrane-module';
  return collectBoundaryStack(mined.state, item, 6)!;
}

function placeAll(state: BoundarySliceState, layer: 'cellWall' | 'cellMembrane') {
  let next = selectBoundarySlot(state, layer === 'cellWall' ? 1 : 2);
  for (const sector of BOUNDARY_SECTORS) {
    const placed = placeBoundarySliceModule(next, layer, sector.id);
    expect(placed.event).toBe('module-placed');
    next = placed.state;
  }
  return next;
}

describe('boundary slice state', () => {
  it('uses one physical stack per layer and twelve meaningful placements', () => {
    let state = releaseAndCollect(initialBoundarySliceState, 'wall-supply');
    expect(state.inventory.wallModules).toBe(6);
    state = placeAll(state, 'cellWall');
    expect(boundarySlicePhase(state)).toBe('inspect-wall');
    state = interactBoundarySlice(state, 'installed-wall');

    state = releaseAndCollect(state, 'membrane-supply');
    expect(state.inventory.membraneModules).toBe(6);
    state = placeAll(state, 'cellMembrane');
    expect(boundarySlicePhase(state)).toBe('inspect-membrane');
    state = interactBoundarySlice(state, 'installed-membrane');

    expect(boundarySlicePhase(state)).toBe('activate-cytoplasm');
    state = interactBoundarySlice(state, 'cytoplasm-control');
    expect(state.adapter.cytoplasm).toBe('filled');
    expect(boundarySlicePhase(state)).toBe('inspect-cytoplasm');
    state = interactBoundarySlice(state, 'cytoplasm-control');
    expect(boundarySlicePhase(state)).toBe('complete');
    expect(boundarySliceCheckpoint(state).score.total).toBe(38.8);
  });

  it('conserves inventory and score on an invalid placement', () => {
    let state = releaseAndCollect(initialBoundarySliceState, 'wall-supply');
    state = selectBoundarySlot(state, 1);
    const before = boundarySliceCheckpoint(state).score.total;
    const invalid = placeBoundarySliceModule(state, 'cellWall', 'right-front');
    expect(invalid.event).toBe('none');
    expect(invalid.state.inventory.wallModules).toBe(6);
    expect(invalid.state.adapter.wallAnchors).toEqual([]);
    expect(boundarySliceCheckpoint(invalid.state).score.total).toBe(before);
  });

  it('requires a physical correction and reinspection to restore full credit', () => {
    let state = releaseAndCollect(initialBoundarySliceState, 'wall-supply');
    state = placeAll(state, 'cellWall');
    state = interactBoundarySlice(state, 'installed-wall');
    state = releaseAndCollect(state, 'membrane-supply');
    state = placeAll(state, 'cellMembrane');
    state = interactBoundarySlice(state, 'installed-membrane');
    const fullScore = boundarySliceCheckpoint(state).score.total;

    state = selectBoundarySlot(state, 0);
    const removed = advanceBoundaryMining(state, 'installed-membrane', 1, {
      layer: 'cellMembrane',
      sectorId: 'right-front',
    });
    expect(removed.event).toBe('module-removed');
    expect(boundarySliceCheckpoint(removed.state).score.total).toBeLessThan(fullScore);
    state = collectBoundaryStack(removed.state, 'cell-membrane-module', 1)!;
    state = selectBoundarySlot(state, 2);
    const repaired = placeBoundarySliceModule(state, 'cellMembrane', 'right-front');
    expect(repaired.event).toBe('module-repaired');
    expect(boundarySliceCheckpoint(repaired.state).score.total).toBeLessThan(fullScore);
    state = interactBoundarySlice(repaired.state, 'installed-membrane');
    expect(boundarySliceCheckpoint(state).score.total).toBe(fullScore);
    expect(boundarySlicePhase(state)).toBe('activate-cytoplasm');
  });
});
