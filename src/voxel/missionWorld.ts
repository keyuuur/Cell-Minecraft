import { prefabCollisionCells, MISSION_INTERIOR_BOUNDS } from '../contracts/prefabRegistry';
import type {
  MissionModuleId,
  PlaceableStructureId,
  StructureId,
  VoxelMissionSnapshotV1,
} from '../types/game';
import { BOUNDARY_SECTORS, type BoundaryLayer, type BoundarySector } from './boundaryAdapter';
import { VoxelBlock } from './blocks';
import { MISSION_STRUCTURE_ORDER } from './missionDefinition';
import { voxelKey, type VoxelPoint } from './types';
import { VoxelWorld, type VoxelWorldOptions } from './VoxelWorld';

export const MISSION_WORLD_OPTIONS: VoxelWorldOptions = {
  min: { x: -12, y: 0, z: -12 },
  width: 24,
  height: 12,
  depth: 24,
  regionSize: { x: 8, y: 12, z: 8 },
};

export const MISSION_SUPPLY_CELLS: Readonly<Record<MissionModuleId, VoxelPoint>> = {
  cellWall: { x: -2, y: 1, z: 6 },
  cellMembrane: { x: 2, y: 1, z: 6 },
  nucleus: { x: -8, y: 1, z: 5 },
  ribosomes: { x: 8, y: 1, z: 5 },
  mitochondria: { x: -8, y: 1, z: 0 },
  chloroplasts: { x: 8, y: 1, z: 0 },
  centralVacuole: { x: 0, y: 1, z: 3 },
};

export const CYTOPLASM_CONTROL_CELL: VoxelPoint = { x: 0, y: 1, z: 1 };
export const WATER_STATION_CELL: VoxelPoint = { x: 5, y: 1, z: 8 };

export type MissionWorldOwner =
  | { kind: 'supply'; structureId: StructureId }
  | { kind: 'cytoplasm-control' }
  | { kind: 'water-station' }
  | { kind: 'boundary'; layer: BoundaryLayer; sector: BoundarySector }
  | { kind: 'structure'; structureId: PlaceableStructureId };

function setStaticTemplate(world: VoxelWorld): void {
  for (let x = -11; x <= 11; x += 1) {
    for (let z = -11; z <= 11; z += 1) {
      const path = x >= -2 && x <= 2 && z >= 1 && z <= 10;
      const modelFloor = x >= -6 && x <= 6 && z >= -9 && z <= 0;
      world.set(
        { x, y: 0, z },
        modelFloor ? VoxelBlock.Foundation : path ? VoxelBlock.Path : VoxelBlock.Grass,
      );
    }
  }
  for (let edge = -11; edge <= 11; edge += 1) {
    for (let y = 1; y <= 3; y += 1) {
      world.set({ x: -11, y, z: edge }, VoxelBlock.Soil);
      world.set({ x: 11, y, z: edge }, VoxelBlock.Soil);
    }
  }
  for (let edge = -10; edge <= 10; edge += 1) {
    world.set({ x: edge, y: 1, z: -11 }, VoxelBlock.Soil);
    world.set({ x: edge, y: 2, z: -11 }, VoxelBlock.Soil);
  }
  for (let x = -2; x <= 2; x += 1) world.set({ x, y: 1, z: 8 }, VoxelBlock.Step);
  for (const sector of BOUNDARY_SECTORS) {
    for (let y = 1; y <= 3; y += 1) {
      world.set({ ...sector.wallBacking, y }, VoxelBlock.Stone);
    }
  }
  for (const [x, z] of [
    [-9, 9],
    [9, -7],
    [9, 9],
  ]) {
    world.set({ x, y: 1, z }, VoxelBlock.Wood);
    world.set({ x, y: 2, z }, VoxelBlock.Wood);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        world.set({ x: x + dx, y: 3, z: z + dz }, VoxelBlock.Leaves);
      }
    }
  }
}

