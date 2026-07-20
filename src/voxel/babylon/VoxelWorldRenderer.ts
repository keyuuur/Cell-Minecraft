import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.pure';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color.pure';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene.pure';
import { buildVoxelRegionGeometry } from '../regionGeometry';
import type { VoxelRegion } from '../types';
import type { VoxelWorld } from '../VoxelWorld';

const ATLAS_COLORS = [
  ['#000000', '#000000', '#000000'],
  ['#6ebc52', '#86cf65', '#3d7b3f'],
  ['#8a5a3b', '#a26e4b', '#5b3a2a'],
  ['#6e7b78', '#899691', '#424d4b'],
  ['#d5b878', '#ead094', '#9c8050'],
  ['#dfb65f', '#f0cf7a', '#bd8b3e'],
  ['#9a6740', '#bd8554', '#6b442d'],
  ['#438f55', '#60b66b', '#2d6943'],
  ['#79b85a', '#a9d17b', '#37653b'],
  ['#efad45', '#ffd27a', '#9a5b28'],
] as const;

export interface VoxelRendererStats {
  regionMeshCount: number;
  rebuiltRegionKeys: string[];
  totalRebuilds: number;
}

function createAtlasMaterial(scene: Scene): StandardMaterial {
  const atlas = new DynamicTexture(
    'voxel-foundation-atlas',
    { width: 128, height: 128 },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  const context = atlas.getContext();
  for (let tile = 0; tile < 16; tile += 1) {
    const column = tile % 4;
    const row = Math.floor(tile / 4);
    const colors = ATLAS_COLORS[tile] ?? ['#d36bd4', '#6d346d', '#f1a5f1'];
    context.fillStyle = colors[0];
    context.fillRect(column * 32, row * 32, 32, 32);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const pattern = (x * 5 + y * 7 + x * y + tile * 3) % 13;
        if (pattern !== 0 && pattern !== 4) continue;
        context.fillStyle = pattern === 0 ? colors[1] : colors[2];
        context.fillRect(column * 32 + x * 4, row * 32 + y * 4, 4, 4);
      }
    }
  }
  atlas.update(false);
  atlas.wrapU = Texture.CLAMP_ADDRESSMODE;
  atlas.wrapV = Texture.CLAMP_ADDRESSMODE;

  const material = new StandardMaterial('voxel-foundation-atlas-material', scene);
  material.diffuseTexture = atlas;
  material.specularColor = Color3.Black();
  material.backFaceCulling = true;
  return material;
}

export class VoxelWorldRenderer {
  private readonly material: StandardMaterial;
  private readonly meshes = new Map<string, Mesh>();
  private readonly emptyRebuiltRegions: string[] = [];
  private lastRebuilt: string[] = [];
  private rebuildCount = 0;

  constructor(
    private readonly scene: Scene,
    private readonly world: VoxelWorld,
  ) {
    this.material = createAtlasMaterial(scene);
  }

  flushDirtyRegions(limit = 2): string[] {
    if (!this.world.hasDirtyRegions()) {
      this.lastRebuilt = this.emptyRebuiltRegions;
      return this.emptyRebuiltRegions;
    }
    const dirty = this.world.consumeDirtyRegions(limit);
    this.lastRebuilt = dirty.map((region) => this.rebuildRegion(region));
    return [...this.lastRebuilt];
  }

  buildInitialWorld(): string[] {
    return this.flushDirtyRegions(Number.POSITIVE_INFINITY);
  }

  stats(): VoxelRendererStats {
    return {
      regionMeshCount: this.meshes.size,
      rebuiltRegionKeys: [...this.lastRebuilt],
      totalRebuilds: this.rebuildCount,
    };
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();
    this.material.dispose(true, true);
  }

  private rebuildRegion(region: VoxelRegion): string {
    const key = this.world.regionKey(region);
    let mesh = this.meshes.get(key);
    if (!mesh) {
      mesh = new Mesh(`voxel-region-${key}`, this.scene);
      mesh.material = this.material;
      mesh.isPickable = false;
      this.meshes.set(key, mesh);
    }
    const geometry = buildVoxelRegionGeometry(this.world, region);
    const vertexData = new VertexData();
    vertexData.positions = geometry.positions;
    vertexData.normals = geometry.normals;
    vertexData.indices = geometry.indices;
    vertexData.uvs = geometry.uvs;
    vertexData.applyToMesh(mesh, true);
    mesh.setEnabled(geometry.faceCount > 0);
    this.rebuildCount += 1;
    return key;
  }
}
