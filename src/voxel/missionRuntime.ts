import {
  MISSION_MODULE_IDS,
  MISSION_MODULE_TOTALS,
  scoreVoxelMissionSnapshot,
  validateMissionCommand,
  validateMissionTarget,
  validateVoxelMissionSnapshot,
} from '../contracts/missionContracts';
import { validatePrefabPlacements, validatePrefabPlayerSafety } from '../contracts/prefabRegistry';
import { STRUCTURE_FUNCTIONS, STRUCTURE_LABELS } from '../data/assignment';
import type {
  MissionCommand,
  MissionModuleId,
  MissionStage,
  MissionTarget,
  MissionViewModel,
  PlaceableStructureId,
  Point3,
  VoxelMissionPlayerV1,
  VoxelMissionRemovedTargetV1,
  VoxelMissionSnapshotV1,
} from '../types/game';
import { VOXEL_MISSION_TEMPLATE_ID } from '../types/game';
import {
  BOUNDARY_SECTORS,
  establishBoundaryCytoplasm,
  placeBoundaryModule,
  recordBoundaryFunction,
  removeBoundaryModule,
  validateBoundaryPlayerSafety,
  type BoundaryLayer,
} from './boundaryAdapter';
import { isSolidVoxel, VOXEL_PALETTE_VERSION } from './blocks';
import { MISSION_STRUCTURE_ORDER } from './missionDefinition';
import { createMissionWorld, CYTOPLASM_CONTROL_CELL, MISSION_SUPPLY_CELLS } from './missionWorld';
import type { VoxelPoint } from './types';
import type { VoxelWorld } from './VoxelWorld';

const moduleIds = new Set<string>(MISSION_MODULE_IDS);
const placeableIds = new Set<string>(MISSION_STRUCTURE_ORDER);
const boundaryComplete = (snapshot: VoxelMissionSnapshotV1): boolean =>
  snapshot.boundary.wallAnchors.length === 6 &&
  snapshot.boundary.membraneAnchors.length === 6 &&
  snapshot.boundary.functionEvidence.cellWall &&
  snapshot.boundary.functionEvidence.cellMembrane;

const allInternalEvidence = (snapshot: VoxelMissionSnapshotV1): boolean =>
  MISSION_STRUCTURE_ORDER.every(
    (id) => Boolean(snapshot.placements[id]) && snapshot.functionEvidence[id] === true,
  );

export function cloneVoxelMissionSnapshot(
  snapshot: VoxelMissionSnapshotV1,
): VoxelMissionSnapshotV1 {
  return structuredClone(snapshot);
}

export function createInitialVoxelMissionSnapshot(): VoxelMissionSnapshotV1 {
  return {
    version: 1,
    templateId: VOXEL_MISSION_TEMPLATE_ID,
    paletteVersion: VOXEL_PALETTE_VERSION,
    revision: 0,
    player: { x: 0, y: 0.5, z: 10, yaw: Math.PI, pitch: -0.04 },
    boundary: {
      version: 1,
      wallAnchors: [],
      membraneAnchors: [],
      cytoplasm: 'empty',
      functionEvidence: { cellWall: false, cellMembrane: false, cytoplasm: false },
    },
    depotInventory: { ...MISSION_MODULE_TOTALS },
    placements: {},
    functionEvidence: {},
    moduleInventory: Object.fromEntries(MISSION_MODULE_IDS.map((id) => [id, 0])) as Record<
      MissionModuleId,
      number
    >,
    activeModulePickups: [],
    selectedHotbarItem: 'builder-pick',
    homeostasis: {
      waterAvailable: true,
      vacuoleHydratedObserved: false,
      droughtStarted: false,
      droughtDiagnosed: false,
      droughtObserved: false,
      recoveryRestored: false,
    },
    correction: { removedTarget: null, recovery: null },
    completion: { completionLocked: false, completed: false, practice: false },
    lastFeedback: 'Aim at the Cell Wall supply crate and hold Mine.',
    stageTimestamps: {},
  };
}

