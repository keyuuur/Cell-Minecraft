import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AccessibilitySettings,
  ControlProfile,
  SaveEnvelopeV3,
  ScoreBreakdown,
  VoxelMissionSnapshotV1,
} from './types/game';

interface MockMissionProps {
  mode?: string;
  initialMission: VoxelMissionSnapshotV1;
  controls: ControlProfile;
  accessibility: AccessibilitySettings;
  scoreBreakdown: ScoreBreakdown;
  finalizationError?: string;
  finalizing?: boolean;
  onMissionSnapshot: (mission: VoxelMissionSnapshotV1) => void;
  onSubmit: (outcome: 'complete' | 'early') => Promise<void> | void;
  onRetryFinalization?: () => Promise<void> | void;
}

const missionHarness = vi.hoisted(() => ({ props: null as MockMissionProps | null }));

const PERSISTENCE_READY_TIMEOUT_MS = 10_000;

function findContinueButton() {
  return screen.findByRole(
    'button',
    { name: 'Continue to controls' },
    { timeout: PERSISTENCE_READY_TIMEOUT_MS },
  );
}

vi.mock('./proof/VoxelMissionApp', async () => {
  const React = await import('react');
  const { createCompletedVoxelMissionFixture } =
    await import('./contracts/missionContracts.fixtures');
  return {
    default: function MockVoxelMission(props: MockMissionProps) {
      missionHarness.props = props;
      const [crashed, setCrashed] = React.useState(false);
      if (crashed) throw new Error('MOCK_SCENE_CRASH');
      return (
        <main>
          <h1>Mock voxel mission</h1>
          <p>Checkpoint {props.scoreBreakdown.total}</p>
          <p>Player {props.initialMission.player.x}</p>
          {props.finalizing ? <p>Finalization pending</p> : null}
          <button
            type="button"
            onClick={() => {
              const stable = createCompletedVoxelMissionFixture();
              stable.completion = {
                completionLocked: false,
                completed: false,
                practice: false,
              };
              props.onMissionSnapshot(stable);
            }}
          >
            Emit stable recovery
          </button>
          <button type="button" onClick={() => props.onSubmit('complete')}>
            Submit final result
          </button>
          <button type="button" onClick={() => setCrashed(true)}>
            Crash 3D scene
          </button>
          {props.finalizationError ? (
            <section role="alertdialog">
              <h2>Local finalization did not finish</h2>
              <p>{props.finalizationError}</p>
              <button type="button" onClick={props.onRetryFinalization}>
                Retry local finalization
              </button>
            </section>
          ) : null}
        </main>
      );
    },
  };
});

import App from './App';
import {
  SaveCoordinator,
  beginAttemptV3,
  loadAttemptV3,
  localDataCounts,
  queuedSubmissionsV2,
} from './persistence/v3';
import { CELL_DATABASE_NAME, closeCellGameDatabase } from './persistence/schema';
import { createSaveEnvelopeV3Fixture } from './contracts/missionContracts.fixtures';
import { useIntegratedGameStore } from './state/integratedGameStore';

