import { isSolidVoxel, voxelCollisionHeight } from './blocks';
import type { PlayerBody, VoxelPoint } from './types';
import type { VoxelWorld } from './VoxelWorld';

export interface PlayerMotorOptions {
  radius?: number;
  height?: number;
  stepHeight?: number;
  maxSubstep?: number;
  groundProbe?: number;
}

export interface PlayerMoveResult {
  position: VoxelPoint;
  stepped: boolean;
  blockedX: boolean;
  blockedZ: boolean;
  grounded: boolean;
}

const EPSILON = 1e-4;
const MAX_MOTOR_SUBSTEPS = 64;

function assertFiniteRange(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
  includeMinimum = false,
): void {
  const belowMinimum = includeMinimum ? value < minimum : value <= minimum;
  if (!Number.isFinite(value) || belowMinimum || value > maximum) {
    throw new RangeError(
      `${name} must be finite and ${includeMinimum ? 'at least' : 'greater than'} ${minimum}, up to ${maximum}.`,
    );
  }
}

function cellRange(minimum: number, maximum: number): [number, number] {
  return [Math.floor(minimum + 0.5), Math.floor(maximum - EPSILON + 0.5)];
}

function collides(world: VoxelWorld, body: PlayerBody): boolean {
  const [minX, maxX] = cellRange(body.position.x - body.radius, body.position.x + body.radius);
  const [minY, maxY] = cellRange(body.position.y, body.position.y + body.height);
  const [minZ, maxZ] = cellRange(body.position.z - body.radius, body.position.z + body.radius);
  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const point = { x, y, z };
        if (!world.contains(point)) return true;
        const block = world.get(point);
        if (!isSolidVoxel(block)) continue;
        const top = y - 0.5 + voxelCollisionHeight(block);
        const bottom = y - 0.5;
        if (body.position.y + body.height > bottom + EPSILON && body.position.y < top - EPSILON) {
          return true;
        }
      }
    }
  }
  return false;
}

function supportHeight(
  world: VoxelWorld,
  position: VoxelPoint,
  radius: number,
  currentFeet: number,
  maxUp: number,
  maxDown: number,
): number | null {
  const [minX, maxX] = cellRange(position.x - radius, position.x + radius);
  const [minZ, maxZ] = cellRange(position.z - radius, position.z + radius);
  const minY = Math.floor(currentFeet - maxDown - 0.5);
  const maxY = Math.floor(currentFeet + maxUp + 0.5);
  let best: number | null = null;
  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const point = { x, y, z };
        if (!world.contains(point)) continue;
        const block = world.get(point);
        if (!isSolidVoxel(block)) continue;
        const top = y - 0.5 + voxelCollisionHeight(block);
        if (
          top <= currentFeet + maxUp + EPSILON &&
          top >= currentFeet - maxDown - EPSILON &&
          (best === null || top > best)
        ) {
          best = top;
        }
      }
    }
  }
  return best;
}

export function movePlayer(
  world: VoxelWorld,
  initialPosition: VoxelPoint,
  delta: Pick<VoxelPoint, 'x' | 'z'>,
  options: PlayerMotorOptions = {},
): PlayerMoveResult {
  const radius = options.radius ?? 0.32;
  const height = options.height ?? 1.7;
  const stepHeight = options.stepHeight ?? 1;
  const maxSubstep = options.maxSubstep ?? 0.2;
  const groundProbe = options.groundProbe ?? 1.1;
  if (
    ![initialPosition.x, initialPosition.y, initialPosition.z, delta.x, delta.z].every(
      Number.isFinite,
    )
  ) {
    throw new TypeError('Player movement values must be finite.');
  }
  assertFiniteRange(radius, 'radius', 0, 1);
  assertFiniteRange(height, 'height', 0, 3);
  assertFiniteRange(stepHeight, 'stepHeight', 0, 1, true);
  assertFiniteRange(maxSubstep, 'maxSubstep', 0, 1);
  assertFiniteRange(groundProbe, 'groundProbe', 0, 2, true);

  const position = { ...initialPosition };
  let stepped = false;
  let blockedX = false;
  let blockedZ = false;
  const substeps = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.z)) / maxSubstep),
  );
  if (substeps > MAX_MOTOR_SUBSTEPS) {
    throw new RangeError(`Movement exceeds the bounded ${MAX_MOTOR_SUBSTEPS}-substep sweep.`);
  }
  const stepDelta = { x: delta.x / substeps, z: delta.z / substeps };

  for (let index = 0; index < substeps; index += 1) {
    for (const axis of ['x', 'z'] as const) {
      if (Math.abs(stepDelta[axis]) <= EPSILON) continue;
      const candidate = { ...position, [axis]: position[axis] + stepDelta[axis] };
      const body: PlayerBody = { position: candidate, radius, height };
      if (!collides(world, body)) {
        position[axis] = candidate[axis];
        continue;
      }

      const raised = { ...candidate, y: position.y + stepHeight };
      const raisedBody: PlayerBody = { position: raised, radius, height };
      const raisedSupport = supportHeight(
        world,
        raised,
        radius,
        raised.y,
        stepHeight + EPSILON,
        stepHeight + groundProbe,
      );
      if (
        raisedSupport !== null &&
        raisedSupport > position.y + EPSILON &&
        raisedSupport <= position.y + stepHeight + EPSILON
      ) {
        raised.y = raisedSupport;
        if (!collides(world, raisedBody)) {
          position[axis] = raised[axis];
          position.y = raised.y;
          stepped = true;
          continue;
        }
      }
      if (axis === 'x') blockedX = true;
      else blockedZ = true;
    }

    const support = supportHeight(world, position, radius, position.y, EPSILON, groundProbe);
    if (support !== null) {
      const snapped = { ...position, y: support };
      if (!collides(world, { position: snapped, radius, height })) position.y = support;
    }
  }

  const grounded = supportHeight(world, position, radius, position.y, EPSILON, 0.08) !== null;
  return { position, stepped, blockedX, blockedZ, grounded };
}

export function playerBodyAt(
  position: VoxelPoint,
  options: Pick<PlayerMotorOptions, 'radius' | 'height'> = {},
): PlayerBody {
  return {
    position: { ...position },
    radius: options.radius ?? 0.32,
    height: options.height ?? 1.7,
  };
}
