import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { Node } from '@babylonjs/core/node';
import type { Scene } from '@babylonjs/core/scene.pure';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.pure';
import type { PlaceableStructureId } from '../types/game';

type PrefabContainer = Pick<AssetContainer, 'dispose' | 'instantiateModelsToScene'>;
const PREFAB_LOAD_TIMEOUT_MS = 15_000;

function disposeContainerSafely(container: PrefabContainer | null): void {
  if (!container) return;
  try {
    container.dispose();
  } catch {
    // Scene/engine teardown must continue even if Babylon rejects late disposal.
  }
}

export type PrefabContainerLoader = (
  id: PlaceableStructureId,
  scene: Scene,
) => Promise<PrefabContainer>;

async function waitForMaterialReadiness(scene: Scene, timeoutMs = 15_000): Promise<void> {
  const brdfTexture = scene.environmentBRDFTexture;
  if (!brdfTexture || brdfTexture.isReady()) return;
  const deadline = Date.now() + timeoutMs;
  while (!brdfTexture.isReady()) {
    if (scene.isDisposed) throw new Error('Prefab scene was disposed before materials were ready.');
    if (Date.now() >= deadline) throw new Error('Prefab material readiness timed out.');
    await new Promise<void>((resolve) => window.setTimeout(resolve, 16));
  }
}

async function loadLocalPrefab(id: PlaceableStructureId, scene: Scene): Promise<PrefabContainer> {
  await Promise.all([
    import('@babylonjs/loaders/glTF/glTFFileLoader'),
    import('@babylonjs/loaders/glTF/2.0/glTFLoader'),
  ]);
  const container = await LoadAssetContainerAsync(`/models/${id}.gltf`, scene);
  try {
    // Babylon intentionally keeps its shared BRDF texture outside the ordinary
    // scene texture collection, so Scene.whenReadyAsync() does not cover it.
    // Wait for that RGBD expansion explicitly before this load can be drained.
    await waitForMaterialReadiness(scene);
    return container;
  } catch (error) {
    disposeContainerSafely(container);
    throw error;
  }
}

export interface MissionPrefabAssetStats {
  enabled: boolean;
  requests: number;
  failures: number;
  pendingLoads: number;
  activeInstances: number;
}

/** Scene-lifetime cache for original local glTF models with procedural failure fallback. */
export class MissionPrefabAssetRegistry {
  private readonly containers = new Map<PlaceableStructureId, Promise<PrefabContainer | null>>();
  private disposed = false;
  private requests = 0;
  private failures = 0;
  private pendingLoads = 0;
  private activeInstances = 0;
  private disposePromise: Promise<void> | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly enabled: boolean,
    private readonly loader: PrefabContainerLoader = loadLocalPrefab,
  ) {}

  private load(id: PlaceableStructureId): Promise<PrefabContainer | null> {
    const cached = this.containers.get(id);
    if (cached) return cached;
    this.requests += 1;
    this.pendingLoads += 1;
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const requested = this.loader(id, this.scene)
      .then((container) => {
        if (timedOut || this.disposed) {
          disposeContainerSafely(container);
          return null;
        }
        return container;
      })
      .catch(() => {
        if (!timedOut) this.failures += 1;
        return null;
      });
    const timeout = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        this.failures += 1;
        resolve(null);
      }, PREFAB_LOAD_TIMEOUT_MS);
    });
    const pending = Promise.race([requested, timeout]).finally(() => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      this.pendingLoads = Math.max(0, this.pendingLoads - 1);
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
      pendingLoads: this.pendingLoads,
      activeInstances: this.activeInstances,
    };
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    const pendingLoads = [...this.containers.values()];
    this.containers.clear();
    this.activeInstances = 0;
    this.disposePromise = Promise.allSettled(pendingLoads).then((results) => {
      for (const result of results) {
        if (result.status === 'fulfilled') disposeContainerSafely(result.value);
      }
      this.pendingLoads = 0;
    });
    return this.disposePromise;
  }
}
