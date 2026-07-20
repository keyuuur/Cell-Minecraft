import { isSolidVoxel, VOXEL_BLOCK_DEFINITIONS, voxelCollisionHeight, VoxelBlock } from './blocks';
import type { VoxelPoint, VoxelRegion } from './types';
import type { VoxelWorld } from './VoxelWorld';

export interface VoxelRegionGeometry {
  positions: number[];
  normals: number[];
  indices: number[];
  uvs: number[];
  faceCount: number;
  blockCount: number;
}

interface FaceDefinition {
  normal: VoxelPoint;
  corners: [number, number, number][];
}

const FACES: FaceDefinition[] = [
  {
    normal: { x: 1, y: 0, z: 0 },
    corners: [
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5],
      [0.5, -0.5, 0.5],
    ],
  },
  {
    normal: { x: -1, y: 0, z: 0 },
    corners: [
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5],
      [-0.5, -0.5, -0.5],
    ],
  },
  {
    normal: { x: 0, y: 1, z: 0 },
    corners: [
      [-0.5, 0.5, -0.5],
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5],
    ],
  },
  {
    normal: { x: 0, y: -1, z: 0 },
    corners: [
      [-0.5, -0.5, 0.5],
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
    ],
  },
  {
    normal: { x: 0, y: 0, z: 1 },
    corners: [
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, -0.5, 0.5],
    ],
  },
  {
    normal: { x: 0, y: 0, z: -1 },
    corners: [
      [-0.5, -0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, -0.5, -0.5],
    ],
  },
];

function exposedFaceMinimumY(
  world: VoxelWorld,
  point: VoxelPoint,
  normal: VoxelPoint,
  block: number,
): number | null {
  const neighbor = world.getOrAir({
    x: point.x + normal.x,
    y: point.y + normal.y,
    z: point.z + normal.z,
  });
  if (!isSolidVoxel(neighbor)) return -0.5;
  if (normal.y !== 0) return null;
  const neighborHeight = voxelCollisionHeight(neighbor);
  const currentHeight = voxelCollisionHeight(block);
  return neighborHeight < currentHeight ? -0.5 + neighborHeight : null;
}

export function buildVoxelRegionGeometry(
  world: VoxelWorld,
  region: VoxelRegion,
): VoxelRegionGeometry {
  const geometry: VoxelRegionGeometry = {
    positions: [],
    normals: [],
    indices: [],
    uvs: [],
    faceCount: 0,
    blockCount: 0,
  };
  const atlasColumns = 4;
  const atlasRows = 4;
  const inset = 0.003;

  world.forEachCell((point, block) => {
    if (block === VoxelBlock.Air) return;
    geometry.blockCount += 1;
    const height = voxelCollisionHeight(block);
    for (const face of FACES) {
      const minimumY = exposedFaceMinimumY(world, point, face.normal, block);
      if (minimumY === null) continue;
      const base = geometry.positions.length / 3;
      for (const [x, y, z] of face.corners) {
        const adjustedY = y > 0 ? -0.5 + height : minimumY;
        geometry.positions.push(point.x + x, point.y + adjustedY, point.z + z);
        geometry.normals.push(face.normal.x, face.normal.y, face.normal.z);
      }
      geometry.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      const tile = VOXEL_BLOCK_DEFINITIONS[block].atlasTile;
      const column = tile % atlasColumns;
      const row = Math.floor(tile / atlasColumns);
      const u0 = column / atlasColumns + inset;
      const u1 = (column + 1) / atlasColumns - inset;
      const v0 = row / atlasRows + inset;
      const v1 = (row + 1) / atlasRows - inset;
      geometry.uvs.push(u0, v0, u0, v1, u1, v1, u1, v0);
      geometry.faceCount += 1;
    }
  }, region);
  return geometry;
}