export function voxelMissionStage(snapshot: VoxelMissionSnapshotV1): MissionStage {
  if (
    snapshot.boundary.wallAnchors.length < 6 ||
    snapshot.boundary.membraneAnchors.length < 6 ||
    !snapshot.boundary.functionEvidence.cellWall ||
    !snapshot.boundary.functionEvidence.cellMembrane
  ) {
    return 'boundary';
  }
  if (snapshot.boundary.cytoplasm !== 'filled' || !snapshot.boundary.functionEvidence.cytoplasm) {
    return 'cytoplasm';
  }
  if (
    !snapshot.placements.nucleus ||
    !snapshot.placements.ribosomes ||
    !snapshot.functionEvidence.nucleus ||
    !snapshot.functionEvidence.ribosomes
  ) {
    return 'control-and-protein';
  }
  if (
    !snapshot.placements.mitochondria ||
    !snapshot.placements.chloroplasts ||
    !snapshot.functionEvidence.mitochondria ||
    !snapshot.functionEvidence.chloroplasts
  ) {
    return 'energy-and-photosynthesis';
  }
  if (!snapshot.placements.centralVacuole || !snapshot.functionEvidence.centralVacuole) {
    return 'water-storage';
  }
  if (!snapshot.homeostasis.droughtStarted) return 'drought-diagnosis';
  if (!snapshot.homeostasis.recoveryRestored) return 'recovery';
  return 'stable';
}

function moduleInTransit(snapshot: VoxelMissionSnapshotV1, id: MissionModuleId): boolean {
  return (
    snapshot.moduleInventory[id] > 0 ||
    snapshot.activeModulePickups.some((pickup) => pickup.item === id)
  );
}

export function activeMissionSupplies(snapshot: VoxelMissionSnapshotV1): MissionModuleId[] {
  if (snapshot.correction.removedTarget || snapshot.activeModulePickups.length > 0) return [];
  if (snapshot.boundary.wallAnchors.length < 6 || !snapshot.boundary.functionEvidence.cellWall) {
    return snapshot.depotInventory.cellWall > 0 && !moduleInTransit(snapshot, 'cellWall')
      ? ['cellWall']
      : [];
  }
  if (
    snapshot.boundary.membraneAnchors.length < 6 ||
    !snapshot.boundary.functionEvidence.cellMembrane
  ) {
    return snapshot.depotInventory.cellMembrane > 0 && !moduleInTransit(snapshot, 'cellMembrane')
      ? ['cellMembrane']
      : [];
  }
  if (snapshot.boundary.cytoplasm !== 'filled' || !snapshot.boundary.functionEvidence.cytoplasm) {
    return [];
  }
  const stage = voxelMissionStage(snapshot);
  const candidates: readonly PlaceableStructureId[] =
    stage === 'control-and-protein'
      ? ['nucleus', 'ribosomes']
      : stage === 'energy-and-photosynthesis'
        ? ['mitochondria', 'chloroplasts']
        : stage === 'water-storage'
          ? ['centralVacuole']
          : [];
  return candidates.filter(
    (id) =>
      snapshot.depotInventory[id] > 0 && !moduleInTransit(snapshot, id) && !snapshot.placements[id],
  );
}

function isModuleId(value: string): value is MissionModuleId {
  return moduleIds.has(value);
}

function isPlaceableId(value: string): value is PlaceableStructureId {
  return placeableIds.has(value);
}

function nextSpawnSequence(snapshot: VoxelMissionSnapshotV1): number {
  return Math.max(0, ...snapshot.activeModulePickups.map((pickup) => pickup.spawnSequence)) + 1;
}

function commitTransition(
  previous: VoxelMissionSnapshotV1,
  candidate: VoxelMissionSnapshotV1,
  world: VoxelWorld,
  feedback: string,
): VoxelMissionSnapshotV1 {
  candidate.revision = previous.revision + 1;
  candidate.lastFeedback = feedback;
  return validateVoxelMissionSnapshot(candidate, world) ? candidate : previous;
}

