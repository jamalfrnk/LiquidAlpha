import { evaluateSignal, MIN_HISTORY } from '../technical-analysis';
import { computeSignalScore } from '../signals/signalScore';
import { applySlippage } from '../execution/slippage';
import type { NormalizedCandle, HyperliquidFundingHistoryEntry, CandleInterval } from '../schemas/marketData';
import type { BacktestTrade } from '../schemas/backtest';

/**
 * The deterministic backtest simulation core (BACKTEST-001). Pure and
 * DB-free, mirroring the established pattern in analytics/metrics.ts and
 * paper P&L: everything here is a function of its arguments, nothing reads
 * the clock, the network, or the database, so it is fully unit-testable
 * and produces byte-identical output for identical input.
 *
 * ## The no-lookahead invariant (the single most important property here)
 *
 * At loop index `i`, the engine calls `evaluateSignal(closes.slice(0, i + 1))`
 * -- `evaluateSignal` (reused, unmodified, from technical-analysis.ts, the
 * same function production signal generation uses) never sees any candle
 * beyond index `i`. If a signal fires, the resulting trade enters at candle
 * `i + 1`'s **open** (never the signal candle's own close, which is the
 * classic lookahead trap: you cannot know a candle closed a certain way
 * until it has actually closed, at which point the earliest real order
 * placement is against the *next* candle). See engine.test.ts's
 * `describe('no-lookahead guarantee', ...)` for the regression test that
 * proves this by construction, not just by inspection.
 *
 * ## Other documented assumptions
 *
 * - **At most one open position at a time per symbol.** Once a signal
 *   fires and a trade opens, no new signal is evaluated until that trade
 *   resolves -- this mirrors the real paper-trading engine's own behavior
 *   (`execution/paperEngine.ts` rejects a new opposite-direction order
 *   while a position is open), not a limitation invented just for
 *   backtesting.
 * - **Same-candle stop/target collision** (a single candle's high/low
 *   range contains both the stop-loss and take-profit level) resolves as
 *   the stop-loss -- the conservative assumption, since OHLC data alone
 *   cannot reveal which level price actually touched first intra-candle,
 *   and assuming the better outcome would introduce an optimistic bias.
 * - **A trade still open when the dataset itself runs out** (there isn't
 *   enough remaining data to know whether `maxHoldingCandles` would have
 *   been reached, or whether stop/target would have hit first) is excluded
 *   from `trades` entirely and counted in `skippedSignalCount` -- resolving
 *   it anyway would mean reporting an outcome the data doesn't actually
 *   support.
 * - **A legitimate time-based exit** (the holding window elapses within
 *   the available dataset without hitting stop or target) closes at that
 *   final candle's close price.
 * - Stop-loss/take-profit distances are taken from `evaluateSignal`'s own
 *   ATR-based levels (computed at the signal candle) but **re-anchored to
 *   the actual fill price** (the next candle's open, after slippage) --
 *   the risk/reward distance is a property of volatility at signal time,
 *   but the price it protects is the price the trade actually entered at.
 * - Historical signals are always scored as fully "fresh" -- data
 *   staleness is a live-operational concern (is the feed currently lagging
 *   right now?) that has no meaning applied retroactively to a fixed
 *   historical dataset.
 */

const INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
};

function nanToNull(value: number): number | null {
  return isNaN(value) ? null : value;
}

export interface BacktestEngineInput {
  symbol: string;
  interval: CandleInterval;
  /** Chronological (oldest-first), all `closed: true` -- the caller (dataset.ts) is responsible for that guarantee; the engine trusts it rather than re-validating on every call. */
  candles: NormalizedCandle[];
  /** Funding entries for this symbol across the full candle range; may be empty. Only consulted when `fundingEnabled`. */
  fundingEntries: HyperliquidFundingHistoryEntry[];
  slippageBps: number;
  feeBps: number;
  fundingEnabled: boolean;
  maxHoldingCandles: number;
  riskPerTradeNotional: number;
  leverage: number;
  /** Whether to compute a SIGNAL-SCORE-001 score per trade -- null in every trade's `signalStrengthScore` when false (that model wasn't available/enabled for this run). */
  scoreModelEnabled: boolean;
}

export interface BacktestEngineOutput {
  trades: BacktestTrade[];
  skippedSignalCount: number;
  missingDataAffectedTradeCount: number;
}

function fundingCostForWindow(
  fundingEntries: HyperliquidFundingHistoryEntry[],
  windowStartMs: number,
  windowEndMs: number,
  notional: number,
  side: 'LONG' | 'SHORT',
): number {
  let cost = 0;
  for (const entry of fundingEntries) {
    if (entry.time >= windowStartMs && entry.time < windowEndMs) {
      const rate = parseFloat(entry.fundingRate);
      // Standard perp convention: a positive funding rate is paid by longs to shorts.
      cost += side === 'LONG' ? notional * rate : -notional * rate;
    }
  }
  return cost;
}

