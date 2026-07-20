export interface VoxelPoint {
  x: number;
  y: number;
  z: number;
}

export interface VoxelBounds {
  min: VoxelPoint;
  width: number;
  height: number;
  depth: number;
}

export interface VoxelRegion {
  x: number;
  y: number;
  z: number;
}

export interface PlayerBody {
  position: VoxelPoint;
  radius: number;
  height: number;
}

export function voxelKey(point: VoxelPoint): string {
  return `${point.x},${point.y},${point.z}`;
}

export function sameVoxel(a: VoxelPoint | null, b: VoxelPoint | null): boolean {
  return Boolean(a && b && a.x === b.x && a.y === b.y && a.z === b.z);
}
