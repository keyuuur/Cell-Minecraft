import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { createInitialVoxelMissionSnapshot } from '../voxel/missionRuntime';
import type { ScoreBreakdown } from '../types/game';
import VoxelMissionApp from './VoxelMissionApp';

const canvasHarness = vi.hoisted(() => ({
  controller: {
    action: vi.fn(),
    clearInput: vi.fn(),
    recenter: vi.fn(),
    selectItem: vi.fn(),
    setActionHeld: vi.fn(),
    setJoystick: vi.fn(),
    setPaused: vi.fn(),
    toggleOverview: vi.fn(),
  },
}));

vi.mock('./VoxelMissionCanvas', async () => {
  const React = await import('react');
  return {
    VoxelMissionCanvas: ({
      onReady,
    }: {
      onReady: (controller: typeof canvasHarness.controller | null) => void;
    }) => {
      React.useEffect(() => {
        onReady(canvasHarness.controller);
        return () => onReady(null);
      }, [onReady]);
      return <canvas aria-label="Mock voxel mission canvas" tabIndex={0} />;
    },
  };
});

const zeroScore: ScoreBreakdown = {
  boundary: 0,
  requiredStructures: 0,
  placementContext: 0,
  activationFunctions: 0,
  droughtRecovery: 0,
  finalStability: 0,
  total: 0,
};

function renderClassroom(overrides: Partial<ComponentProps<typeof VoxelMissionApp>> = {}) {
  const onPauseChange = vi.fn();
  const result = render(
    <VoxelMissionApp
      mode="classroom"
      initialMission={createInitialVoxelMissionSnapshot()}
      controls="touch-only"
      accessibility={{
        largeText: false,
        highContrast: false,
        reducedMotion: false,
        muted: true,
      }}
      activeElapsedMs={0}
      scoreBreakdown={zeroScore}
      saveStatus={{ state: 'saved', storageRevision: 1, savedAt: 1 }}
      paused={false}
      onPauseChange={onPauseChange}
      {...overrides}
    />,
  );
  return { ...result, onPauseChange };
}

describe('VoxelMissionApp modal safety', () => {
  beforeEach(() => {
    for (const method of Object.values(canvasHarness.controller)) method.mockClear();
  });

  it('makes background controls inert, traps focus, and restores pause state for Grade', async () => {
    const user = userEvent.setup();
    const { onPauseChange } = renderClassroom();
    await user.click(screen.getByRole('button', { name: 'GRADE' }));

    const dialog = screen.getByRole('dialog', { name: '0%' });
    const root = document.querySelector('main.voxel-mission');
    if (!(root instanceof HTMLElement)) throw new Error('missing mission root');
    expect(root).toHaveAttribute('data-active-modal', 'grade');
    expect(screen.getByRole('button', { name: 'PAUSE', hidden: true })).toBeDisabled();
    expect(onPauseChange).toHaveBeenLastCalledWith(true);
    for (const child of Array.from(root.children)) {
      if (child !== dialog) expect((child as HTMLElement).inert).toBe(true);
    }

    const returnButton = screen.getByRole('button', { name: 'RETURN TO MISSION' });
    expect(returnButton).toHaveFocus();
    await user.tab();
    expect(returnButton).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '0%' })).not.toBeInTheDocument();
    expect(root).toHaveAttribute('data-active-modal', 'none');
    expect(onPauseChange).toHaveBeenLastCalledWith(false);
  });

  it('uses a non-dismissible finalization modal and then one isolated retry dialog', () => {
    const { rerender } = renderClassroom({ finalizing: true, paused: true });
    const root = document.querySelector('main.voxel-mission');
    if (!(root instanceof HTMLElement)) throw new Error('missing mission root');
    expect(screen.getByRole('dialog', { name: 'Confirming the local save' })).toBeInTheDocument();
    expect(root).toHaveAttribute('data-active-modal', 'finalizing');
    expect(screen.queryByRole('button', { name: /RESUME/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PAUSE', hidden: true })).toBeDisabled();

    rerender(
      <VoxelMissionApp
        mode="classroom"
        initialMission={createInitialVoxelMissionSnapshot()}
        controls="touch-only"
        accessibility={{
          largeText: false,
          highContrast: false,
          reducedMotion: false,
          muted: true,
        }}
        activeElapsedMs={0}
        scoreBreakdown={zeroScore}
        saveStatus={{ state: 'failed', code: 'INDEXED_DB_UNAVAILABLE' }}
        paused
        finalizationError="The immutable result was not confirmed."
      />,
    );

    expect(
      screen.getByRole('alertdialog', { name: 'Local finalization did not finish' }),
    ).toBeInTheDocument();
    expect(root).toHaveAttribute('data-active-modal', 'finalization-error');
    expect(
      screen.queryByRole('dialog', { name: 'Confirming the local save' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PAUSE', hidden: true })).toBeDisabled();
  });
});
