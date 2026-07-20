import { isVoxelBlock, VoxelBlock } from './blocks';
import type { VoxelBounds, VoxelPoint, VoxelRegion } from './types';

export interface VoxelWorldOptions extends VoxelBounds {
  regionSize: VoxelPoint;
}

export interface VoxelWorldSnapshot {
  bounds: VoxelBounds;
  cells: number[];
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

export class VoxelWorld {
  readonly cells: Uint8Array;
  readonly bounds: VoxelBounds;
  readonly regionSize: VoxelPoint;
  private readonly dirtyRegions = new Set<string>();
  private revisionValue = 0;

  constructor(options: VoxelWorldOptions) {
    assertPositiveInteger(options.width, 'width');
    assertPositiveInteger(options.height, 'height');
    assertPositiveInteger(options.depth, 'depth');
    assertPositiveInteger(options.regionSize.x, 'regionSize.x');
    assertPositiveInteger(options.regionSize.y, 'regionSize.y');
    assertPositiveInteger(options.regionSize.z, 'regionSize.z');
    for (const [name, value] of Object.entries(options.min)) {
      if (!Number.isInteger(value)) throw new RangeError(`min.${name} must be an integer.`);
    }

    this.bounds = {
      min: { ...options.min },
      width: options.width,
      height: options.height,
      depth: options.depth,
    };
    this.regionSize = { ...options.regionSize };
    this.cells = new Uint8Array(options.width * options.height * options.depth);
    this.markAllRegionsDirty();
  }

  get revision(): number {
    return this.revisionValue;
  }

  get regionCounts(): VoxelPoint {
    return {
      x: Math.ceil(this.bounds.width / this.regionSize.x),
      y: Math.ceil(this.bounds.height / this.regionSize.y),
      z: Math.ceil(this.bounds.depth / this.regionSize.z),
    };
  }

  contains(point: VoxelPoint): boolean {
    return (
      Number.isInteger(point.x) &&
      Number.isInteger(point.y) &&
      Number.isInteger(point.z) &&
      point.x >= this.bounds.min.x &&
      point.y >= this.bounds.min.y &&
      point.z >= this.bounds.min.z &&
      point.x < this.bounds.min.x + this.bounds.width &&
      point.y < this.bounds.min.y + this.bounds.height &&
      point.z < this.bounds.min.z + this.bounds.depth
    );
  }

  get(point: VoxelPoint): VoxelBlock {
    return this.cells[this.index(point)] as VoxelBlock;
  }

  getOrAir(point: VoxelPoint): VoxelBlock {
    return this.contains(point) ? this.get(point) : VoxelBlock.Air;
  }

  set(point: VoxelPoint, block: VoxelBlock): boolean {
    if (!isVoxelBlock(block)) throw new RangeError(`Unknown voxel block id ${block}.`);
    const index = this.index(point);
    if (this.cells[index] === block) return false;
    this.cells[index] = block;
    this.revisionValue += 1;
    this.markCellAndBoundaryNeighborsDirty(point);
    return true;
  }

  fill(block: VoxelBlock): void {
    if (!isVoxelBlock(block)) throw new RangeError(`Unknown voxel block id ${block}.`);
    this.cells.fill(block);
    this.revisionValue += 1;
    this.markAllRegionsDirty();
  }

  forEachCell(visitor: (point: VoxelPoint, block: VoxelBlock) => void, region?: VoxelRegion): void {
    const start = region ? this.regionStart(region) : this.bounds.min;
    const end = region
      ? {
          x: Math.min(start.x + this.regionSize.x, this.bounds.min.x + this.bounds.width),
          y: Math.min(start.y + this.regionSize.y, this.bounds.min.y + this.bounds.height),
          z: Math.min(start.z + this.regionSize.z, this.bounds.min.z + this.bounds.depth),
        }
      : {
          x: this.bounds.min.x + this.bounds.width,
          y: this.bounds.min.y + this.bounds.height,
          z: this.bounds.min.z + this.bounds.depth,
        };

    for (let y = start.y; y < end.y; y += 1) {
      for (let z = start.z; z < end.z; z += 1) {
        for (let x = start.x; x < end.x; x += 1) {
          const point = { x, y, z };
          visitor(point, this.get(point));
        }
      }
    }
  }

