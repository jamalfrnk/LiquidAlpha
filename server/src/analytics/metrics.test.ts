import { describe, it, expect } from 'vitest';
import { computePerformance, type ClosedTrade } from './metrics';

function trade(realizedPnl: number, daysAgo: number, notional = 1000): ClosedTrade {
  return { realizedPnl, notional, closedAt: new Date(Date.now() - daysAgo * 86_400_000) };
}

function trades(n: number, pnlFn: (i: number) => number = () => 10): ClosedTrade[] {
  return Array.from({ length: n }, (_, i) => trade(pnlFn(i), n - i));
}

describe('computePerformance', () => {
  it('returns insufficient with no metrics for zero trades', () => {
    const result = computePerformance([]);
    expect(result).toEqual({ tier: 'insufficient', sampleSize: 0, windowStart: null, windowEnd: null, mode: 'paper', metrics: null });
  });

  describe('the preliminary-tier boundary (10 trades)', () => {
    it('stays insufficient at 9 trades (one below the boundary)', () => {
      const result = computePerformance(trades(9));
      expect(result.tier).toBe('insufficient');
      expect(result.metrics).toBeNull();
    });

    it('becomes preliminary at exactly 10 trades', () => {
      const result = computePerformance(trades(10));
      expect(result.tier).toBe('preliminary');
      expect(result.metrics).not.toBeNull();
      if (result.tier === 'preliminary') {
        // Preliminary metrics must never include the sample-size-sensitive fields.
        expect(result.metrics).not.toHaveProperty('riskAdjustedReturnRatio');
        expect(result.metrics).not.toHaveProperty('maxDrawdown');
      }
    });

    it('is still preliminary at 11 trades (one above the boundary)', () => {
      expect(computePerformance(trades(11)).tier).toBe('preliminary');
    });
  });

  describe('the full-tier boundary (30 trades)', () => {
    it('stays preliminary at 29 trades (one below the boundary)', () => {
      expect(computePerformance(trades(29)).tier).toBe('preliminary');
    });

    it('becomes full at exactly 30 trades', () => {
      // Varied (not uniform) PnL -- a uniform series legitimately produces a
      // null ratio (zero variance), which isn't what this test is checking.
      const result = computePerformance(trades(30, (i) => (i % 2 === 0 ? 10 : -3)));
      expect(result.tier).toBe('full');
      if (result.tier === 'full') {
        expect(result.metrics.riskAdjustedReturnRatio).toBeTypeOf('number');
        expect(result.metrics.maxDrawdown).toBeTypeOf('number');
      }
    });

    it('is still full at 31 trades (one above the boundary)', () => {
      expect(computePerformance(trades(31)).tier).toBe('full');
    });
  });

  it('computes win rate and total/average PnL correctly at the preliminary tier', () => {
    // 10 trades: 6 winners of +10, 4 losers of -5 -> win rate 60%, total 60-20=40, avg 4.
    const data = trades(10, (i) => (i < 6 ? 10 : -5));
    const result = computePerformance(data);
    expect(result.tier).toBe('preliminary');
    if (result.tier === 'preliminary') {
      expect(result.metrics.winRatePercent).toBe(60);
      expect(result.metrics.totalPnl).toBe(40);
      expect(result.metrics.averagePnl).toBe(4);
    }
  });

  it('computes max drawdown as the largest peak-to-trough decline in cumulative PnL', () => {
    // Ordered by closedAt (oldest first): +100, +50, -80, -40, then recover +20, repeated
    // to reach 30 trades. Cumulative after the first four: 100, 150 (peak), 70, 30.
    // Drawdown from peak 150 to trough 30 = 120.
    const shape = [100, 50, -80, -40, 20, 20, 20, 20, 20, 20];
    const pnls = [...shape, ...Array.from({ length: 20 }, () => 5)];
    const data = pnls.map((pnl, i) => trade(pnl, pnls.length - i));
    const result = computePerformance(data);
    expect(result.tier).toBe('full');
    if (result.tier === 'full') {
      expect(result.metrics.maxDrawdown).toBeCloseTo(120);
    }
  });

  it('returns null riskAdjustedReturnRatio when every trade has an identical return (zero stddev)', () => {
    const data = trades(30, () => 10); // same PnL, same notional -> identical return every time
    const result = computePerformance(data);
    expect(result.tier).toBe('full');
    if (result.tier === 'full') {
      expect(result.metrics.riskAdjustedReturnRatio).toBeNull();
    }
  });

  it('never fabricates data: window bounds reflect the actual earliest/latest trade timestamps', () => {
    // Explicit, non-overlapping day offsets (30 down to 3, step 3) so there's
    // no ambiguity about which fixture is oldest/newest.
    const offsets = [30, 27, 24, 21, 18, 15, 12, 9, 6, 3];
    const fixtures = offsets.map((daysAgo) => trade(10, daysAgo));
    // Shuffle the input order to prove sorting, not insertion order, determines the bounds.
    const shuffled = [fixtures[3], fixtures[0], fixtures[9], fixtures[5], fixtures[1], fixtures[8], fixtures[2], fixtures[7], fixtures[4], fixtures[6]];

    const result = computePerformance(shuffled);
    expect(result.tier).toBe('preliminary');
    expect(result.windowStart).toBe(fixtures[0].closedAt.toISOString()); // daysAgo: 30 -> oldest
    expect(result.windowEnd).toBe(fixtures[9].closedAt.toISOString()); // daysAgo: 3 -> newest
  });
});
