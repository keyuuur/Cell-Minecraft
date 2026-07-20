import { describe, expect, it } from 'vitest';
import {
  BOUNDARY_SECTORS,
  assessBoundaryPlacement,
  boundaryCheckpoint,
  createBoundaryVoxelState,
  establishBoundaryCytoplasm,
  parseBoundaryVoxelState,
  placeBoundaryModule,
  recordBoundaryFunction,
  removeBoundaryModule,
  type BoundaryLayer,
  type BoundaryVoxelStateV1,
} from './boundaryAdapter';
import { voxelKey } from './types';

function fillLayer(state: BoundaryVoxelStateV1, layer: BoundaryLayer): BoundaryVoxelStateV1 {
  let next = state;
  for (const sector of BOUNDARY_SECTORS) {
    const placed = placeBoundaryModule(next, layer, sector.id);
    expect(placed).not.toBeNull();
    next = placed!;
  }
  return next;
}

describe('boundary voxel adapter', () => {
  it('defines six unique nested model sectors inside the fixed world', () => {
    expect(BOUNDARY_SECTORS).toHaveLength(6);
    const wallAnchors = new Set(BOUNDARY_SECTORS.map((sector) => voxelKey(sector.wallAnchor)));
    const membraneAnchors = new Set(
      BOUNDARY_SECTORS.map((sector) => voxelKey(sector.membraneAnchor)),
    );
    expect(wallAnchors.size).toBe(6);
    expect(membraneAnchors.size).toBe(6);
    for (const sector of BOUNDARY_SECTORS) {
      const center = { x: 0, z: -4 };
      const wallRadius = Math.hypot(sector.wallAnchor.x - center.x, sector.wallAnchor.z - center.z);
      const membraneRadius = Math.hypot(
        sector.membraneAnchor.x - center.x,
        sector.membraneAnchor.z - center.z,
      );
      expect(wallRadius).toBeGreaterThan(membraneRadius);
      for (const point of [
        sector.wallAnchor,
        sector.wallBacking,
        sector.membraneAnchor,
        ...sector.wallCells,
        ...sector.membraneCells,
      ]) {
        expect(point.x).toBeGreaterThanOrEqual(-12);
        expect(point.x).toBeLessThan(12);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThan(12);
        expect(point.z).toBeGreaterThanOrEqual(-12);
        expect(point.z).toBeLessThan(12);
      }
    }
  });

  it('blocks wrong order, duplicate, and inactive anchors without changing state', () => {
    const initial = createBoundaryVoxelState();
    expect(assessBoundaryPlacement(initial, 'cellMembrane', 'back-left')).toMatchObject({
      allowed: false,
    });
    expect(placeBoundaryModule(initial, 'cellWall', 'back-right')).toBeNull();
    const first = placeBoundaryModule(initial, 'cellWall', 'back-left')!;
    expect(placeBoundaryModule(first, 'cellWall', 'back-left')).toBeNull();
    expect(initial.wallAnchors).toEqual([]);
    expect(first.wallAnchors).toEqual(['back-left']);
  });

  it('derives checkpoint score only from validated unique anchors and function evidence', () => {
    const empty = createBoundaryVoxelState();
    expect(boundaryCheckpoint(empty).score.total).toBe(0);

    let state = fillLayer(empty, 'cellWall');
    expect(boundaryCheckpoint(state).score).toMatchObject({
      boundary: 7.5,
      requiredStructures: 3.8,
      placementContext: 0,
      activationFunctions: 0,
    });
    state = recordBoundaryFunction(state, 'cellWall')!;
    expect(boundaryCheckpoint(state).score.activationFunctions).toBe(2.5);

    state = fillLayer(state, 'cellMembrane');
    state = recordBoundaryFunction(state, 'cellMembrane')!;
    expect(boundaryCheckpoint(state).score).toMatchObject({
      boundary: 15,
      requiredStructures: 7.5,
      placementContext: 5,
      activationFunctions: 5,
    });

    state = establishBoundaryCytoplasm(state)!;
    state = recordBoundaryFunction(state, 'cytoplasm')!;
    expect(boundaryCheckpoint(state)).toMatchObject({
      completedStructures: 3,
      score: {
        boundary: 15,
        requiredStructures: 11.3,
        placementContext: 5,
        activationFunctions: 7.5,
        total: 38.8,
      },
    });
  });

  it('drops structural and function credit on removal and restores it after repair and reinspection', () => {
    let state = fillLayer(createBoundaryVoxelState(), 'cellWall');
    state = recordBoundaryFunction(state, 'cellWall')!;
    state = fillLayer(state, 'cellMembrane');
    state = recordBoundaryFunction(state, 'cellMembrane')!;
    const fullScore = boundaryCheckpoint(state).score.total;

    const removed = removeBoundaryModule(state, 'cellMembrane', 'right-front')!;
    expect(removed.functionEvidence.cellMembrane).toBe(false);
    expect(boundaryCheckpoint(removed).score.total).toBeLessThan(fullScore);

    const replaced = placeBoundaryModule(removed, 'cellMembrane', 'right-front')!;
    expect(boundaryCheckpoint(replaced).score.total).toBeLessThan(fullScore);
    const reinspected = recordBoundaryFunction(replaced, 'cellMembrane')!;
    expect(boundaryCheckpoint(reinspected).score.total).toBe(fullScore);
  });

  it('keeps cytoplasm non-voxel, gated, non-removable, and version validated', () => {
    const initial = createBoundaryVoxelState();
    expect(establishBoundaryCytoplasm(initial)).toBeNull();
    let state = fillLayer(initial, 'cellWall');
    state = recordBoundaryFunction(state, 'cellWall')!;
    state = fillLayer(state, 'cellMembrane');
    state = recordBoundaryFunction(state, 'cellMembrane')!;
    state = establishBoundaryCytoplasm(state)!;
    expect(state.cytoplasm).toBe('filled');
    expect(removeBoundaryModule(state, 'cellWall', 'right-front')).toBeNull();

    expect(parseBoundaryVoxelState(state)).toEqual(state);
    expect(parseBoundaryVoxelState({ ...state, version: 2 })).toBeNull();
    expect(
      parseBoundaryVoxelState({
        ...state,
        wallAnchors: [...state.wallAnchors, state.wallAnchors[0]],
      }),
    ).toBeNull();
  });
});
