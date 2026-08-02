import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignalStrength } from './SignalStrength';
import type { SignalScore } from './types';

/**
 * Regression coverage for a real bug independent review of PR #60 found:
 * `signals.signal_score` is a nullable DB column by design (signals
 * generated before SIGNAL-SCORE-001 shipped were never scored, and
 * backfilling a synthetic value would fabricate evidence that doesn't
 * exist -- see db/schema.ts), so `GET /api/signals` genuinely returns
 * `signalScore: null` for the vast majority of existing rows. Rendering
 * that null through to `SignalStrength` without a guard crashed with
 * "Cannot read properties of null (reading 'totalScore')", which took
 * down the entire Signals page via the app's top-level ErrorBoundary --
 * not a degraded single card.
 */
const SAMPLE_SCORE: SignalScore = {
  totalScore: 72,
  direction: 'LONG',
  componentScores: {
    trendAgreement: 80,
    momentumAgreement: 70,
    trendStrengthConfirmation: 60,
    volatilitySuitability: 75,
    dataFreshness: 100,
    indicatorAvailability: 100,
  },
  indicatorsUsed: ['ema50', 'ema200'],
  indicatorsMissing: [],
  freshnessStatus: 'fresh',
  conflictingConditions: [],
  invalidationConditions: [],
  signalEngineVersion: 'v2',
  scoreModelVersion: 'v1',
  candleInterval: null,
  sourceDataFrom: '2026-08-01T00:00:00.000Z',
  sourceDataTo: '2026-08-01T01:00:00.000Z',
  explanation:
    'LONG signal strength reflects agreement across trend, momentum, trend-strength, and volatility indicators.',
};

describe('SignalStrength', () => {
  it('renders a real score without crashing', () => {
    render(<SignalStrength score={SAMPLE_SCORE} />);
    expect(screen.getByText(/Strong/)).toBeInTheDocument();
    expect(screen.getByText(/72\/100/)).toBeInTheDocument();
  });

  it('renders a "not available" state for a null score, instead of crashing (regression: PR #60 review)', () => {
    render(<SignalStrength score={null} />);
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.getByText(/generated before Signal strength scoring existed/i)).toBeInTheDocument();
  });
});
