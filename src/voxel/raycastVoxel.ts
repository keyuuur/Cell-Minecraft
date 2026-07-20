import { isSolidVoxel, voxelCollisionHeight } from './blocks';
import type { VoxelWorld } from './VoxelWorld';
import type { VoxelPoint } from './types';

export interface VoxelRaycastHit {
  cell: VoxelPoint;
  normal: VoxelPoint;
  adjacent: VoxelPoint;
  distance: number;
  block: number;
}

export interface VoxelRaycastOptions {
  maxDistance?: number;
  maxSteps?: number;
}

const EPSILON = 1e-9;
export const TARGET_RAYCAST_DISTANCE = 5;
export const TARGET_RAYCAST_STEPS = 64;

function intersectVoxelShape(
  origin: VoxelPoint,
  direction: VoxelPoint,
  cell: VoxelPoint,
  height: number,
): { distance: number; normal: VoxelPoint } | null {
  const minimum = { x: cell.x - 0.5, y: cell.y - 0.5, z: cell.z - 0.5 };
  const maximum = {
    x: cell.x + 0.5,
    y: cell.y - 0.5 + height,
    z: cell.z + 0.5,
  };
  let near = Number.NEGATIVE_INFINITY;
  let far = Number.POSITIVE_INFINITY;
  let normal: VoxelPoint = { x: 0, y: 0, z: 0 };
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(direction[axis]) <= EPSILON) {
      if (origin[axis] < minimum[axis] || origin[axis] > maximum[axis]) return null;
      continue;
    }
    const first = (minimum[axis] - origin[axis]) / direction[axis];
    const second = (maximum[axis] - origin[axis]) / direction[axis];
    const axisNear = Math.min(first, second);
    const axisFar = Math.max(first, second);
    if (axisNear > near) {
      near = axisNear;
      normal = { x: 0, y: 0, z: 0 };
      normal[axis] = first < second ? -1 : 1;
    }
    far = Math.min(far, axisFar);
    if (near > far) return null;
  }
  if (far < 0) return null;
  return { distance: Math.max(0, near), normal };
}

function normalized(direction: VoxelPoint): VoxelPoint | null {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length <= EPSILON) return null;
  return {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
}

export function raycastVoxel(
  world: VoxelWorld,
  origin: VoxelPoint,
  direction: VoxelPoint,
  options: VoxelRaycastOptions = {},
): VoxelRaycastHit | null {
  if (![origin.x, origin.y, origin.z].every(Number.isFinite)) return null;
  const ray = normalized(direction);
  if (!ray) return null;
  const maxDistance = options.maxDistance ?? TARGET_RAYCAST_DISTANCE;
  const maxSteps = options.maxSteps ?? TARGET_RAYCAST_STEPS;
  if (!Number.isFinite(maxDistance) || maxDistance < 0 || maxDistance > TARGET_RAYCAST_DISTANCE) {
    throw new RangeError(
      `maxDistance must be finite and between 0 and ${TARGET_RAYCAST_DISTANCE}.`,
    );
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > TARGET_RAYCAST_STEPS) {
    throw new RangeError(`maxSteps must be an integer from 1 to ${TARGET_RAYCAST_STEPS}.`);
  }

  // Voxel coordinates represent cell centers, so shifting by 0.5 gives standard
  // integer-boundary DDA space while keeping public coordinates intuitive.
  const shifted = {
    x: origin.x + 0.5,
    y: origin.y + 0.5,
    z: origin.z + 0.5,
  };
  const cell: VoxelPoint = {
    x: Math.floor(shifted.x),
    y: Math.floor(shifted.y),
    z: Math.floor(shifted.z),
  };
  if (world.contains(cell) && isSolidVoxel(world.get(cell))) {
    return {
      cell: { ...cell },
      normal: { x: 0, y: 0, z: 0 },
      adjacent: { ...cell },
      distance: 0,
      block: world.get(cell),
    };
  }

  const step: VoxelPoint = {
    x: ray.x > 0 ? 1 : ray.x < 0 ? -1 : 0,
    y: ray.y > 0 ? 1 : ray.y < 0 ? -1 : 0,
    z: ray.z > 0 ? 1 : ray.z < 0 ? -1 : 0,
  };
  const delta: VoxelPoint = {
    x: step.x === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / ray.x),
    y: step.y === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / ray.y),
    z: step.z === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / ray.z),
  };
  const nextBoundary = (value: number, cellValue: number, axisStep: number): number =>
    axisStep > 0 ? cellValue + 1 - value : value - cellValue;
  const max: VoxelPoint = {
    x: step.x === 0 ? Number.POSITIVE_INFINITY : nextBoundary(shifted.x, cell.x, step.x) * delta.x,
    y: step.y === 0 ? Number.POSITIVE_INFINITY : nextBoundary(shifted.y, cell.y, step.y) * delta.y,
    z: step.z === 0 ? Number.POSITIVE_INFINITY : nextBoundary(shifted.z, cell.z, step.z) * delta.z,
  };

  for (let traversed = 0; traversed < maxSteps; traversed += 1) {
    let axis: keyof VoxelPoint = 'x';
    if (max.y < max.x || (max.y === max.x && ray.y !== 0)) axis = 'y';
    if (max.z < max[axis]) axis = 'z';
    const distance = max[axis];
    if (distance > maxDistance || !Number.isFinite(distance)) return null;
    cell[axis] += step[axis];
    max[axis] += delta[axis];
    if (!world.contains(cell)) continue;
    const block = world.get(cell);
    if (!isSolidVoxel(block)) continue;
    const shapeHit = intersectVoxelShape(origin, ray, cell, voxelCollisionHeight(block));
    if (!shapeHit || shapeHit.distance > maxDistance) continue;
    const normal = shapeHit.normal;
    return {
      cell: { ...cell },
      normal,
      adjacent: {
        x: cell.x + normal.x,
        y: cell.y + normal.y,
        z: cell.z + normal.z,
      },
      distance: shapeHit.distance,
      block,
    };
  }
  return null;
}
