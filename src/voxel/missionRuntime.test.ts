import { describe, expect, it } from 'vitest';
import {
  scoreVoxelMissionSnapshot,
  validateVoxelMissionSnapshot,
} from '../contracts/missionContracts';
import {
  createPhase4VoxelMissionFixture,
  PHASE4_STRUCTURE_POSITIONS,
} from '../contracts/missionContracts.fixtures';
import type {
  MissionCommand,
  MissionModuleId,
  MissionTarget,
  PlaceableStructureId,
  VoxelMissionSnapshotV1,
} from '../types/game';
import { BOUNDARY_SECTORS, type BoundaryLayer, type BoundarySector } from './boundaryAdapter';
import { MISSION_STRUCTURE_ORDER } from './missionDefinition';
import {
  activeMissionSupplies,
  createInitialVoxelMissionSnapshot,
  executeMissionCommand,
  selectMissionViewModel,
  VoxelMissionRuntime,
} from './missionRuntime';
import { createMissionWorld } from './missionWorld';
import { raycastVoxel } from './raycastVoxel';

function command(snapshot: VoxelMissionSnapshotV1, type: MissionCommand['type']): MissionCommand {
  return { type, snapshotRevision: snapshot.revision };
}

function supplyTarget(
  snapshot: VoxelMissionSnapshotV1,
  structureId: MissionModuleId | 'cytoplasm',
): MissionTarget {
  return { kind: 'supply', structureId, snapshotRevision: snapshot.revision, distance: 2 };
}

function pickupTarget(snapshot: VoxelMissionSnapshotV1): MissionTarget {
  const pickup = snapshot.activeModulePickups[0];
  if (!pickup) throw new Error('Expected an active pickup.');
  return {
    kind: 'pickup',
    item: pickup.item,
    spawnSequence: pickup.spawnSequence,
    snapshotRevision: snapshot.revision,
    distance: 1,
  };
}

function boundaryPlacementTarget(
  snapshot: VoxelMissionSnapshotV1,
  layer: BoundaryLayer,
  sector: BoundarySector,
): MissionTarget {
  const backing = layer === 'cellWall' ? sector.wallBacking : sector.wallAnchor;
  const destination = layer === 'cellWall' ? sector.wallAnchor : sector.membraneAnchor;
  return {
    kind: 'voxel',
    position: { ...backing },
    normal: {
      x: destination.x - backing.x,
      y: destination.y - backing.y,
      z: destination.z - backing.z,
    },
    snapshotRevision: snapshot.revision,
    distance: 2,
  };
}

function structurePlacementTarget(
  snapshot: VoxelMissionSnapshotV1,
  id: PlaceableStructureId,
): MissionTarget {
  const anchor = PHASE4_STRUCTURE_POSITIONS[id];
  return {
    kind: 'voxel',
    position: { x: anchor.x, y: 0, z: anchor.z },
    normal: { x: 0, y: 1, z: 0 },
    snapshotRevision: snapshot.revision,
    distance: 2,
  };
}

function boundaryTarget(
  snapshot: VoxelMissionSnapshotV1,
  layer: BoundaryLayer,
  sector = BOUNDARY_SECTORS[0],
): MissionTarget {
  return {
    kind: 'boundary',
    layer,
    sectorId: sector.id,
    snapshotRevision: snapshot.revision,
    distance: 2,
  };
}

function structureTarget(
  snapshot: VoxelMissionSnapshotV1,
  structureId: PlaceableStructureId,
): MissionTarget {
  return { kind: 'structure', structureId, snapshotRevision: snapshot.revision, distance: 2 };
}

function apply(
  snapshot: VoxelMissionSnapshotV1,
  type: MissionCommand['type'],
  target: MissionTarget | null,
  world = createMissionWorld(snapshot, true),
): VoxelMissionSnapshotV1 {
  return executeMissionCommand(snapshot, command(snapshot, type), target, world);
}

function mineAndCollect(
  snapshot: VoxelMissionSnapshotV1,
  id: MissionModuleId,
): VoxelMissionSnapshotV1 {
  let next = apply(snapshot, 'mine', supplyTarget(snapshot, id));
  next = apply(next, 'collect', pickupTarget(next));
  return next;
}