function targetAdjacent(target: Extract<MissionTarget, { kind: 'voxel' }>): VoxelPoint {
  return {
    x: target.position.x + target.normal.x,
    y: target.position.y + target.normal.y,
    z: target.position.z + target.normal.z,
  };
}

function boundarySectorForDestination(layer: BoundaryLayer, destination: VoxelPoint) {
  return (
    BOUNDARY_SECTORS.find((sector) =>
      (layer === 'cellWall' ? sector.wallCells : sector.membraneCells).some(
        (cell) => cell.x === destination.x && cell.y === destination.y && cell.z === destination.z,
      ),
    ) ?? null
  );
}

function removePickup(
  snapshot: VoxelMissionSnapshotV1,
  target: Extract<MissionTarget, { kind: 'pickup' }>,
  world: VoxelWorld,
): VoxelMissionSnapshotV1 {
  const pickup = snapshot.activeModulePickups.find(
    (candidate) =>
      candidate.spawnSequence === target.spawnSequence && candidate.item === target.item,
  );
  if (
    !pickup ||
    snapshot.moduleInventory[pickup.item] + pickup.count > MISSION_MODULE_TOTALS[pickup.item]
  ) {
    return snapshot;
  }
  const next = cloneVoxelMissionSnapshot(snapshot);
  next.activeModulePickups = next.activeModulePickups.filter(
    (candidate) => candidate.spawnSequence !== pickup.spawnSequence,
  );
  next.moduleInventory[pickup.item] += pickup.count;
  next.selectedHotbarItem = pickup.item;
  if (
    next.correction.recovery?.kind === 'pickup' &&
    next.correction.recovery.spawnSequence === pickup.spawnSequence
  ) {
    next.correction.recovery = { kind: 'inventory' };
  }
  return commitTransition(
    snapshot,
    next,
    world,
    `${STRUCTURE_LABELS[pickup.item]} collected. Aim at the highlighted build location.`,
  );
}

function mineSupply(
  snapshot: VoxelMissionSnapshotV1,
  target: Extract<MissionTarget, { kind: 'supply' }>,
  world: VoxelWorld,
): VoxelMissionSnapshotV1 {
  if (
    !isModuleId(target.structureId) ||
    !activeMissionSupplies(snapshot).includes(target.structureId)
  ) {
    return snapshot;
  }
  const count = snapshot.depotInventory[target.structureId];
  if (count <= 0 || snapshot.activeModulePickups.length >= 16) return snapshot;
  const next = cloneVoxelMissionSnapshot(snapshot);
  next.depotInventory[target.structureId] = 0;
  next.activeModulePickups.push({
    item: target.structureId,
    count,
    position: { ...MISSION_SUPPLY_CELLS[target.structureId] },
    spawnSequence: nextSpawnSequence(snapshot),
  });
  return commitTransition(
    snapshot,
    next,
    world,
    `${STRUCTURE_LABELS[target.structureId]} supply released as a physical model drop. Aim at it and Collect.`,
  );
}

function placeSelectedModule(
  snapshot: VoxelMissionSnapshotV1,
  target: Extract<MissionTarget, { kind: 'voxel' }>,
  world: VoxelWorld,
): VoxelMissionSnapshotV1 {
  const selected = snapshot.selectedHotbarItem;
  if (selected === 'builder-pick' || snapshot.moduleInventory[selected] <= 0) return snapshot;
  const destination = targetAdjacent(target);
  const next = cloneVoxelMissionSnapshot(snapshot);
  if (selected === 'cellWall' || selected === 'cellMembrane') {
    const sector = boundarySectorForDestination(selected, destination);
    const placed = placeBoundaryModule(next.boundary, selected, sector?.id ?? null);
    if (!placed || !sector || !validateBoundaryPlayerSafety(placed, next.player).valid) {
      return snapshot;
    }
    next.boundary = placed;
    next.moduleInventory[selected] -= 1;
    if (
      next.correction.removedTarget?.kind === 'boundary' &&
      next.correction.removedTarget.layer === selected &&
      next.correction.removedTarget.sectorId === sector.id
    ) {
      next.correction = { removedTarget: null, recovery: null };
    }
  } else {
    if (!isPlaceableId(selected) || destination.y !== 1) return snapshot;
    const candidatePlacements = { ...next.placements, [selected]: destination };
    if (
      !validatePrefabPlacements(candidatePlacements).valid ||
      !validatePrefabPlayerSafety(candidatePlacements, next.player).valid
    ) {
      return snapshot;
    }
    next.placements = candidatePlacements;
    next.moduleInventory[selected] -= 1;
    if (
      next.correction.removedTarget?.kind === 'structure' &&
      next.correction.removedTarget.structureId === selected
    ) {
      next.correction = { removedTarget: null, recovery: null };
    }
  }
  if (next.moduleInventory[selected] === 0) next.selectedHotbarItem = 'builder-pick';
  return commitTransition(
    snapshot,
    next,
    world,
    `${STRUCTURE_LABELS[selected]} installed. Aim at it and Inspect to earn function credit.`,
  );
}