async function completeTutorial(user: ReturnType<typeof userEvent.setup>) {
  const joystick = screen.getByLabelText('Practice movement joystick');
  Object.defineProperty(joystick, 'setPointerCapture', { value: vi.fn() });
  fireEvent.pointerDown(joystick, { pointerId: 1, clientX: 50, clientY: 50 });
  fireEvent.pointerMove(joystick, { pointerId: 1, clientX: 100, clientY: 34 });
  fireEvent.pointerUp(joystick, { pointerId: 1 });
  await user.click(screen.getByRole('button', { name: 'Hold tool to mine' }));
  await user.click(screen.getByRole('button', { name: 'Collect' }));
  fireEvent.pointerDown(joystick, { pointerId: 2, clientX: 50, clientY: 50 });
  fireEvent.pointerMove(joystick, { pointerId: 2, clientX: 132, clientY: -30 });
  fireEvent.pointerUp(joystick, { pointerId: 2 });
  await user.click(screen.getByRole('button', { name: 'Place' }));
  await user.click(screen.getByRole('button', { name: 'Inspect' }));
  const look = screen.getByLabelText('Drag here to practice looking');
  Object.defineProperty(look, 'setPointerCapture', { value: vi.fn() });
  fireEvent.pointerDown(look, { pointerId: 3, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(look, { pointerId: 3, clientX: 40, clientY: 10 });
  fireEvent.pointerUp(look, { pointerId: 3 });
  await user.click(screen.getByRole('button', { name: 'Recenter' }));
}

async function startClassroomMission(
  user: ReturnType<typeof userEvent.setup>,
  student = { firstName: 'Ari', lastInitial: 'p', period: '3' },
) {
  const continueButton = await findContinueButton();
  await user.type(screen.getByLabelText('First name'), student.firstName);
  await user.type(screen.getByLabelText('Last initial'), student.lastInitial);
  await user.selectOptions(screen.getByLabelText('Class period'), student.period);
  await waitFor(() => expect(continueButton).toBeEnabled());
  await user.click(continueButton);
  await completeTutorial(user);
  await user.click(screen.getByRole('button', { name: 'Start mission and timer' }));
  await screen.findByRole('heading', { name: 'Mock voxel mission' });
}

async function reachLockedResults(user: ReturnType<typeof userEvent.setup>) {
  await startClassroomMission(user);
  await user.click(screen.getByRole('button', { name: 'Emit stable recovery' }));
  await screen.findByText('Checkpoint 95');
  await user.click(screen.getByRole('button', { name: 'Submit final result' }));
  await screen.findByRole('heading', { name: 'Stable cell achieved' });
}

describe('integrated classroom route', { timeout: 20_000 }, () => {
  beforeEach(async () => {
    closeCellGameDatabase();
    await deleteDB(CELL_DATABASE_NAME);
    useIntegratedGameStore.getState().resetForNewStudent();
    missionHarness.props = null;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    closeCellGameDatabase();
    await deleteDB(CELL_DATABASE_NAME);
  });

  it('keeps identity private, starts only after tutorial, and exposes Results after one durable V2 queue', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByText(/saved score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/attempt-/i)).not.toBeInTheDocument();
    const continueButton = await findContinueButton();
    expect(continueButton).toBeDisabled();
    await user.type(screen.getByLabelText('First name'), 'Ari');
    await user.type(screen.getByLabelText('Last initial'), 'p');
    await user.selectOptions(screen.getByLabelText('Class period'), '3');
    await waitFor(() => expect(continueButton).toBeEnabled());
    await user.click(continueButton);

    await screen.findByRole('heading', { name: 'Choose and practice your controls' });
    expect(useIntegratedGameStore.getState().activeElapsedMs).toBe(0);
    await completeTutorial(user);
    await user.click(screen.getByRole('button', { name: 'Start mission and timer' }));

    await screen.findByRole('heading', { name: 'Mock voxel mission' });
    await user.click(screen.getByRole('button', { name: 'Emit stable recovery' }));
    await screen.findByText('Checkpoint 95');
    await user.click(screen.getByRole('button', { name: 'Submit final result' }));

    await screen.findByRole('heading', { name: 'Stable cell achieved' });
    expect(screen.getByRole('heading', { name: '100%' })).toBeInTheDocument();
    await expect(queuedSubmissionsV2()).resolves.toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('offers resume only after a matching identity and mounts the mission with the saved player state', async () => {
    const saved = createSaveEnvelopeV3Fixture();
    saved.voxelMission = {
      ...saved.voxelMission,
      revision: saved.voxelMission.revision + 1,
      player: { ...saved.voxelMission.player, x: 1.5, yaw: 0.8, pitch: 0.2 },
    };
    await beginAttemptV3(saved);
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByText(/matching saved attempt/i)).not.toBeInTheDocument();
    await findContinueButton();
    await user.type(screen.getByLabelText('First name'), saved.student.firstName);
    await user.type(screen.getByLabelText('Last initial'), saved.student.lastInitial);
    await user.selectOptions(screen.getByLabelText('Class period'), String(saved.student.period));
    await user.click(screen.getByRole('button', { name: 'Continue to controls' }));

    await screen.findByText('A matching saved attempt is available on this device.');
    expect(screen.queryByText(saved.attemptId)).not.toBeInTheDocument();
    expect(screen.queryByText(saved.sessionId)).not.toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toBeDisabled();
    expect(screen.getByLabelText('Last initial')).toBeDisabled();
    expect(screen.getByLabelText('Class period')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Resume matching attempt' }));
    await screen.findByRole('heading', { name: 'Mock voxel mission' });
    expect(screen.getByText('Player 1.5')).toBeInTheDocument();
  });

  it('keeps Results unavailable when atomic finalization fails and succeeds on an explicit retry', async () => {
    const originalFinalize = SaveCoordinator.prototype.finalizeAndQueue;
    vi.spyOn(SaveCoordinator.prototype, 'finalizeAndQueue')
      .mockRejectedValueOnce(new Error('INDEXED_DB_UNAVAILABLE'))
      .mockImplementation(originalFinalize);
    const user = userEvent.setup();
    render(<App />);
    await findContinueButton();
    await user.type(screen.getByLabelText('First name'), 'Ari');
    await user.type(screen.getByLabelText('Last initial'), 'p');
    await user.selectOptions(screen.getByLabelText('Class period'), '3');
    await user.click(screen.getByRole('button', { name: 'Continue to controls' }));
    await completeTutorial(user);
    await user.click(screen.getByRole('button', { name: 'Start mission and timer' }));
    await screen.findByRole('heading', { name: 'Mock voxel mission' });
    await user.click(screen.getByRole('button', { name: 'Emit stable recovery' }));
    await screen.findByText('Checkpoint 95');
    if (!missionHarness.props) throw new Error('mock mission did not mount');
    await act(async () => {
      await missionHarness.props?.onSubmit('complete');
    });

    await screen.findByRole('heading', { name: 'Local finalization did not finish' });
    expect(screen.queryByRole('heading', { name: 'Stable cell achieved' })).not.toBeInTheDocument();
    await expect(queuedSubmissionsV2()).resolves.toHaveLength(0);
    await act(async () => {
      await missionHarness.props?.onRetryFinalization?.();
    });
    await screen.findByRole('heading', { name: 'Stable cell achieved' });
    await expect(queuedSubmissionsV2()).resolves.toHaveLength(1);
  });

  it('protects Student A work through a privacy-neutral handoff before Student B starts', async () => {
    const saved = createSaveEnvelopeV3Fixture();
    await beginAttemptV3(saved);
    const user = userEvent.setup();
    render(<App />);

    const continueButton = await findContinueButton();
    await user.type(screen.getByLabelText('First name'), 'Student');
    await user.type(screen.getByLabelText('Last initial'), 'B');
    await user.selectOptions(screen.getByLabelText('Class period'), '2');
    await waitFor(() => expect(continueButton).toBeEnabled());
    await user.click(continueButton);

    await screen.findByText(/A prior student session must be protected before this student begins/);
    expect(screen.queryByText(saved.attemptId)).not.toBeInTheDocument();
    expect(screen.queryByText(saved.student.firstName, { exact: true })).not.toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toBeDisabled();
    expect(screen.getByLabelText('Last initial')).toBeDisabled();
    expect(screen.getByLabelText('Class period')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Protect prior work and continue' }));
    await screen.findByRole('heading', { name: 'Choose and practice your controls' });
    expect((await loadAttemptV3(saved.attemptId))?.resumeVisible).toBe(false);

    await completeTutorial(user);
    await user.click(screen.getByRole('button', { name: 'Start mission and timer' }));
    await screen.findByRole('heading', { name: 'Mock voxel mission' });
  });

  it('reopens the same committed attempt when coordinator creation fails after initial Start', async () => {
    const originalCreate = SaveCoordinator.create;
    const createSpy = vi
      .spyOn(SaveCoordinator, 'create')
      .mockRejectedValueOnce(new Error('COORDINATOR_OPEN_FAILED'))
      .mockImplementation((attemptId, onStatus) => originalCreate(attemptId, onStatus));
    const user = userEvent.setup();
    render(<App />);

    const continueButton = await findContinueButton();
    await user.type(screen.getByLabelText('First name'), 'Ari');
    await user.type(screen.getByLabelText('Last initial'), 'P');
    await user.selectOptions(screen.getByLabelText('Class period'), '3');
    await waitFor(() => expect(continueButton).toBeEnabled());
    await user.click(continueButton);
    await completeTutorial(user);
    await user.click(screen.getByRole('button', { name: 'Start mission and timer' }));

    await screen.findByText(/attempt is safely saved but could not open/i);
    expect((await localDataCounts()).attempts).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Start mission and timer' }));
    await screen.findByRole('heading', { name: 'Mock voxel mission' });
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect((await localDataCounts()).attempts).toBe(1);
  });

  it('recovers the same committed attempt after reload interrupts coordinator creation', async () => {
    const originalCreate = SaveCoordinator.create;
    const createSpy = vi
      .spyOn(SaveCoordinator, 'create')
      .mockRejectedValueOnce(new Error('COORDINATOR_OPEN_FAILED'))
      .mockImplementation((attemptId, onStatus) => originalCreate(attemptId, onStatus));
    const user = userEvent.setup();
    const firstRender = render(<App />);

    const continueButton = await findContinueButton();
    await user.type(screen.getByLabelText('First name'), 'Ari');
    await user.type(screen.getByLabelText('Last initial'), 'P');
    await user.selectOptions(screen.getByLabelText('Class period'), '3');
    await waitFor(() => expect(continueButton).toBeEnabled());
    await user.click(continueButton);
    await completeTutorial(user);
    await user.click(screen.getByRole('button', { name: 'Start mission and timer' }));
    await screen.findByText(/attempt is safely saved but could not open/i);
    expect((await localDataCounts()).attempts).toBe(1);

    firstRender.unmount();
    useIntegratedGameStore.getState().resetForNewStudent();
    render(<App />);
    const reloadContinue = await findContinueButton();
    await user.type(screen.getByLabelText('First name'), 'Ari');
    await user.type(screen.getByLabelText('Last initial'), 'P');
    await user.selectOptions(screen.getByLabelText('Class period'), '3');
    await waitFor(() => expect(reloadContinue).toBeEnabled());
    await user.click(reloadContinue);
    await screen.findByText('A matching saved attempt is available on this device.');
    await user.click(screen.getByRole('button', { name: 'Resume matching attempt' }));

    await screen.findByRole('heading', { name: 'Mock voxel mission' });
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect((await localDataCounts()).attempts).toBe(1);
  });

  it('blocks cross-actions and retries the same committed Fresh attempt after coordinator failure', async () => {
    const user = userEvent.setup();
    render(<App />);
    await reachLockedResults(user);
    const originalCreate = SaveCoordinator.create;
    const createSpy = vi
      .spyOn(SaveCoordinator, 'create')
      .mockRejectedValueOnce(new Error('COORDINATOR_OPEN_FAILED'))
      .mockImplementation((attemptId, onStatus) => originalCreate(attemptId, onStatus));

    await user.click(screen.getByRole('button', { name: 'Start a fresh graded attempt' }));
    await screen.findByText(/fresh graded attempt could not be opened/i);
    expect(screen.getByRole('button', { name: 'Continue ungraded practice' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New student' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry opening saved attempt' })).toBeEnabled();
    expect((await localDataCounts()).attempts).toBe(2);

    await user.click(screen.getByRole('button', { name: 'Retry opening saved attempt' }));
    await screen.findByRole('heading', { name: 'Mock voxel mission' });
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect((await localDataCounts()).attempts).toBe(2);
  });

  it.each([
    ['Start a fresh graded attempt', /fresh graded attempt could not be opened/i],
    ['Continue ungraded practice', /Ungraded practice could not be prepared/i],
    ['New student', /Prior local work could not be protected/i],
  ])('keeps the immutable result visible when %s storage fails', async (buttonName, message) => {
    const user = userEvent.setup();
    render(<App />);
    await reachLockedResults(user);
    closeCellGameDatabase();
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('INDEXED_DB_UNAVAILABLE');
    });

    await user.click(screen.getByRole('button', { name: buttonName }));
    await screen.findByText(message);
    expect(screen.getByRole('heading', { name: 'Stable cell achieved' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a fresh graded attempt' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Continue ungraded practice' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'New student' })).toBeEnabled();
  });

  it('attempts timeout finalization once and waits for an explicit retry after failure', async () => {
    const user = userEvent.setup();
    render(<App />);
    await startClassroomMission(user);
    const finalizeSpy = vi
      .spyOn(SaveCoordinator.prototype, 'finalizeAndQueue')
      .mockRejectedValue(new Error('INDEXED_DB_UNAVAILABLE'));

    act(() => {
      useIntegratedGameStore.getState().tickActiveTime(15 * 60 * 1000);
    });
    await screen.findByRole('heading', { name: 'Local finalization did not finish' });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 120)));
    expect(finalizeSpy).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Retry local finalization' }));
    await waitFor(() => expect(finalizeSpy).toHaveBeenCalledTimes(2));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 120)));
    expect(finalizeSpy).toHaveBeenCalledTimes(2);
    await expect(queuedSubmissionsV2()).resolves.toHaveLength(0);
  });

  it('freezes active time and cached mission state while finalization is pending', async () => {
    const user = userEvent.setup();
    render(<App />);
    await startClassroomMission(user);
    await user.click(screen.getByRole('button', { name: 'Emit stable recovery' }));
    await screen.findByText('Checkpoint 95');
    let rejectFinalization: (reason?: unknown) => void = () => undefined;
    const pending = new Promise<SaveEnvelopeV3>((_resolve, reject) => {
      rejectFinalization = reject;
    });
    vi.spyOn(SaveCoordinator.prototype, 'finalizeAndQueue').mockReturnValue(pending);
    const revision = useIntegratedGameStore.getState().voxelMission.revision;

    await user.click(screen.getByRole('button', { name: 'Submit final result' }));
    await screen.findByText('Finalization pending');
    expect(useIntegratedGameStore.getState().paused).toBe(true);
    expect(useIntegratedGameStore.getState().finalizing).toBe(true);
    const frozenAt = useIntegratedGameStore.getState().activeElapsedMs;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 650)));
    expect(useIntegratedGameStore.getState().activeElapsedMs).toBe(frozenAt);
    expect(useIntegratedGameStore.getState().voxelMission.revision).toBe(revision);

    await act(async () => rejectFinalization(new Error('INDEXED_DB_UNAVAILABLE')));
    await screen.findByRole('heading', { name: 'Local finalization did not finish' });
  });

  it('pauses the parent timer and saves when the 3D subtree throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<App />);
    await startClassroomMission(user);
    await user.click(screen.getByRole('button', { name: 'Crash 3D scene' }));
    await screen.findByRole('heading', { name: 'The 3D scene paused safely' });
    await waitFor(() => expect(useIntegratedGameStore.getState().paused).toBe(true));
    const frozenAt = useIntegratedGameStore.getState().activeElapsedMs;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 650)));
    expect(useIntegratedGameStore.getState().activeElapsedMs).toBe(frozenAt);
  });
});
