export const enum VoxelBlock {
  Air = 0,
  Grass = 1,
  Soil = 2,
  Stone = 3,
  Path = 4,
  Foundation = 5,
  Wood = 6,
  Leaves = 7,
  Builder = 8,
  Step = 9,
}

export interface VoxelBlockDefinition {
  id: VoxelBlock;
  name: string;
  atlasTile: number;
  collisionHeight: number;
}

export const VOXEL_PALETTE_VERSION = 1;

export const VOXEL_BLOCK_DEFINITIONS: Readonly<Record<VoxelBlock, VoxelBlockDefinition>> = {
  [VoxelBlock.Air]: {
    id: VoxelBlock.Air,
    name: 'Air',
    atlasTile: 0,
    collisionHeight: 0,
  },
  [VoxelBlock.Grass]: {
    id: VoxelBlock.Grass,
    name: 'Grass',
    atlasTile: 1,
    collisionHeight: 1,
  },
  [VoxelBlock.Soil]: {
    id: VoxelBlock.Soil,
    name: 'Soil',
    atlasTile: 2,
    collisionHeight: 1,
  },
  [VoxelBlock.Stone]: {
    id: VoxelBlock.Stone,
    name: 'Stone',
    atlasTile: 3,
    collisionHeight: 1,
  },
  [VoxelBlock.Path]: {
    id: VoxelBlock.Path,
    name: 'Path',
    atlasTile: 4,
    collisionHeight: 1,
  },
  [VoxelBlock.Foundation]: {
    id: VoxelBlock.Foundation,
    name: 'Foundation',
    atlasTile: 5,
    collisionHeight: 1,
  },
  [VoxelBlock.Wood]: {
    id: VoxelBlock.Wood,
    name: 'Wood',
    atlasTile: 6,
    collisionHeight: 1,
  },
  [VoxelBlock.Leaves]: {
    id: VoxelBlock.Leaves,
    name: 'Leaves',
    atlasTile: 7,
    collisionHeight: 1,
  },
  [VoxelBlock.Builder]: {
    id: VoxelBlock.Builder,
    name: 'Builder Block',
    atlasTile: 8,
    collisionHeight: 1,
  },
  [VoxelBlock.Step]: {
    id: VoxelBlock.Step,
    name: 'Training Step',
    atlasTile: 9,
    collisionHeight: 0.5,
  },
};

export function isVoxelBlock(value: number): value is VoxelBlock {
  return Number.isInteger(value) && value >= VoxelBlock.Air && value <= VoxelBlock.Step;
}

export function isSolidVoxel(value: number): boolean {
  return isVoxelBlock(value) && VOXEL_BLOCK_DEFINITIONS[value].collisionHeight > 0;
}

export function voxelCollisionHeight(value: number): number {
  return isVoxelBlock(value) ? VOXEL_BLOCK_DEFINITIONS[value].collisionHeight : 0;
}