function inspectTarget(
  snapshot: VoxelMissionSnapshotV1,
  target: MissionTarget,
  world: VoxelWorld,
): VoxelMissionSnapshotV1 {
  const next = cloneVoxelMissionSnapshot(snapshot);
  let structureId: keyof typeof STRUCTURE_FUNCTIONS | null = null;
  if (target.kind === 'boundary') {
    const evidence = recordBoundaryFunction(next.boundary, target.layer);
    if (!evidence) return snapshot;
    next.boundary = evidence;
    structureId = target.layer;
  } else if (target.kind === 'structure') {
    if (!next.placements[target.structureId]) return snapshot;
    next.functionEvidence[target.structureId] = true;
    structureId = target.structureId;
    if (target.structureId === 'centralVacuole') {
      next.homeostasis.vacuoleHydratedObserved = true;
    }
  } else if (target.kind === 'supply' && target.structureId === 'cytoplasm') {
    const evidence = recordBoundaryFunction(next.boundary, 'cytoplasm');
    if (!evidence) return snapshot;
    next.boundary = evidence;
    structureId = 'cytoplasm';
  }
  if (!structureId) return snapshot;
  return commitTransition(
    snapshot,
    next,
    world,
    `${STRUCTURE_FUNCTIONS[structureId]} Visible model evidence recorded.`,
  );
}

function activateCytoplasm(
  snapshot: VoxelMissionSnapshotV1,
  target: MissionTarget,
  world: VoxelWorld,
): VoxelMissionSnapshotV1 {
  if (target.kind !== 'supply' || target.structureId !== 'cytoplasm') return snapshot;
  const boundary = establishBoundaryCytoplasm(snapshot.boundary);
  if (!boundary) return snapshot;
  const next = cloneVoxelMissionSnapshot(snapshot);
  next.boundary = boundary;
  return commitTransition(
    snapshot,
    next,
    world,
    'Cytoplasm now fills the entire interior as a non-solid model volume. Inspect the control separately.',
  );
}

function supportedEmptyCells(snapshot: VoxelMissionSnapshotV1): VoxelPoint[] {
  const world = createMissionWorld(snapshot, true);
  const candidates: VoxelPoint[] = [];
  for (let x = -10; x <= 10; x += 1) {
    for (let z = -10; z <= 10; z += 1) {
      const cell = { x, y: 1, z };
      if (isSolidVoxel(world.getOrAir(cell))) continue;
      if (!isSolidVoxel(world.getOrAir({ x, y: 0, z }))) continue;
      if (
        Object.values(MISSION_SUPPLY_CELLS).some((supply) => supply.x === x && supply.z === z) ||
        (CYTOPLASM_CONTROL_CELL.x === x && CYTOPLASM_CONTROL_CELL.z === z)
      ) {
        continue;
      }
      candidates.push(cell);
    }
  }
  return candidates;
}

