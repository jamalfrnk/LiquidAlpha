import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Router } from 'wouter';
import { Disclosure } from './Disclosure';

function renderWithRouter(ui: React.ReactElement) {
  return render(<Router>{ui}</Router>);
}

describe('Disclosure', () => {
  it('renders the compact primary copy with a link to the methodology page', () => {
    renderWithRouter(<Disclosure variant="compact" context="primary" />);
    expect(screen.getByText(/Paper trading only/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /learn more/i })).toHaveAttribute('href', '/methodology');
  });

  it('renders the detailed signals copy, distinct from the primary copy', () => {
    renderWithRouter(<Disclosure variant="detailed" context="signals" />);
    expect(screen.getByText(/Signal strength/)).toBeInTheDocument();
    expect(screen.getByText(/not a calibrated probability/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /read the full methodology/i })).toHaveAttribute('href', '/methodology');
  });

  it('renders distinct copy for every context, never sharing text across contexts', () => {
    const contexts = ['primary', 'signals', 'backtesting', 'paper-fills'] as const;
    const compactTexts = contexts.map((context) => {
      const { container, unmount } = renderWithRouter(<Disclosure variant="compact" context={context} />);
      const text = container.querySelector('p')?.textContent;
      unmount();
      return text;
    });
    expect(new Set(compactTexts).size).toBe(contexts.length);
  });

  it('never uses banned phrases in any context/variant combination', () => {
    const banned = [
      'guaranteed',
      'safe profit',
      'high-confidence winner',
      'best trade',
      'cannot lose',
      'proven return',
      'buy now',
      'sell now',
    ];
    const contexts = ['primary', 'signals', 'backtesting', 'paper-fills'] as const;
    for (const context of contexts) {
      for (const variant of ['compact', 'detailed'] as const) {
        const { container, unmount } = renderWithRouter(<Disclosure variant={variant} context={context} />);
        const text = container.textContent?.toLowerCase() ?? '';
        for (const phrase of banned) {
          expect(text).not.toContain(phrase);
        }
        unmount();
      }
    }
  });
});
