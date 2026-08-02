import { describe, it, expect } from 'vitest';
import { summarizeBacktest } from './summary';
import type { BacktestTrade } from '../schemas/backtest';

function trade(overrides: Partial<BacktestTrade> = {}): BacktestTrade {
  return {
    symbol: 'BTC',
    side: 'LONG',
    signalStrengthScore: 60,
    ruleAlignmentScore: 64,
    entryTime: '2026-01-01T00:00:00.000Z',
    entryPrice: 100,
    exitTime: '2026-01-01T05:00:00.000Z',
    exitPrice: 105,
    exitReason: 'take-profit',
    holdingCandles: 5,
    feesPaid: 0,
    fundingPaid: 0,
    pnl: 50,
    returnPct: 5,
    ...overrides,
  };
}

describe('summarizeBacktest', () => {
  it('reports "insufficient" and withholds every metric below the preliminary threshold (reuses DATA-015\'s 10-trade line)', () => {
    const trades = Array.from({ length: 9 }, () => trade());
    const summary = summarizeBacktest(trades, 2, 1);
    expect(summary.tier).toBe('insufficient');
    expect(summary.sampleSize).toBe(9);
    expect(summary.tradeCount).toBe(9);
    expect(summary.winRatePercent).toBeNull();
    expect(summary.netPnl).toBeNull();
    expect(summary.profitFactor).toBeNull();
    expect(summary.maxDrawdown).toBeNull();
    expect(summary.byAsset).toBeNull();
    expect(summary.bySignalStrengthRange).toBeNull();
    // Diagnostic counters about the run itself are always reported, regardless of tier.
    expect(summary.skippedSignalCount).toBe(2);
    expect(summary.missingDataAffectedTradeCount).toBe(1);
  });

  it('reports "preliminary" between 10 and 29 trades, showing basic metrics but withholding profit factor / drawdown / breakdowns (reuses DATA-015\'s 30-trade line)', () => {
    const trades = [...Array.from({ length: 15 }, () => trade({ pnl: 50 })), ...Array.from({ length: 5 }, () => trade({ pnl: -20, exitReason: 'stop-loss' }))];
    const summary = summarizeBacktest(trades, 0, 0);
    expect(summary.tier).toBe('preliminary');
    expect(summary.tradeCount).toBe(20);
    expect(summary.winRatePercent).toBeCloseTo(75, 6);
    expect(summary.netPnl).toBeCloseTo(15 * 50 - 5 * 20, 6);
    expect(summary.profitFactor).toBeNull();
    expect(summary.maxDrawdown).toBeNull();
    expect(summary.longVsShort).toBeNull();
    expect(summary.byAsset).toBeNull();
    expect(summary.bySignalStrengthRange).toBeNull();
  });

  it('reports "full" at 30+ trades with every metric populated', () => {
    const wins = Array.from({ length: 20 }, () => trade({ symbol: 'BTC', side: 'LONG', pnl: 50, signalStrengthScore: 80 }));
    const losses = Array.from({ length: 10 }, () => trade({ symbol: 'ETH', side: 'SHORT', pnl: -30, exitReason: 'stop-loss', signalStrengthScore: 20 }));
    const trades = [...wins, ...losses];
    const summary = summarizeBacktest(trades, 0, 0);

    expect(summary.tier).toBe('full');
    expect(summary.tradeCount).toBe(30);
    expect(summary.winRatePercent).toBeCloseTo((20 / 30) * 100, 6);
    expect(summary.netPnl).toBeCloseTo(20 * 50 - 10 * 30, 6);
    expect(summary.expectancy).toBeCloseTo(summary.netPnl! / 30, 6);
    expect(summary.profitFactor).toBeCloseTo((20 * 50) / (10 * 30), 6);
    expect(summary.longVsShort!.LONG.count).toBe(20);
    expect(summary.longVsShort!.SHORT.count).toBe(10);
    expect(summary.byAsset!.BTC.count).toBe(20);
    expect(summary.byAsset!.ETH.count).toBe(10);
    expect(summary.bySignalStrengthRange!['75-100'].count).toBe(20);
    expect(summary.bySignalStrengthRange!['0-24'].count).toBe(10);
  });

  it('profit factor is null (not Infinity) when there are zero losing trades', () => {
    const trades = Array.from({ length: 30 }, () => trade({ pnl: 50 }));
    const summary = summarizeBacktest(trades, 0, 0);
    expect(summary.profitFactor).toBeNull();
  });

  it('omits bySignalStrengthRange entirely when any trade has a null signalStrengthScore (scoring was unavailable for this run)', () => {
    const trades = Array.from({ length: 30 }, () => trade({ signalStrengthScore: null }));
    const summary = summarizeBacktest(trades, 0, 0);
    expect(summary.bySignalStrengthRange).toBeNull();
  });

  it('computes max drawdown as the largest peak-to-trough decline in cumulative pnl, in chronological order', () => {
    const trades: BacktestTrade[] = [
      ...Array.from({ length: 27 }, () => trade({ pnl: 0, entryTime: '2026-01-01T00:00:00.000Z', exitTime: '2026-01-01T00:00:00.000Z' })),
      trade({ pnl: 100, exitTime: '2026-01-02T00:00:00.000Z' }), // cumulative: 100 (peak)
      trade({ pnl: -60, exitReason: 'stop-loss', exitTime: '2026-01-03T00:00:00.000Z' }), // cumulative: 40 (drawdown of 60)
      trade({ pnl: 10, exitTime: '2026-01-04T00:00:00.000Z' }), // cumulative: 50 -- still below peak, doesn't create a new one
    ];
    const summary = summarizeBacktest(trades, 0, 0);
    expect(summary.tier).toBe('full');
    expect(summary.maxDrawdown).toBeCloseTo(60, 6);
  });

  it('handles a zero-trade result as insufficient, with every metric null', () => {
    const summary = summarizeBacktest([], 5, 0);
    expect(summary.tier).toBe('insufficient');
    expect(summary.tradeCount).toBe(0);
    expect(summary.winRatePercent).toBeNull();
    expect(summary.skippedSignalCount).toBe(5);
  });
});
