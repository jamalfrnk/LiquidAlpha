import {
  PERFORMANCE_PRELIMINARY_MIN_TRADES,
  PERFORMANCE_FULL_MIN_TRADES,
  type PerformanceResponse,
} from '../schemas/analytics';

export interface ClosedTrade {
  /** Realized profit/loss in quote currency for this closed position. */
  realizedPnl: number;
  /** entryPrice * quantity -- the notional the realized PnL is measured against, for return normalization. */
  notional: number;
  closedAt: Date;
}

/**
 * Computes tiered performance metrics from real closed-position data only --
 * never synthetic/random values. Pure function, no DB access, so the
 * sample-size boundary logic (the exact thing DATA-015 needs to get right)
 * is fully unit-testable without mocking anything.
 */
export function computePerformance(trades: readonly ClosedTrade[]): PerformanceResponse {
  const sampleSize = trades.length;

  if (sampleSize === 0) {
    return { tier: 'insufficient', sampleSize: 0, windowStart: null, windowEnd: null, mode: 'paper', metrics: null };
  }

  const sorted = [...trades].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
  const windowStart = sorted[0].closedAt.toISOString();
  const windowEnd = sorted[sorted.length - 1].closedAt.toISOString();

  if (sampleSize < PERFORMANCE_PRELIMINARY_MIN_TRADES) {
    return { tier: 'insufficient', sampleSize, windowStart, windowEnd, mode: 'paper', metrics: null };
  }

  const totalPnl = sorted.reduce((sum, t) => sum + t.realizedPnl, 0);
  const averagePnl = totalPnl / sampleSize;
  const wins = sorted.filter((t) => t.realizedPnl > 0).length;
  const winRatePercent = (wins / sampleSize) * 100;

  if (sampleSize < PERFORMANCE_FULL_MIN_TRADES) {
    return {
      tier: 'preliminary',
      sampleSize,
      windowStart,
      windowEnd,
      mode: 'paper',
      metrics: { winRatePercent, totalPnl, averagePnl },
    };
  }

  const returns = sorted.map((t) => (t.notional > 0 ? t.realizedPnl / t.notional : 0));
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  // Sample standard deviation (n-1 denominator) -- these are a sample of the
  // user's trading activity, not the full population of trades they'll ever make.
  const variance = returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  // A tolerance, not an exact-zero check: summing n copies of an identical
  // return and dividing back doesn't always reproduce that exact
  // floating-point value, so an all-identical-returns case can otherwise
  // land on a tiny non-zero variance instead of exactly 0.
  const ZERO_STDDEV_TOLERANCE = 1e-9;
  const riskAdjustedReturnRatio = stdDev > ZERO_STDDEV_TOLERANCE ? meanReturn / stdDev : null;

  let peak = 0;
  let cumulative = 0;
  let maxDrawdown = 0;
  for (const trade of sorted) {
    cumulative += trade.realizedPnl;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    tier: 'full',
    sampleSize,
    windowStart,
    windowEnd,
    mode: 'paper',
    metrics: { winRatePercent, totalPnl, averagePnl, riskAdjustedReturnRatio, maxDrawdown },
  };
}