export function runBacktestEngineForSymbol(input: BacktestEngineInput): BacktestEngineOutput {
  const {
    symbol,
    interval,
    candles,
    fundingEntries,
    slippageBps,
    feeBps,
    fundingEnabled,
    maxHoldingCandles,
    riskPerTradeNotional,
    leverage,
    scoreModelEnabled,
  } = input;

  const closes = candles.map((c) => parseFloat(c.close));
  const expectedStepMs = INTERVAL_MS[interval];
  const trades: BacktestTrade[] = [];
  let skippedSignalCount = 0;
  let missingDataAffectedTradeCount = 0;

  let i = MIN_HISTORY - 1;
  while (i < candles.length - 1) {
    // STRICT no-lookahead boundary: only candles[0..i] are visible here.
    const evaluation = evaluateSignal(closes.slice(0, i + 1));
    if (!evaluation) {
      i += 1;
      continue;
    }

    const entryIndex = i + 1;
    const entryCandle = candles[entryIndex];
    const side = evaluation.signalType;
    const rawEntryPrice = parseFloat(entryCandle.open);
    const entryPrice = applySlippage(rawEntryPrice, side, slippageBps);

    const riskDistance = Math.abs(evaluation.entryPrice - evaluation.stopLoss);
    const rewardDistance = Math.abs(evaluation.takeProfit - evaluation.entryPrice);
    const stopLoss = side === 'LONG' ? entryPrice - riskDistance : entryPrice + riskDistance;
    const takeProfit = side === 'LONG' ? entryPrice + rewardDistance : entryPrice - rewardDistance;

    const maxJ = Math.min(entryIndex + maxHoldingCandles - 1, candles.length - 1);
    const windowIsTruncatedByDataset = maxJ === candles.length - 1 && maxJ - entryIndex + 1 < maxHoldingCandles;

    let exitIndex = -1;
    let exitPrice = 0;
    let exitReason: BacktestTrade['exitReason'] = 'time-exit';
    let hadGap = false;

    for (let j = entryIndex; j <= maxJ; j++) {
      if (j > entryIndex) {
        const stepMs = candles[j].openTime.getTime() - candles[j - 1].openTime.getTime();
        if (stepMs !== expectedStepMs) hadGap = true;
      }
      const high = parseFloat(candles[j].high);
      const low = parseFloat(candles[j].low);
      const hitStop = side === 'LONG' ? low <= stopLoss : high >= stopLoss;
      const hitTarget = side === 'LONG' ? high >= takeProfit : low <= takeProfit;
      if (hitStop) {
        // Conservative same-candle tie-break: stop resolves first even if the target was also touched this candle.
        exitIndex = j;
        exitPrice = stopLoss;
        exitReason = 'stop-loss';
        break;
      }
      if (hitTarget) {
        exitIndex = j;
        exitPrice = takeProfit;
        exitReason = 'take-profit';
        break;
      }
    }

    if (exitIndex === -1) {
      if (windowIsTruncatedByDataset) {
        // Not enough remaining data to know this trade's real outcome -- exclude rather than fabricate a result.
        skippedSignalCount += 1;
        break; // no candles remain that could resolve a later trade either
      }
      exitIndex = maxJ;
      exitPrice = parseFloat(candles[maxJ].close);
      exitReason = 'time-exit';
    }

    if (hadGap) missingDataAffectedTradeCount += 1;

    const exitCandle = candles[exitIndex];
    const notional = riskPerTradeNotional * leverage;
    const quantity = notional / entryPrice;
    const grossPnl = side === 'LONG' ? (exitPrice - entryPrice) * quantity : (entryPrice - exitPrice) * quantity;
    const feesPaid = notional * (feeBps / 10_000);
    const fundingPaid = fundingEnabled
      ? fundingCostForWindow(fundingEntries, entryCandle.openTime.getTime(), exitCandle.closeTime.getTime(), notional, side)
      : 0;
    const pnl = grossPnl - feesPaid - fundingPaid;
    const returnPct = (pnl / riskPerTradeNotional) * 100;

    let signalStrengthScore: number | null = null;
    if (scoreModelEnabled) {
      const snapshot = evaluation.indicatorSnapshot;
      const score = computeSignalScore({
        ema50: nanToNull(snapshot.ema50),
        ema200: nanToNull(snapshot.ema200),
        macdHist: nanToNull(snapshot.macdHist),
        rsi: nanToNull(snapshot.rsi),
        adx: nanToNull(snapshot.adx),
        fisher: nanToNull(snapshot.fisher),
        keltnerUpper: nanToNull(snapshot.keltnerUpper),
        keltnerLower: nanToNull(snapshot.keltnerLower),
        atr: nanToNull(snapshot.atr),
        price: evaluation.entryPrice,
        dataAgeMs: 0,
        staleAfterMs: Number.MAX_SAFE_INTEGER,
        signalEngineVersion: evaluation.ruleVersion,
        sourceDataFrom: candles[0].openTime.toISOString(),
        sourceDataTo: candles[i].closeTime.toISOString(),
      });
      signalStrengthScore = score.totalScore;
    }

    trades.push({
      symbol,
      side,
      signalStrengthScore,
      ruleAlignmentScore: evaluation.ruleAlignmentScore,
      entryTime: entryCandle.openTime.toISOString(),
      entryPrice,
      exitTime: exitCandle.closeTime.toISOString(),
      exitPrice,
      exitReason,
      holdingCandles: exitIndex - entryIndex + 1,
      feesPaid,
      fundingPaid,
      pnl,
      returnPct,
    });

    // Resume scanning only after this trade resolves -- at most one open position at a time.
    i = exitIndex;
  }

  return { trades, skippedSignalCount, missingDataAffectedTradeCount };
}