function completeBoundary(snapshot = createInitialVoxelMissionSnapshot()): VoxelMissionSnapshotV1 {
  let next = mineAndCollect(snapshot, 'cellWall');
  for (const sector of BOUNDARY_SECTORS) {
    next = apply(next, 'place', boundaryPlacementTarget(next, 'cellWall', sector));
  }
  next = apply(next, 'inspect', boundaryTarget(next, 'cellWall'));
  next = mineAndCollect(next, 'cellMembrane');
  for (const sector of BOUNDARY_SECTORS) {
    next = apply(next, 'place', boundaryPlacementTarget(next, 'cellMembrane', sector));
  }
  return apply(next, 'inspect', boundaryTarget(next, 'cellMembrane'));
}

function completePhase45(): VoxelMissionSnapshotV1 {
  let snapshot = completeBoundary();
  snapshot = apply(snapshot, 'interact', supplyTarget(snapshot, 'cytoplasm'));
  snapshot = apply(snapshot, 'inspect', supplyTarget(snapshot, 'cytoplasm'));
  for (const id of MISSION_STRUCTURE_ORDER) {
    snapshot = mineAndCollect(snapshot, id);
    snapshot = apply(snapshot, 'place', structurePlacementTarget(snapshot, id));
    snapshot = apply(snapshot, 'inspect', structureTarget(snapshot, id));
  }
  return snapshot;
}

