import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IdentifyScreen } from './IdentifyScreen';

describe('student identification', () => {
  it('collects only first name, last initial, and period', async () => {
    const user = userEvent.setup();
    const onIdentify = vi.fn();
    render(
      <IdentifyScreen
        resumableSave={null}
        onIdentify={onIdentify}
        onResume={vi.fn()}
        onClearData={vi.fn()}
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
});