function clearMissionDynamicCells(world: VoxelWorld): void {
  Object.values(MISSION_SUPPLY_CELLS).forEach((cell) => world.set(cell, VoxelBlock.Air));
  world.set(CYTOPLASM_CONTROL_CELL, VoxelBlock.Air);
  world.set(WATER_STATION_CELL, VoxelBlock.Air);
  for (const sector of BOUNDARY_SECTORS) {
    [...sector.wallCells, ...sector.membraneCells].forEach((cell) =>
      world.set(cell, VoxelBlock.Air),
    );
  }
  for (let x = MISSION_INTERIOR_BOUNDS.minX; x <= MISSION_INTERIOR_BOUNDS.maxX; x += 1) {
    for (let z = MISSION_INTERIOR_BOUNDS.minZ; z <= MISSION_INTERIOR_BOUNDS.maxZ; z += 1) {
      for (let y = MISSION_INTERIOR_BOUNDS.floorY; y <= 4; y += 1) {
        world.set({ x, y, z }, VoxelBlock.Air);
      }
    }
  }
}

function supplyBlock(id: MissionModuleId): VoxelBlock {
  if (id === 'cellWall') return VoxelBlock.CellWall;
  if (id === 'cellMembrane') return VoxelBlock.CellMembrane;
  return VoxelBlock.Builder;
}

export function syncMissionWorld(
  world: VoxelWorld,
  snapshot: VoxelMissionSnapshotV1,
  includePrefabCollision: boolean,
): void {
  clearMissionDynamicCells(world);
  for (const [rawId, cell] of Object.entries(MISSION_SUPPLY_CELLS)) {
    const id = rawId as MissionModuleId;
    if (snapshot.depotInventory[id] > 0) world.set(cell, supplyBlock(id));
  }
  if (!snapshot.boundary.functionEvidence.cytoplasm) {
    world.set(CYTOPLASM_CONTROL_CELL, VoxelBlock.ModelControl);
  }
  world.set(WATER_STATION_CELL, VoxelBlock.ModelControl);
  for (const sector of BOUNDARY_SECTORS) {
    if (snapshot.boundary.wallAnchors.includes(sector.id)) {
      sector.wallCells.forEach((cell) => world.set(cell, VoxelBlock.CellWall));
    }
    if (snapshot.boundary.membraneAnchors.includes(sector.id)) {
      sector.membraneCells.forEach((cell) => world.set(cell, VoxelBlock.CellMembrane));
    }
  }
  if (includePrefabCollision) {
    for (const id of MISSION_STRUCTURE_ORDER) {
      const anchor = snapshot.placements[id];
      if (!anchor) continue;
      prefabCollisionCells(id, anchor).forEach((cell) => world.set(cell, VoxelBlock.ModelControl));
    }
  }
}

export function createMissionWorld(
  snapshot: VoxelMissionSnapshotV1,
  includePrefabCollision = false,
): VoxelWorld {
  const world = new VoxelWorld(MISSION_WORLD_OPTIONS);
  setStaticTemplate(world);
  syncMissionWorld(world, snapshot, includePrefabCollision);
  return world;
}

export function missionWorldOwnerAt(
  snapshot: VoxelMissionSnapshotV1,
  cell: VoxelPoint,
): MissionWorldOwner | null {
  if (voxelKey(cell) === voxelKey(CYTOPLASM_CONTROL_CELL)) {
    return { kind: 'cytoplasm-control' };
  }
  if (voxelKey(cell) === voxelKey(WATER_STATION_CELL)) {
    return { kind: 'water-station' };
  }
  for (const [rawId, supplyCell] of Object.entries(MISSION_SUPPLY_CELLS)) {
    const id = rawId as MissionModuleId;
    if (snapshot.depotInventory[id] > 0 && voxelKey(cell) === voxelKey(supplyCell)) {
      return { kind: 'supply', structureId: id };
    }
  }
  for (const sector of BOUNDARY_SECTORS) {
    if (
      snapshot.boundary.wallAnchors.includes(sector.id) &&
      sector.wallCells.some((candidate) => voxelKey(candidate) === voxelKey(cell))
    ) {
      return { kind: 'boundary', layer: 'cellWall', sector };
    }
    if (
      snapshot.boundary.membraneAnchors.includes(sector.id) &&
      sector.membraneCells.some((candidate) => voxelKey(candidate) === voxelKey(cell))
    ) {
      return { kind: 'boundary', layer: 'cellMembrane', sector };
    }
  }
  for (const id of MISSION_STRUCTURE_ORDER) {
    const anchor = snapshot.placements[id];
    if (
      anchor &&
      prefabCollisionCells(id, anchor).some((candidate) => voxelKey(candidate) === voxelKey(cell))
    ) {
      return { kind: 'structure', structureId: id };
    }
  }
  return null;
}