describe('integrated voxel mission runtime', () => {
  it('keeps the reserved central-vacuole floor anchor visible from the guided right lane', () => {
    const snapshot = createPhase4VoxelMissionFixture();
    delete snapshot.placements.centralVacuole;
    snapshot.functionEvidence.centralVacuole = false;
    const world = createMissionWorld(snapshot, true);
    const origin = { x: 3, y: 2.2, z: -2 };
    const anchorFloor = { x: -1, y: 0, z: -4 };
    const anchorSurface = { ...anchorFloor, y: 0.5 };
    const hit = raycastVoxel(
      world,
      origin,
      {
        x: anchorSurface.x - origin.x,
        y: anchorSurface.y - origin.y,
        z: anchorSurface.z - origin.z,
      },
      { maxDistance: 5, maxSteps: 64 },
    );

    expect(hit?.cell).toEqual(anchorFloor);
    expect(hit?.normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('begins with one valid conserved authority and rejects absent or stale targets exactly', () => {
    const snapshot = createInitialVoxelMissionSnapshot();
    const world = createMissionWorld(snapshot, true);
    expect(validateVoxelMissionSnapshot(snapshot, world)).toBe(true);
    expect(executeMissionCommand(snapshot, command(snapshot, 'mine'), null, world)).toBe(snapshot);
    expect(
      executeMissionCommand(
        snapshot,
        { type: 'mine', snapshotRevision: snapshot.revision + 1 },
        supplyTarget(snapshot, 'cellWall'),
        world,
      ),
    ).toBe(snapshot);
    expect(
      executeMissionCommand(
        snapshot,
        command(snapshot, 'mine'),
        { ...supplyTarget(snapshot, 'cellWall'), snapshotRevision: snapshot.revision + 1 },
        world,
      ),
    ).toBe(snapshot);
  });

  it('uses ray-targeted supply, collection, placement, inspection, and exact revision steps', () => {
    const initial = createInitialVoxelMissionSnapshot();
    const mined = apply(initial, 'mine', supplyTarget(initial, 'cellWall'));
    expect(mined.revision).toBe(initial.revision + 1);
    expect(mined.depotInventory.cellWall).toBe(0);
    expect(mined.activeModulePickups).toHaveLength(1);
    const collected = apply(mined, 'collect', pickupTarget(mined));
    expect(collected.revision).toBe(mined.revision + 1);
    expect(collected.moduleInventory.cellWall).toBe(6);
    expect(collected.selectedHotbarItem).toBe('cellWall');

    const complete = completeBoundary(initial);
    expect(complete.boundary.wallAnchors).toHaveLength(6);
    expect(complete.boundary.membraneAnchors).toHaveLength(6);
    expect(complete.boundary.functionEvidence).toMatchObject({
      cellWall: true,
      cellMembrane: true,
      cytoplasm: false,
    });
    expect(validateVoxelMissionSnapshot(complete, createMissionWorld(complete, true))).toBe(true);
  });

  it('rejects a boundary panel that would intersect and trap the continuous player body', () => {
    let snapshot = createInitialVoxelMissionSnapshot();
    snapshot = mineAndCollect(snapshot, 'cellWall');
    for (const sector of BOUNDARY_SECTORS) {
      snapshot = apply(snapshot, 'place', boundaryPlacementTarget(snapshot, 'cellWall', sector));
    }
    snapshot = apply(snapshot, 'inspect', boundaryTarget(snapshot, 'cellWall'));
    snapshot = mineAndCollect(snapshot, 'cellMembrane');
    snapshot = {
      ...snapshot,
      player: { ...snapshot.player, x: -1.222, y: 0.5, z: -5.424 },
    };
    const sector = BOUNDARY_SECTORS[0];
    const beforeInventory = snapshot.moduleInventory.cellMembrane;
    const rejected = apply(
      snapshot,
      'place',
      boundaryPlacementTarget(snapshot, 'cellMembrane', sector),
    );

    expect(rejected).toBe(snapshot);
    expect(rejected.boundary.membraneAnchors).toHaveLength(0);
    expect(rejected.moduleInventory.cellMembrane).toBe(beforeInventory);
  });

  it('prioritizes an active physical drop before another paired supply', () => {
    let snapshot = completeBoundary();
    snapshot = apply(snapshot, 'interact', supplyTarget(snapshot, 'cytoplasm'));
    snapshot = apply(snapshot, 'inspect', supplyTarget(snapshot, 'cytoplasm'));
    snapshot = apply(snapshot, 'mine', supplyTarget(snapshot, 'nucleus'));

    expect(snapshot.activeModulePickups[0]?.item).toBe('nucleus');
    expect(activeMissionSupplies(snapshot)).toEqual([]);
    expect(selectMissionViewModel(snapshot, null).objective).toContain('Nucleus drop');
    expect(selectMissionViewModel(snapshot, supplyTarget(snapshot, 'ribosomes'))).toMatchObject({
      primaryVerb: 'mine',
      primaryActionEnabled: false,
    });
  });

  it('requires boundary correction recovery, replacement, and reinspection to restore score', () => {
    let snapshot = completeBoundary();
    const world = createMissionWorld(snapshot, true);
    const before = scoreVoxelMissionSnapshot(snapshot, world).total;
    const removedSector = BOUNDARY_SECTORS.at(-1)!;
    snapshot = apply(snapshot, 'remove', boundaryTarget(snapshot, 'cellMembrane', removedSector));
    expect(snapshot.boundary.membraneAnchors).toHaveLength(5);
    expect(snapshot.boundary.functionEvidence.cellMembrane).toBe(false);
    expect(scoreVoxelMissionSnapshot(snapshot, world).total).toBeLessThan(before);
    snapshot = apply(snapshot, 'collect', pickupTarget(snapshot));
    snapshot = apply(
      snapshot,
      'place',
      boundaryPlacementTarget(snapshot, 'cellMembrane', removedSector),
    );
    expect(scoreVoxelMissionSnapshot(snapshot, world).total).toBeLessThan(before);
    snapshot = apply(snapshot, 'inspect', boundaryTarget(snapshot, 'cellMembrane', removedSector));
    expect(scoreVoxelMissionSnapshot(snapshot, world).total).toBe(before);
  });

  it('completes all eight structures at the 80-point Phase 4.5 checkpoint', () => {
    const snapshot = completePhase45();
    const world = createMissionWorld(snapshot, true);
    expect(validateVoxelMissionSnapshot(snapshot, world)).toBe(true);
    expect(snapshot.boundary.cytoplasm).toBe('filled');
    expect(snapshot.boundary.functionEvidence.cytoplasm).toBe(true);
    expect(MISSION_STRUCTURE_ORDER.every((id) => snapshot.functionEvidence[id])).toBe(true);
    expect(scoreVoxelMissionSnapshot(snapshot, world).total).toBe(80);
    expect(selectMissionViewModel(snapshot, null).objective).toContain('remove one structure');
  });

  it('rejects reserved, overlapping, and player-entrapping placement without mutation', () => {
    let snapshot = completeBoundary();
    snapshot = apply(snapshot, 'interact', supplyTarget(snapshot, 'cytoplasm'));
    snapshot = apply(snapshot, 'inspect', supplyTarget(snapshot, 'cytoplasm'));
    snapshot = mineAndCollect(snapshot, 'nucleus');
    const world = createMissionWorld(snapshot, true);
    const invalidTarget: MissionTarget = {
      kind: 'voxel',
      position: { x: -1, y: 0, z: -4 },
      normal: { x: 0, y: 1, z: 0 },
      snapshotRevision: snapshot.revision,
      distance: 2,
    };
    expect(executeMissionCommand(snapshot, command(snapshot, 'place'), invalidTarget, world)).toBe(
      snapshot,
    );

    const runtime = new VoxelMissionRuntime(world, snapshot);
    runtime.updatePlayer({ x: -3.1, y: 0.5, z: -3.6, yaw: 0, pitch: 0 });
    const moved = runtime.current();
    expect(moved.player).toMatchObject({ x: -3.1, z: -3.6 });
    const blocked = runtime.dispatch(
      command(moved, 'place'),
      structurePlacementTarget(moved, 'nucleus'),
    );
    expect(blocked.revision).toBe(moved.revision);
    expect(blocked.moduleInventory.nucleus).toBe(1);
    expect(blocked.placements.nucleus).toBeUndefined();
  });

  it('uses reachable-drop recovery, inventory fallback, and rollback conservation', () => {
    const snapshot = completePhase45();
    const target = structureTarget(snapshot, 'centralVacuole');
    const world = createMissionWorld(snapshot, true);
    const pickup = executeMissionCommand(snapshot, command(snapshot, 'remove'), target, world);
    expect(pickup.activeModulePickups).toHaveLength(1);
    expect(pickup.correction.recovery?.kind).toBe('pickup');

    const fallback = executeMissionCommand(snapshot, command(snapshot, 'remove'), target, world, {
      recoveryCell: () => null,
      pickupCapacity: 0,
    });
    expect(fallback.activeModulePickups).toHaveLength(0);
    expect(fallback.moduleInventory.centralVacuole).toBe(1);
    expect(fallback.correction.recovery).toEqual({ kind: 'inventory' });

    const rolledBack = executeMissionCommand(snapshot, command(snapshot, 'remove'), target, world, {
      recoveryCell: () => null,
      pickupCapacity: 0,
      allowInventoryFallback: false,
    });
    expect(rolledBack).toBe(snapshot);
  });

  it('restores exact internal-structure credit only after replacement and reinspection', () => {
    const complete = completePhase45();
    const world = createMissionWorld(complete, true);
    const scoreBefore = scoreVoxelMissionSnapshot(complete, world).total;
    let snapshot = apply(complete, 'remove', structureTarget(complete, 'centralVacuole'));
    snapshot = apply(snapshot, 'collect', pickupTarget(snapshot));
    snapshot = apply(snapshot, 'place', structurePlacementTarget(snapshot, 'centralVacuole'));
    expect(scoreVoxelMissionSnapshot(snapshot, world).total).toBeLessThan(scoreBefore);
    snapshot = apply(snapshot, 'inspect', structureTarget(snapshot, 'centralVacuole'));
    expect(scoreVoxelMissionSnapshot(snapshot, world).total).toBe(scoreBefore);
    expect(snapshot.correction).toEqual({ removedTarget: null, recovery: null });
  });

  it('latches context loss so commands and player input cannot mutate authority', () => {
    const initial = createInitialVoxelMissionSnapshot();
    const runtime = new VoxelMissionRuntime(createMissionWorld(initial, true), initial);
    runtime.stopForContextLoss();
    const before = runtime.current();
    runtime.dispatch(command(before, 'mine'), supplyTarget(before, 'cellWall'));
    runtime.updatePlayer({ ...before.player, z: before.player.z - 2 });
    expect(runtime.current()).toEqual(before);
    expect(runtime.isStopped()).toBe(true);
  });
});