export function findNearestReachableRecoveryCell(
  snapshot: VoxelMissionSnapshotV1,
  removedFrom: Point3,
): VoxelPoint | null {
  const allowed = new Map(
    supportedEmptyCells(snapshot).map((cell) => [`${cell.x},${cell.z}`, cell]),
  );
  let start = { x: Math.round(snapshot.player.x), y: 1, z: Math.round(snapshot.player.z) };
  if (!allowed.has(`${start.x},${start.z}`)) {
    start =
      [...allowed.values()].sort(
        (left, right) =>
          Math.hypot(left.x - snapshot.player.x, left.z - snapshot.player.z) -
          Math.hypot(right.x - snapshot.player.x, right.z - snapshot.player.z),
      )[0] ?? start;
  }
  const reachable = new Map<string, VoxelPoint>();
  const queue = [start];
  reachable.set(`${start.x},${start.z}`, start);
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const key = `${cell.x + dx},${cell.z + dz}`;
      const next = allowed.get(key);
      if (!next || reachable.has(key)) continue;
      reachable.set(key, next);
      queue.push(next);
    }
  }
  return (
    [...reachable.values()].sort(
      (left, right) =>
        Math.hypot(left.x - removedFrom.x, left.z - removedFrom.z) -
        Math.hypot(right.x - removedFrom.x, right.z - removedFrom.z),
    )[0] ?? null
  );
}

export interface RemovalRecoveryOptions {
  recoveryCell?: (snapshot: VoxelMissionSnapshotV1, removedFrom: Point3) => VoxelPoint | null;
  pickupCapacity?: number;
  allowInventoryFallback?: boolean;
}

function removeMissionModule(
  snapshot: VoxelMissionSnapshotV1,
  target: MissionTarget,
  world: VoxelWorld,
  options: RemovalRecoveryOptions,
): VoxelMissionSnapshotV1 {
  if (snapshot.selectedHotbarItem !== 'builder-pick' || snapshot.correction.removedTarget) {
    return snapshot;
  }
  const next = cloneVoxelMissionSnapshot(snapshot);
  let item: MissionModuleId;
  let removedTarget: VoxelMissionRemovedTargetV1;
  let removedFrom: Point3;
  if (target.kind === 'boundary') {
    const boundary = removeBoundaryModule(next.boundary, target.layer, target.sectorId);
    if (!boundary) return snapshot;
    next.boundary = boundary;
    item = target.layer;
    removedTarget = { kind: 'boundary', layer: target.layer, sectorId: target.sectorId };
    const sector = BOUNDARY_SECTORS.find((candidate) => candidate.id === target.sectorId)!;
    removedFrom = target.layer === 'cellWall' ? sector.wallAnchor : sector.membraneAnchor;
  } else if (target.kind === 'structure') {
    const placement = next.placements[target.structureId];
    if (!placement || !allInternalEvidence(snapshot)) return snapshot;
    item = target.structureId;
    removedTarget = { kind: 'structure', structureId: target.structureId };
    removedFrom = placement;
    delete next.placements[target.structureId];
    delete next.functionEvidence[target.structureId];
    if (target.structureId === 'centralVacuole') {
      next.homeostasis.vacuoleHydratedObserved = false;
    }
  } else {
    return snapshot;
  }

  next.correction.removedTarget = removedTarget;
  const recoveryCell = (options.recoveryCell ?? findNearestReachableRecoveryCell)(
    next,
    removedFrom,
  );
  const pickupCapacity = options.pickupCapacity ?? 16;
  if (recoveryCell && next.activeModulePickups.length < pickupCapacity) {
    const spawnSequence = nextSpawnSequence(next);
    next.activeModulePickups.push({ item, count: 1, position: recoveryCell, spawnSequence });
    next.correction.recovery = { kind: 'pickup', spawnSequence };
  } else if (
    (options.allowInventoryFallback ?? true) &&
    next.moduleInventory[item] < MISSION_MODULE_TOTALS[item]
  ) {
    next.moduleInventory[item] += 1;
    next.selectedHotbarItem = item;
    next.correction.recovery = { kind: 'inventory' };
  } else {
    return snapshot;
  }
  return commitTransition(
    snapshot,
    next,
    world,
    `${STRUCTURE_LABELS[item]} removed. Recover the module, replace it, then reinspect it.`,
  );
}

