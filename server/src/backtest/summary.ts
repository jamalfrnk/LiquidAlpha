import { PRELIMINARY_MIN_TRADES, FULL_MIN_TRADES, type BacktestSummary, type BacktestTrade } from '../schemas/backtest';

/**
 * Aggregates a completed backtest run's trades into the full summary
 * contract. Pure function, no DB -- mirrors analytics/metrics.ts's
 * `computePerformance` structure closely, including reusing its exact
 * sample-adequacy tier thresholds (10/30 trades) rather than inventing a
 * new one, per the issue's explicit instruction. Withholds the same class
 * of sample-size-sensitive figures (profit factor, max drawdown,
 * expectancy, and every breakdown) below the "full" tier that DATA-015
 * withholds `riskAdjustedReturnRatio`/`maxDrawdown` below its own.
 *
 * "Expectancy" here is computed directly as `netPnl / tradeCount` --
 * mathematically identical to the textbook
 * `winRate * avgWin - lossRate * avgLoss` formulation, computed the more
 * direct way so there's exactly one source of truth for it, not two
 * formulas that could silently drift apart.
 */
const SCORE_RANGE_BUCKETS = [
  { label: '0-24', min: 0, max: 25 },
  { label: '25-49', min: 25, max: 50 },
  { label: '50-74', min: 50, max: 75 },
  { label: '75-100', min: 75, max: 101 },
] as const;

function directionBreakdown(trades: BacktestTrade[], side: 'LONG' | 'SHORT') {
  const subset = trades.filter((t) => t.side === side);
  const wins = subset.filter((t) => t.pnl > 0).length;
  return {
    count: subset.length,
    winRatePercent: subset.length > 0 ? (wins / subset.length) * 100 : 0,
    netPnl: subset.reduce((sum, t) => sum + t.pnl, 0),
  };
}

function assetBreakdown(trades: BacktestTrade[]): Record<string, { count: number; winRatePercent: number; netPnl: number }> {
  const bySymbol = new Map<string, BacktestTrade[]>();
  for (const trade of trades) {
    const list = bySymbol.get(trade.symbol) ?? [];
    list.push(trade);
    bySymbol.set(trade.symbol, list);
  }
  const result: Record<string, { count: number; winRatePercent: number; netPnl: number }> = {};
  for (const [symbol, subset] of bySymbol) {
    const wins = subset.filter((t) => t.pnl > 0).length;
    result[symbol] = {
      count: subset.length,
      winRatePercent: (wins / subset.length) * 100,
      netPnl: subset.reduce((sum, t) => sum + t.pnl, 0),
    };
  }
  return result;
}

function scoreRangeBreakdown(
  trades: BacktestTrade[],
): Record<string, { count: number; winRatePercent: number; netPnl: number }> | null {
  if (trades.some((t) => t.signalStrengthScore === null)) return null;
  const result: Record<string, { count: number; winRatePercent: number; netPnl: number }> = {};
  for (const bucket of SCORE_RANGE_BUCKETS) {
    const subset = trades.filter((t) => t.signalStrengthScore! >= bucket.min && t.signalStrengthScore! < bucket.max);
    if (subset.length === 0) continue;
    const wins = subset.filter((t) => t.pnl > 0).length;
    result[bucket.label] = {
      count: subset.length,
      winRatePercent: (wins / subset.length) * 100,
      netPnl: subset.reduce((sum, t) => sum + t.pnl, 0),
    };
  }
  return result;
}

function maxDrawdown(trades: BacktestTrade[]): number {
  const chronological = [...trades].sort((a, b) => new Date(a.exitTime).getTime() - new Date(b.exitTime).getTime());
  let peak = 0;
  let cumulative = 0;
  let drawdown = 0;
  for (const trade of chronological) {
    cumulative += trade.pnl;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > drawdown) drawdown = dd;
  }
  return drawdown;
}

export function summarizeBacktest(
  trades: BacktestTrade[],
  skippedSignalCount: number,
  missingDataAffectedTradeCount: number,
): BacktestSummary {
  const tradeCount = trades.length;

  if (tradeCount < PRELIMINARY_MIN_TRADES) {
    return {
      tier: 'insufficient',
      sampleSize: tradeCount,
      tradeCount,
      winRatePercent: null,
      netPnl: null,
      avgTradeReturnPct: null,
      expectancy: null,
      profitFactor: null,
      maxDrawdown: null,
      avgHoldingCandles: null,
      longVsShort: null,
      byAsset: null,
      bySignalStrengthRange: null,
      skippedSignalCount,
      missingDataAffectedTradeCount,
    };
  }

  const wins = trades.filter((t) => t.pnl > 0).length;
  const winRatePercent = (wins / tradeCount) * 100;
  const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const avgTradeReturnPct = trades.reduce((sum, t) => sum + t.returnPct, 0) / tradeCount;
  const avgHoldingCandles = trades.reduce((sum, t) => sum + t.holdingCandles, 0) / tradeCount;

  if (tradeCount < FULL_MIN_TRADES) {
    return {
      tier: 'preliminary',
      sampleSize: tradeCount,
      tradeCount,
      winRatePercent,
      netPnl,
      avgTradeReturnPct,
      expectancy: null,
      profitFactor: null,
      maxDrawdown: null,
      avgHoldingCandles,
      longVsShort: null,
      byAsset: null,
      bySignalStrengthRange: null,
      skippedSignalCount,
      missingDataAffectedTradeCount,
    };
  }

  const grossProfit = trades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  return {
    tier: 'full',
    sampleSize: tradeCount,
    tradeCount,
    winRatePercent,
    netPnl,
    avgTradeReturnPct,
    expectancy: netPnl / tradeCount,
    profitFactor,
    maxDrawdown: maxDrawdown(trades),
    avgHoldingCandles,
    longVsShort: { LONG: directionBreakdown(trades, 'LONG'), SHORT: directionBreakdown(trades, 'SHORT') },
    byAsset: assetBreakdown(trades),
    bySignalStrengthRange: scoreRangeBreakdown(trades),
    skippedSignalCount,
    missingDataAffectedTradeCount,
  };
}
