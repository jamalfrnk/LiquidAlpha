import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileNavDrawer } from './MobileNavDrawer';

/**
 * Backfills automated coverage for behavior UI-RESP-001 verified manually
 * (CDP screenshots + a scripted focus/Escape check) before this test
 * harness existed.
 */
describe('MobileNavDrawer', () => {
  it('is closed until the trigger is clicked, then open, then closed again via the render-prop close callback', async () => {
    const user = userEvent.setup();
    render(<MobileNavDrawer>{(close) => <button onClick={close}>Close me</button>}</MobileNavDrawer>);

    expect(screen.queryByText('Close me')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    expect(screen.getByText('Close me')).toBeInTheDocument();

    await user.click(screen.getByText('Close me'));
    expect(screen.queryByText('Close me')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<MobileNavDrawer>{() => <div>Drawer content</div>}</MobileNavDrawer>);

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    expect(screen.getByText('Drawer content')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('Drawer content')).not.toBeInTheDocument();
  });
});
