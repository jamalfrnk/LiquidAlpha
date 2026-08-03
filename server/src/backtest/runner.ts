import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { backtestRuns, backtestTrades } from '../db/schema';
import { fetchAndCacheCandles, fetchFundingForRange, computeDatasetVersion } from './dataset';
import { runBacktestEngineForSymbol } from './engine';
import { summarizeBacktest } from './summary';
import { RULE_VERSION, MIN_HISTORY } from '../technical-analysis';
import { SCORE_MODEL_VERSION } from '../schemas/signalScore';
import {
  BACKTEST_ENGINE_VERSION,
  type BacktestConfig,
  type BacktestTrade,
  type CreateBacktestRequest,
} from '../schemas/backtest';
import type { NormalizedCandle, HyperliquidFundingHistoryEntry } from '../schemas/marketData';

/**
 * Top-level orchestration for BACKTEST-001: validates the request, fetches
 * (and caches) exactly the candle/funding data the run needs, runs the pure
 * engine per symbol, aggregates the results, and persists config + summary
 * + individual trades. This is the one place in the feature that touches
 * the database or the network -- everything it calls into (engine.ts,
 * summary.ts) is pure and already independently unit-tested.
 *
 * A run is recorded as `RUNNING` before any fetching starts and finalized
 * to `COMPLETED` or `FAILED` in every code path (including a thrown
 * error), so a run is never left silently stuck in `PENDING`/`RUNNING`.
 */
export async function createAndRunBacktest(userId: string, request: CreateBacktestRequest) {
  const startTimeMs = new Date(request.startTime).getTime();
  const endTimeMs = new Date(request.endTime).getTime();
  if (!(startTimeMs < endTimeMs)) {
    throw new Error('startTime must be before endTime');
  }

  const fundingEnabled = request.fundingEnabled ?? false;
  const slippageBps = request.slippageBps ?? 5;
  const feeBps = request.feeBps ?? 5;
  const maxHoldingCandles = request.maxHoldingCandles ?? 200;
  const riskPerTradeNotional = request.riskPerTradeNotional ?? 1000;
  const leverage = request.leverage ?? 1;

  const baseConfigFields = {
    symbols: request.symbols,
    marketType: 'perp' as const,
    interval: request.interval,
    startTime: request.startTime,
    endTime: request.endTime,
    entryFillAssumption: 'next-candle-open' as const,
    slippageBps,
    feeBps,
    fundingEnabled,
    maxHoldingCandles,
    riskPerTradeNotional,
    leverage,
    signalEngineVersion: RULE_VERSION,
    // SIGNAL-SCORE-001 is available at implementation time, so every run
    // is scored -- this stays non-null unless that model is ever removed
    // or disabled, in which case this documents the run genuinely had no
    // score to grade with, rather than silently omitting the field.
    scoreModelVersion: SCORE_MODEL_VERSION,
    dataSource: 'hyperliquid' as const,
  };

  // Candle/funding fetching (and the resulting datasetVersion) must happen
  // BEFORE a run row can be written, since `config` requires it -- but a
  // failure here (e.g. not enough history for a symbol) still needs to be
  // recorded, not just thrown into the void. This path writes a single
  // FAILED row directly (no RUNNING row ever existed to update), with a
  // placeholder datasetVersion documenting that no dataset was ever
  // resolved for this attempt.
  const candlesBySymbol: Record<string, NormalizedCandle[]> = {};
  const fundingBySymbol: Record<string, HyperliquidFundingHistoryEntry[]> = {};
  let config: BacktestConfig;
  try {
    for (const symbol of request.symbols) {
      const symbolCandles = await fetchAndCacheCandles(symbol, request.interval, startTimeMs, endTimeMs);
      if (symbolCandles.length < MIN_HISTORY + 1) {
        throw new Error(
          `Not enough historical candles for ${symbol} in the requested range (${symbolCandles.length} found, need at least ${MIN_HISTORY + 1}) -- widen the date range.`,
        );
      }
      candlesBySymbol[symbol] = symbolCandles;
      if (fundingEnabled) {
        fundingBySymbol[symbol] = await fetchFundingForRange(symbol, startTimeMs, endTimeMs);
      }
    }
    config = { ...baseConfigFields, datasetVersion: computeDatasetVersion(candlesBySymbol) };
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : String(err);
    const [failed] = await db
      .insert(backtestRuns)
      .values({
        userId,
        status: 'FAILED',
        config: { ...baseConfigFields, datasetVersion: '' },
        engineVersion: BACKTEST_ENGINE_VERSION,
        failureReason,
        completedAt: new Date(),
      })
      .returning();
    return failed;
  }

  const [run] = await db
    .insert(backtestRuns)
    .values({ userId, status: 'RUNNING', config, engineVersion: BACKTEST_ENGINE_VERSION })
    .returning();

  try {
    let allTrades: BacktestTrade[] = [];
    let skippedSignalCount = 0;
    let missingDataAffectedTradeCount = 0;

    for (const symbol of request.symbols) {
      const output = runBacktestEngineForSymbol({
        symbol,
        interval: request.interval,
        candles: candlesBySymbol[symbol],
        fundingEntries: fundingBySymbol[symbol] ?? [],
        slippageBps,
        feeBps,
        fundingEnabled,
        maxHoldingCandles,
        riskPerTradeNotional,
        leverage,
        scoreModelEnabled: true,
      });
      allTrades = allTrades.concat(output.trades);
      skippedSignalCount += output.skippedSignalCount;
      missingDataAffectedTradeCount += output.missingDataAffectedTradeCount;
    }

    const summary = summarizeBacktest(allTrades, skippedSignalCount, missingDataAffectedTradeCount);

    if (allTrades.length > 0) {
      await db.insert(backtestTrades).values(
        allTrades.map((trade) => ({
          runId: run.id,
          symbol: trade.symbol,
          side: trade.side,
          signalStrengthScore: trade.signalStrengthScore !== null ? trade.signalStrengthScore.toString() : null,
          ruleAlignmentScore: trade.ruleAlignmentScore.toString(),
          entryTime: new Date(trade.entryTime),
          entryPrice: trade.entryPrice.toString(),
          exitTime: new Date(trade.exitTime),
          exitPrice: trade.exitPrice.toString(),
          exitReason: trade.exitReason,
          holdingCandles: trade.holdingCandles,
          feesPaid: trade.feesPaid.toString(),
          fundingPaid: trade.fundingPaid.toString(),
          pnl: trade.pnl.toString(),
          returnPct: trade.returnPct.toString(),
        })),
      );
    }

    const [completed] = await db
      .update(backtestRuns)
      .set({ status: 'COMPLETED', summary, completedAt: new Date() })
      .where(eq(backtestRuns.id, run.id))
      .returning();
    return completed;
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : String(err);
    const [failed] = await db
      .update(backtestRuns)
      .set({ status: 'FAILED', failureReason, completedAt: new Date() })
      .where(eq(backtestRuns.id, run.id))
      .returning();
    return failed;
  }
}
