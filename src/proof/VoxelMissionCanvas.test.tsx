import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoxelMissionCanvas } from './VoxelMissionCanvas';

interface SceneCallbacks {
  onContextLost: () => void;
  onSnapshot: (snapshot: unknown) => void;
}

interface SceneOptions {
  initialSnapshot?: unknown;
  reducedMotion?: boolean;
}

interface SceneInstance {
  action: ReturnType<typeof vi.fn>;
  clearInput: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  recenter: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  selectItem: ReturnType<typeof vi.fn>;
  setActionHeld: ReturnType<typeof vi.fn>;
  setJoystick: ReturnType<typeof vi.fn>;
  setPaused: ReturnType<typeof vi.fn>;
  toggleOverview: ReturnType<typeof vi.fn>;
}

const sceneHarness = vi.hoisted(() => ({
  calls: [] as Array<{
    callbacks: SceneCallbacks;
    instance: SceneInstance;
    options: SceneOptions;
  }>,
}));

vi.mock('../game/VoxelMissionScene', () => ({
  VoxelMissionScene: class MockVoxelMissionScene implements SceneInstance {
    action = vi.fn();
    clearInput = vi.fn();
    dispose = vi.fn();
    recenter = vi.fn();
    resize = vi.fn();
    selectItem = vi.fn();
    setActionHeld = vi.fn();
    setJoystick = vi.fn();
    setPaused = vi.fn();
    toggleOverview = vi.fn();

    constructor(_canvas: HTMLCanvasElement, callbacks: SceneCallbacks, options: SceneOptions) {
      sceneHarness.calls.push({ callbacks, instance: this, options });
    }
  },
}));

describe('VoxelMissionCanvas', () => {
  beforeEach(() => {
    sceneHarness.calls.splice(0);
  });

  it('keeps one scene controller while forwarding the latest callback identities', () => {
    const firstContextLoss = vi.fn();
    const firstReady = vi.fn();
    const firstSnapshot = vi.fn();
    const { rerender, unmount } = render(
      <VoxelMissionCanvas
        reducedMotion={false}
        onContextLost={firstContextLoss}
        onReady={firstReady}
        onSnapshot={firstSnapshot}
      />,
    );

    expect(sceneHarness.calls).toHaveLength(1);
    expect(sceneHarness.calls[0].options.reducedMotion).toBe(false);
    expect(firstReady).toHaveBeenCalledWith(sceneHarness.calls[0].instance);

    const latestContextLoss = vi.fn();
    const latestReady = vi.fn();
    const latestSnapshot = vi.fn();
    rerender(
      <VoxelMissionCanvas
        reducedMotion
        onContextLost={latestContextLoss}
        onReady={latestReady}
        onSnapshot={latestSnapshot}
      />,
    );

    expect(sceneHarness.calls).toHaveLength(1);
    expect(sceneHarness.calls[0].options.reducedMotion).toBe(false);

    act(() => {
      sceneHarness.calls[0].callbacks.onContextLost();
      sceneHarness.calls[0].callbacks.onSnapshot({ revision: 2 });
    });

    expect(firstContextLoss).not.toHaveBeenCalled();
    expect(firstSnapshot).not.toHaveBeenCalled();
    expect(latestContextLoss).toHaveBeenCalledOnce();
    expect(latestSnapshot).toHaveBeenCalledWith({ revision: 2 });

    unmount();
    expect(sceneHarness.calls[0].instance.dispose).toHaveBeenCalledOnce();
    expect(latestReady).toHaveBeenCalledWith(null);
  });
});
