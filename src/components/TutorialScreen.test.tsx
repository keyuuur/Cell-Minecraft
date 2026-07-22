import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIntegratedGameStore } from '../state/integratedGameStore';
import { TutorialScreen } from './TutorialScreen';

describe('controls tutorial', () => {
  beforeEach(() => {
    useIntegratedGameStore.getState().resetForNewStudent();
    useIntegratedGameStore
      .getState()
      .identifyStudent({ firstName: 'Test', lastInitial: 'S', period: 1 });
  });

  it('keeps the mission untimed until every control is practiced', async () => {
    const user = userEvent.setup();
    const onStartMission = vi.fn();
    render(<TutorialScreen onStartMission={onStartMission} />);
    const start = screen.getByRole('button', { name: 'Practice all controls to start' });
    expect(start).toBeDisabled();
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
    fireEvent.pointerDown(look, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(look, { pointerId: 1, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(look, { pointerId: 1 });
    await user.click(screen.getByRole('button', { name: 'Recenter' }));
    const enabledStart = screen.getByRole('button', { name: 'Start mission and timer' });
    expect(enabledStart).toBeEnabled();
    await user.click(enabledStart);
    expect(onStartMission).toHaveBeenCalledOnce();
    expect(useIntegratedGameStore.getState().activeElapsedMs).toBe(0);
  });

  it('stops movement and look practice when pointer capture is lost', () => {
    render(<TutorialScreen onStartMission={vi.fn()} />);
    const joystick = screen.getByLabelText('Practice movement joystick');
    const player = screen.getByLabelText('Practice player');
    Object.defineProperty(joystick, 'setPointerCapture', { value: vi.fn() });
    fireEvent.pointerDown(joystick, { pointerId: 7, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(joystick, { pointerId: 7, clientX: 90, clientY: 40 });
    const positionAfterDrag = player.getAttribute('style');
    fireEvent(joystick, new Event('lostpointercapture', { bubbles: true }));
    fireEvent.pointerMove(joystick, { pointerId: 7, clientX: 140, clientY: 10 });
    expect(player.getAttribute('style')).toBe(positionAfterDrag);

    const look = screen.getByLabelText('Drag here to practice looking');
    const horizon = screen.getByText('Drag here to look');
    Object.defineProperty(look, 'setPointerCapture', { value: vi.fn() });
    fireEvent.pointerDown(look, { pointerId: 8, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(look, { pointerId: 8, clientX: 40, clientY: 10 });
    const lookAfterDrag = horizon.getAttribute('style');
    fireEvent(look, new Event('lostpointercapture', { bubbles: true }));
    fireEvent.pointerMove(look, { pointerId: 8, clientX: 80, clientY: 10 });
    expect(horizon.getAttribute('style')).toBe(lookAfterDrag);
  });
});