export function executeMissionCommand(
  snapshot: VoxelMissionSnapshotV1,
  command: MissionCommand,
  currentTarget: MissionTarget | null,
  world: VoxelWorld,
  removalOptions: RemovalRecoveryOptions = {},
): VoxelMissionSnapshotV1 {
  if (
    !validateMissionCommand(command, snapshot.revision) ||
    !currentTarget ||
    !validateMissionTarget(currentTarget) ||
    currentTarget.snapshotRevision !== snapshot.revision
  ) {
    return snapshot;
  }
  switch (command.type) {
    case 'mine':
      return currentTarget.kind === 'supply'
        ? mineSupply(snapshot, currentTarget, world)
        : snapshot;
    case 'collect':
      return currentTarget.kind === 'pickup'
        ? removePickup(snapshot, currentTarget, world)
        : snapshot;
    case 'place':
      return currentTarget.kind === 'voxel'
        ? placeSelectedModule(snapshot, currentTarget, world)
        : snapshot;
    case 'inspect':
      return inspectTarget(snapshot, currentTarget, world);
    case 'interact':
      return activateCytoplasm(snapshot, currentTarget, world);
    case 'remove':
      return removeMissionModule(snapshot, currentTarget, world, removalOptions);
    case 'overview':
    case 'recover':
      return snapshot;
  }
}

export function updateMissionPlayer(
  snapshot: VoxelMissionSnapshotV1,
  player: VoxelMissionPlayerV1,
  world: VoxelWorld,
): VoxelMissionSnapshotV1 {
  const next = cloneVoxelMissionSnapshot(snapshot);
  next.player = { ...player };
  return commitTransition(snapshot, next, world, snapshot.lastFeedback);
}

export function selectMissionHotbarItem(
  snapshot: VoxelMissionSnapshotV1,
  item: VoxelMissionSnapshotV1['selectedHotbarItem'],
  world: VoxelWorld,
): VoxelMissionSnapshotV1 {
  if (
    item === snapshot.selectedHotbarItem ||
    (item !== 'builder-pick' && snapshot.moduleInventory[item] <= 0)
  ) {
    return snapshot;
  }
  const next = cloneVoxelMissionSnapshot(snapshot);
  next.selectedHotbarItem = item;
  return commitTransition(
    snapshot,
    next,
    world,
    item === 'builder-pick'
      ? "Builder's Pick selected."
      : `${STRUCTURE_LABELS[item]} selected for placement.`,
  );
}

function objectiveFor(snapshot: VoxelMissionSnapshotV1): string {
  if (snapshot.correction.recovery?.kind === 'pickup')
    return 'Aim at the recovery drop and Collect.';
  if (snapshot.correction.recovery?.kind === 'inventory') {
    return 'Place the recovered module in the open model location.';
  }
  const pickup = snapshot.activeModulePickups[0];
  if (pickup) return `Aim at the ${STRUCTURE_LABELS[pickup.item]} drop and Collect.`;
  const carried = MISSION_MODULE_IDS.find((id) => snapshot.moduleInventory[id] > 0);
  if (carried) return `Aim at a valid location and place ${STRUCTURE_LABELS[carried]}.`;
  if (snapshot.boundary.wallAnchors.length < 6) return 'Build six Cell Wall panels outside.';
  if (!snapshot.boundary.functionEvidence.cellWall)
    return 'Aim at the completed Cell Wall and Inspect.';
  if (snapshot.boundary.membraneAnchors.length < 6) {
    return 'Build six Cell Membrane panels just inside the wall.';
  }
  if (!snapshot.boundary.functionEvidence.cellMembrane) {
    return 'Aim at the completed Cell Membrane and Inspect.';
  }
  if (snapshot.boundary.cytoplasm === 'empty') return 'Aim at the Cytoplasm control and Activate.';
  if (!snapshot.boundary.functionEvidence.cytoplasm) {
    return 'Aim at the Cytoplasm control and Inspect the full interior fill.';
  }
  const unobserved = MISSION_STRUCTURE_ORDER.find(
    (id) => snapshot.placements[id] && !snapshot.functionEvidence[id],
  );
  if (unobserved) return `Aim at the ${STRUCTURE_LABELS[unobserved]} and Inspect.`;
  const supplies = activeMissionSupplies(snapshot);
  if (supplies.length > 0) {
    return `Choose ${supplies.map((id) => STRUCTURE_LABELS[id]).join(' or ')} and mine its supply crate.`;
  }
  return allInternalEvidence(snapshot)
    ? 'Phase 4.5 checkpoint ready: remove one structure, recover it, rebuild, and reinspect.'
    : 'Aim at the highlighted model target.';
}

