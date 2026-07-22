import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IdentifyScreen } from './IdentifyScreen';

describe('student identification', () => {
  it('collects only first name, last initial, and period', async () => {
    const user = userEvent.setup();
    const onIdentify = vi.fn();
    render(
      <IdentifyScreen
        persistenceReady
        resumeAvailable={false}
        newStudentHandoffRequired={false}
        onIdentify={onIdentify}
        onResume={vi.fn()}
        onStartFresh={vi.fn()}
        onConfirmNewStudentHandoff={vi.fn()}
        onRequestResetCounts={vi.fn().mockResolvedValue({
          attempts: 0,
          queued: 0,
          receipts: 0,
          legacySaves: 0,
        })}
        onTeacherReset={vi.fn()}
        teacherResetConfirmation="DELETE ALL LOCAL DATA"
      />,
    );
    const continueButton = screen.getByRole('button', { name: 'Continue to controls' });
    expect(continueButton).toBeDisabled();
    await user.type(screen.getByLabelText('First name'), 'Ari');
    await user.type(screen.getByLabelText('Last initial'), 'p');
    await user.selectOptions(screen.getByLabelText('Class period'), '3');
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);
    expect(onIdentify).toHaveBeenCalledWith({ firstName: 'Ari', lastInitial: 'P', period: 3 });
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it('requires an explicit privacy-neutral handoff without revealing prior metadata', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <IdentifyScreen
        persistenceReady
        resumeAvailable={false}
        newStudentHandoffRequired
        onIdentify={vi.fn()}
        onResume={vi.fn()}
        onStartFresh={vi.fn()}
        onConfirmNewStudentHandoff={onConfirm}
        onRequestResetCounts={vi.fn().mockResolvedValue({
          attempts: 1,
          queued: 1,
          receipts: 0,
          legacySaves: 0,
        })}
        onTeacherReset={vi.fn()}
        teacherResetConfirmation="DELETE ALL LOCAL DATA"
      />,
    );

    expect(
      screen.getByText(/A prior student session must be protected before this student begins/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/attempt-student/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Protect prior work and continue' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('locks the captured identity while a resume decision is pending', async () => {
    const user = userEvent.setup();
    const onResume = vi.fn().mockResolvedValue(undefined);
    const props = {
      persistenceReady: true,
      newStudentHandoffRequired: false,
      onIdentify: vi.fn(),
      onResume,
      onStartFresh: vi.fn(),
      onConfirmNewStudentHandoff: vi.fn(),
      onRequestResetCounts: vi.fn().mockResolvedValue({
        attempts: 1,
        queued: 0,
        receipts: 0,
        legacySaves: 0,
      }),
      onTeacherReset: vi.fn(),
      teacherResetConfirmation: 'DELETE ALL LOCAL DATA',
    };
    const { rerender } = render(<IdentifyScreen {...props} resumeAvailable={false} />);

    const firstName = screen.getByLabelText('First name');
    const lastInitial = screen.getByLabelText('Last initial');
    const period = screen.getByLabelText('Class period');
    await user.type(firstName, 'Ari');
    await user.type(lastInitial, 'P');
    await user.selectOptions(period, '3');

    rerender(<IdentifyScreen {...props} resumeAvailable />);
    expect(firstName).toBeDisabled();
    expect(lastInitial).toBeDisabled();
    expect(period).toBeDisabled();
    expect(firstName).toHaveValue('Ari');
    await user.click(screen.getByRole('button', { name: 'Resume matching attempt' }));
    expect(onResume).toHaveBeenCalledOnce();
  });

  it('locks the captured identity while the saved-work check is pending', async () => {
    const user = userEvent.setup();
    let finishCheck: () => void = () => undefined;
    const onIdentify = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCheck = resolve;
        }),
    );
    render(
      <IdentifyScreen
        persistenceReady
        resumeAvailable={false}
        newStudentHandoffRequired={false}
        onIdentify={onIdentify}
        onResume={vi.fn()}
        onStartFresh={vi.fn()}
        onConfirmNewStudentHandoff={vi.fn()}
        onRequestResetCounts={vi.fn().mockResolvedValue({
          attempts: 0,
          queued: 0,
          receipts: 0,
          legacySaves: 0,
        })}
        onTeacherReset={vi.fn()}
        teacherResetConfirmation="DELETE ALL LOCAL DATA"
      />,
    );

    const firstName = screen.getByLabelText('First name');
    const lastInitial = screen.getByLabelText('Last initial');
    const period = screen.getByLabelText('Class period');
    await user.type(firstName, 'Ari');
    await user.type(lastInitial, 'P');
    await user.selectOptions(period, '3');
    await user.click(screen.getByRole('button', { name: 'Continue to controls' }));

    expect(onIdentify).toHaveBeenCalledWith({ firstName: 'Ari', lastInitial: 'P', period: 3 });
    expect(firstName).toBeDisabled();
    expect(lastInitial).toBeDisabled();
    expect(period).toBeDisabled();
    await user.type(firstName, 'Bea');
    expect(firstName).toHaveValue('Ari');
    expect(lastInitial).toHaveValue('P');
    expect(period).toHaveValue('3');

    await act(async () => finishCheck());
    await waitFor(() => expect(firstName).toBeEnabled());
  });

  it('locks the captured identity while a privacy-neutral handoff is pending', async () => {
    const user = userEvent.setup();
    const props = {
      persistenceReady: true,
      resumeAvailable: false,
      onIdentify: vi.fn(),
      onResume: vi.fn(),
      onStartFresh: vi.fn(),
      onConfirmNewStudentHandoff: vi.fn().mockResolvedValue(undefined),
      onRequestResetCounts: vi.fn().mockResolvedValue({
        attempts: 1,
        queued: 1,
        receipts: 0,
        legacySaves: 0,
      }),
      onTeacherReset: vi.fn(),
      teacherResetConfirmation: 'DELETE ALL LOCAL DATA',
    };
    const { rerender } = render(<IdentifyScreen {...props} newStudentHandoffRequired={false} />);

    const firstName = screen.getByLabelText('First name');
    const lastInitial = screen.getByLabelText('Last initial');
    const period = screen.getByLabelText('Class period');
    await user.type(firstName, 'Bea');
    await user.type(lastInitial, 'Q');
    await user.selectOptions(period, '6');

    rerender(<IdentifyScreen {...props} newStudentHandoffRequired />);
    expect(firstName).toBeDisabled();
    expect(lastInitial).toBeDisabled();
    expect(period).toBeDisabled();
    expect(firstName).toHaveValue('Bea');
    await user.click(screen.getByRole('button', { name: 'Protect prior work and continue' }));
    expect(props.onConfirmNewStudentHandoff).toHaveBeenCalledOnce();
  });
});