  regionFor(point: VoxelPoint): VoxelRegion {
    if (!this.contains(point)) throw new RangeError('Voxel coordinate is outside the fixed world.');
    return {
      x: Math.floor((point.x - this.bounds.min.x) / this.regionSize.x),
      y: Math.floor((point.y - this.bounds.min.y) / this.regionSize.y),
      z: Math.floor((point.z - this.bounds.min.z) / this.regionSize.z),
    };
  }

  regionKey(region: VoxelRegion): string {
    return `${region.x}:${region.y}:${region.z}`;
  }

  parseRegionKey(key: string): VoxelRegion {
    const values = key.split(':').map(Number);
    if (values.length !== 3 || values.some((value) => !Number.isInteger(value))) {
      throw new Error(`Invalid region key "${key}".`);
    }
    return { x: values[0], y: values[1], z: values[2] };
  }

  consumeDirtyRegions(limit = Number.POSITIVE_INFINITY): VoxelRegion[] {
    const consumed: VoxelRegion[] = [];
    for (const key of this.dirtyRegions) {
      if (consumed.length >= limit) break;
      this.dirtyRegions.delete(key);
      consumed.push(this.parseRegionKey(key));
    }
    return consumed;
  }

  peekDirtyRegionKeys(): string[] {
    return [...this.dirtyRegions];
  }

  hasDirtyRegions(): boolean {
    return this.dirtyRegions.size > 0;
  }

  markAllRegionsDirty(): void {
    const counts = this.regionCounts;
    for (let y = 0; y < counts.y; y += 1) {
      for (let z = 0; z < counts.z; z += 1) {
        for (let x = 0; x < counts.x; x += 1) {
          this.markRegionDirty({ x, y, z });
        }
      }
    }
  }

  snapshot(): VoxelWorldSnapshot {
    return {
      bounds: {
        ...this.bounds,
        min: { ...this.bounds.min },
      },
      cells: Array.from(this.cells),
    };
  }

  private index(point: VoxelPoint): number {
    if (!this.contains(point)) throw new RangeError('Voxel coordinate is outside the fixed world.');
    const x = point.x - this.bounds.min.x;
    const y = point.y - this.bounds.min.y;
    const z = point.z - this.bounds.min.z;
    return x + this.bounds.width * (z + this.bounds.depth * y);
  }

  private regionStart(region: VoxelRegion): VoxelPoint {
    const counts = this.regionCounts;
    if (
      !Number.isInteger(region.x) ||
      !Number.isInteger(region.y) ||
      !Number.isInteger(region.z) ||
      region.x < 0 ||
      region.y < 0 ||
      region.z < 0 ||
      region.x >= counts.x ||
      region.y >= counts.y ||
      region.z >= counts.z
    ) {
      throw new RangeError('Region coordinate is outside the fixed world.');
    }
    return {
      x: this.bounds.min.x + region.x * this.regionSize.x,
      y: this.bounds.min.y + region.y * this.regionSize.y,
      z: this.bounds.min.z + region.z * this.regionSize.z,
    };
  }

  private markRegionDirty(region: VoxelRegion): void {
    const counts = this.regionCounts;
    if (
      region.x >= 0 &&
      region.y >= 0 &&
      region.z >= 0 &&
      region.x < counts.x &&
      region.y < counts.y &&
      region.z < counts.z
    ) {
      this.dirtyRegions.add(this.regionKey(region));
    }
  }

  private markCellAndBoundaryNeighborsDirty(point: VoxelPoint): void {
    const region = this.regionFor(point);
    this.markRegionDirty(region);
    const local = {
      x: point.x - this.bounds.min.x - region.x * this.regionSize.x,
      y: point.y - this.bounds.min.y - region.y * this.regionSize.y,
      z: point.z - this.bounds.min.z - region.z * this.regionSize.z,
    };
    for (const axis of ['x', 'y', 'z'] as const) {
      if (local[axis] === 0) {
        this.markRegionDirty({ ...region, [axis]: region[axis] - 1 });
      }
      if (
        local[axis] === this.regionSize[axis] - 1 ||
        point[axis] ===
          this.bounds.min[axis] +
            (axis === 'x'
              ? this.bounds.width
              : axis === 'y'
                ? this.bounds.height
                : this.bounds.depth) -
            1
      ) {
        this.markRegionDirty({ ...region, [axis]: region[axis] + 1 });
      }
    }
  }
}