function actionForTarget(
  snapshot: VoxelMissionSnapshotV1,
  target: MissionTarget | null,
): Pick<
  MissionViewModel,
  'primaryVerb' | 'primaryActionLabel' | 'primaryActionAccessibleLabel' | 'primaryActionEnabled'
> {
  if (!target) {
    return {
      primaryVerb: null,
      primaryActionLabel: 'Aim at the objective',
      primaryActionAccessibleLabel: 'Aim the crosshair at the current objective',
      primaryActionEnabled: false,
    };
  }
  const selectedModule =
    snapshot.selectedHotbarItem === 'builder-pick' ? null : snapshot.selectedHotbarItem;
  if (selectedModule && snapshot.moduleInventory[selectedModule] > 0) {
    return {
      primaryVerb: 'place',
      primaryActionLabel: 'Place module',
      primaryActionAccessibleLabel: `Place ${STRUCTURE_LABELS[selectedModule]}`,
      primaryActionEnabled: target.kind === 'voxel',
    };
  }
  if (target.kind === 'pickup') {
    return {
      primaryVerb: 'collect',
      primaryActionLabel: 'Collect drop',
      primaryActionAccessibleLabel: `Collect ${STRUCTURE_LABELS[target.item]} model drop`,
      primaryActionEnabled: true,
    };
  }
  if (target.kind === 'boundary') {
    const observed = snapshot.boundary.functionEvidence[target.layer];
    if (!observed) {
      return {
        primaryVerb: 'inspect',
        primaryActionLabel: 'Inspect function',
        primaryActionAccessibleLabel: `Inspect ${STRUCTURE_LABELS[target.layer]} function`,
        primaryActionEnabled: true,
      };
    }
    return {
      primaryVerb: 'remove',
      primaryActionLabel: 'Remove module',
      primaryActionAccessibleLabel: `Remove ${STRUCTURE_LABELS[target.layer]} module`,
      primaryActionEnabled:
        snapshot.selectedHotbarItem === 'builder-pick' &&
        snapshot.boundary.cytoplasm === 'empty' &&
        !snapshot.correction.removedTarget,
    };
  }
  if (target.kind === 'structure') {
    if (!snapshot.functionEvidence[target.structureId]) {
      return {
        primaryVerb: 'inspect',
        primaryActionLabel: 'Inspect function',
        primaryActionAccessibleLabel: `Inspect ${STRUCTURE_LABELS[target.structureId]} function`,
        primaryActionEnabled: true,
      };
    }
    return {
      primaryVerb: 'remove',
      primaryActionLabel: 'Remove prefab',
      primaryActionAccessibleLabel: `Remove ${STRUCTURE_LABELS[target.structureId]} prefab`,
      primaryActionEnabled:
        snapshot.selectedHotbarItem === 'builder-pick' &&
        allInternalEvidence(snapshot) &&
        !snapshot.correction.removedTarget,
    };
  }
  if (target.kind === 'supply' && target.structureId === 'cytoplasm') {
    const filled = snapshot.boundary.cytoplasm === 'filled';
    return {
      primaryVerb: filled ? 'inspect' : 'interact',
      primaryActionLabel: filled ? 'Inspect Cytoplasm' : 'Activate Cytoplasm',
      primaryActionAccessibleLabel: filled
        ? 'Inspect the Cytoplasm function'
        : 'Activate the full Cytoplasm model fill',
      primaryActionEnabled: filled
        ? !snapshot.boundary.functionEvidence.cytoplasm
        : boundaryComplete(snapshot),
    };
  }
  if (target.kind === 'supply' && isModuleId(target.structureId)) {
    return {
      primaryVerb: 'mine',
      primaryActionLabel: 'Mine supply',
      primaryActionAccessibleLabel: `Mine ${STRUCTURE_LABELS[target.structureId]} supply crate`,
      primaryActionEnabled: activeMissionSupplies(snapshot).includes(target.structureId),
    };
  }
  return {
    primaryVerb: null,
    primaryActionLabel: 'Target unavailable',
    primaryActionAccessibleLabel: 'The targeted model item is not active yet',
    primaryActionEnabled: false,
  };
}

