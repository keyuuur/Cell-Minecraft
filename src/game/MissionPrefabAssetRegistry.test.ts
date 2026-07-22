import { describe, expect, it, vi } from 'vitest';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import type { Scene } from '@babylonjs/core/scene.pure';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.pure';
import { MissionPrefabAssetRegistry } from './MissionPrefabAssetRegistry';

function nodeHarness() {
  return {
    parent: null,
    dispose: vi.fn(),
  };
}

function fallbackHarness() {
  return {
    setEnabled: vi.fn(),
  } as unknown as TransformNode;
}

function containerHarness(root = nodeHarness()) {
  const dispose = vi.fn();
  const instantiateModelsToScene = vi.fn(() => ({
    rootNodes: [root],
    skeletons: [],
    animationGroups: [],
    dispose: vi.fn(),
  }));
  return {
    root,
    dispose,
    instantiateModelsToScene,
    container: { dispose, instantiateModelsToScene } as unknown as AssetContainer,
  };
}

const scene = {} as Scene;
const parent = {} as TransformNode;

describe('mission prefab asset registry', () => {
  it('loads each asset once and replaces the procedural fallback only for a current visual', async () => {
    const loaded = containerHarness();
    const loader = vi.fn(async () => loaded.container);
    const registry = new MissionPrefabAssetRegistry(scene, true, loader);
    const firstFallback = fallbackHarness();
    expect(await registry.replaceFallback('nucleus', parent, firstFallback, () => true)).toBe(true);
    expect(firstFallback.setEnabled).toHaveBeenCalledWith(false);
    expect(loaded.root.parent).toBe(parent);

    const secondFallback = fallbackHarness();
    expect(await registry.replaceFallback('nucleus', parent, secondFallback, () => true)).toBe(
      true,
    );
    expect(loader).toHaveBeenCalledOnce();
    expect(registry.stats()).toMatchObject({
      requests: 1,
      failures: 0,
      pendingLoads: 0,
      activeInstances: 2,
    });
  });

  it('keeps the fallback when loading fails and never retries the failed asset', async () => {
    const loader = vi.fn(async () => {
      throw new Error('404');
    });
    const registry = new MissionPrefabAssetRegistry(scene, true, loader);
    const fallback = fallbackHarness();
    expect(await registry.replaceFallback('ribosomes', parent, fallback, () => true)).toBe(false);
    expect(await registry.replaceFallback('ribosomes', parent, fallback, () => true)).toBe(false);
    expect(loader).toHaveBeenCalledOnce();
    expect(fallback.setEnabled).not.toHaveBeenCalled();
    expect(registry.stats()).toMatchObject({
      requests: 1,
      failures: 1,
      pendingLoads: 0,
      activeInstances: 0,
    });
  });

  it('disposes late instances after removal instead of letting them reappear', async () => {
    let resolveLoad!: (container: ReturnType<typeof containerHarness>['container']) => void;
    const loaded = containerHarness();
    const loader = vi.fn(
      () =>
        new Promise<ReturnType<typeof containerHarness>['container']>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const registry = new MissionPrefabAssetRegistry(scene, true, loader);
    const fallback = fallbackHarness();
    let current = true;
    const replacement = registry.replaceFallback('mitochondria', parent, fallback, () => current);
    current = false;
    resolveLoad(loaded.container);
    expect(await replacement).toBe(false);
    expect(loaded.root.dispose).toHaveBeenCalledOnce();
    expect(fallback.setEnabled).not.toHaveBeenCalled();
  });

  it('disposes a delayed container after scene teardown without instantiating it', async () => {
    let resolveLoad!: (container: ReturnType<typeof containerHarness>['container']) => void;
    const loaded = containerHarness();
    const loader = vi.fn(
      () =>
        new Promise<ReturnType<typeof containerHarness>['container']>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const registry = new MissionPrefabAssetRegistry(scene, true, loader);
    const replacement = registry.replaceFallback(
      'chloroplasts',
      parent,
      fallbackHarness(),
      () => true,
    );
    registry.dispose();
    resolveLoad(loaded.container);

    expect(await replacement).toBe(false);
    await Promise.resolve();
    expect(loaded.dispose).toHaveBeenCalledOnce();
    expect(loaded.instantiateModelsToScene).not.toHaveBeenCalled();
    expect(registry.stats()).toMatchObject({ activeInstances: 0 });
  });

  it('makes Low mode issue zero model requests', async () => {
    const loader = vi.fn(async () => containerHarness().container);
    const registry = new MissionPrefabAssetRegistry(scene, false, loader);
    expect(
      await registry.replaceFallback('centralVacuole', parent, fallbackHarness(), () => true),
    ).toBe(false);
    expect(loader).not.toHaveBeenCalled();
    expect(registry.stats()).toMatchObject({ enabled: false, requests: 0 });
  });
});
