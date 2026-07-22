import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { Node } from '@babylonjs/core/node';
import type { Scene } from '@babylonjs/core/scene.pure';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.pure';
import type { PlaceableStructureId } from '../types/game';

type PrefabContainer = Pick<AssetContainer, 'dispose' | 'instantiateModelsToScene'>;

export type PrefabContainerLoader = (
  id: PlaceableStructureId,
  scene: Scene,
) => Promise<PrefabContainer>;

async function loadLocalPrefab(id: PlaceableStructureId, scene: Scene): Promise<PrefabContainer> {
  await Promise.all([
    import('@babylonjs/loaders/glTF/glTFFileLoader'),
    import('@babylonjs/loaders/glTF/2.0/glTFLoader'),
  ]);
  return LoadAssetContainerAsync(`/models/${id}.gltf`, scene);
}

export interface MissionPrefabAssetStats {
  enabled: boolean;
  requests: number;
  failures: number;
  activeInstances: number;
}

/** Scene-lifetime cache for original local glTF models with procedural failure fallback. */
export class MissionPrefabAssetRegistry {
  private readonly containers = new Map<PlaceableStructureId, Promise<PrefabContainer | null>>();
  private disposed = false;
  private requests = 0;
  private failures = 0;
  private activeInstances = 0;

  constructor(
    private readonly scene: Scene,
    private readonly enabled: boolean,
    private readonly loader: PrefabContainerLoader = loadLocalPrefab,
  ) {}

  private load(id: PlaceableStructureId): Promise<PrefabContainer | null> {
    const cached = this.containers.get(id);
    if (cached) return cached;
    this.requests += 1;
    const pending = this.loader(id, this.scene).catch(() => {
      this.failures += 1;
      return null;
    });
    this.containers.set(id, pending);
    return pending;
  }

  async replaceFallback(
    id: PlaceableStructureId,
    parent: TransformNode,
    fallback: TransformNode,
    isCurrent: () => boolean,
  ): Promise<boolean> {
    if (!this.enabled || this.disposed) return false;
    const container = await this.load(id);
    if (!container || this.disposed) return false;
    const entries = container.instantiateModelsToScene(
      (name) => `mission-asset-${id}-${name}`,
      false,
      { doNotInstantiate: true },
    );
    const roots = entries.rootNodes as Node[];
    if (!isCurrent() || this.disposed) {
      roots.forEach((root) => root.dispose(false, false));
      return false;
    }
    roots.forEach((root) => {
      root.parent = parent;
    });
    fallback.setEnabled(false);
    this.activeInstances += 1;
    return true;
  }

  releaseInstance(): void {
    this.activeInstances = Math.max(0, this.activeInstances - 1);
  }

  stats(): MissionPrefabAssetStats {
    return {
      enabled: this.enabled,
      requests: this.requests,
      failures: this.failures,
      activeInstances: this.activeInstances,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.containers.values()) {
      void pending.then((container) => container?.dispose());
    }
    this.containers.clear();
    this.activeInstances = 0;
  }
}