export function selectMissionViewModel(
  snapshot: VoxelMissionSnapshotV1,
  target: MissionTarget | null,
): MissionViewModel {
  return {
    objective: objectiveFor(snapshot),
    highlightedTarget: target,
    ...actionForTarget(snapshot, target),
    hintContext: { stage: voxelMissionStage(snapshot), currentLevel: 0, maxLevel: 3 },
    feedback: snapshot.lastFeedback
      ? {
          tone: snapshot.lastFeedback.includes('Invalid') ? 'correction' : 'information',
          message: snapshot.lastFeedback,
        }
      : null,
  };
}

export class VoxelMissionRuntime {
  private snapshot: VoxelMissionSnapshotV1;
  private stopped = false;

  constructor(
    private readonly contractWorld: VoxelWorld,
    initial = createInitialVoxelMissionSnapshot(),
  ) {
    if (!validateVoxelMissionSnapshot(initial, contractWorld)) {
      throw new Error('VoxelMissionRuntime requires a valid initial snapshot.');
    }
    this.snapshot = cloneVoxelMissionSnapshot(initial);
  }

  current(): VoxelMissionSnapshotV1 {
    return cloneVoxelMissionSnapshot(this.snapshot);
  }

  /** Read-only frame view; callers must never retain or mutate it. */
  peek(): Readonly<VoxelMissionSnapshotV1> {
    return this.snapshot;
  }

  score() {
    return scoreVoxelMissionSnapshot(this.snapshot, this.contractWorld);
  }

  dispatch(
    command: MissionCommand,
    target: MissionTarget | null,
    removalOptions: RemovalRecoveryOptions = {},
  ): VoxelMissionSnapshotV1 {
    if (this.stopped) return this.current();
    this.snapshot = executeMissionCommand(
      this.snapshot,
      command,
      target,
      this.contractWorld,
      removalOptions,
    );
    return this.current();
  }

  updatePlayer(player: VoxelMissionPlayerV1): VoxelMissionSnapshotV1 {
    if (this.stopped) return this.current();
    this.snapshot = updateMissionPlayer(this.snapshot, player, this.contractWorld);
    return this.current();
  }

  /** Frame-path update after PlayerMotor has already resolved collision. */
  updatePlayerFrame(player: VoxelMissionPlayerV1): void {
    if (this.stopped || !Object.values(player).every(Number.isFinite)) return;
    this.snapshot = {
      ...this.snapshot,
      revision: this.snapshot.revision + 1,
      player: { ...player },
    };
  }

  selectItem(item: VoxelMissionSnapshotV1['selectedHotbarItem']): VoxelMissionSnapshotV1 {
    if (this.stopped) return this.current();
    this.snapshot = selectMissionHotbarItem(this.snapshot, item, this.contractWorld);
    return this.current();
  }

  stopForContextLoss(): void {
    this.stopped = true;
  }

  isStopped(): boolean {
    return this.stopped;
  }
}

export const MISSION_CYTOPLASM_TARGET: Readonly<MissionTarget> = {
  kind: 'supply',
  snapshotRevision: 0,
  structureId: 'cytoplasm',
  distance: 0,
};
