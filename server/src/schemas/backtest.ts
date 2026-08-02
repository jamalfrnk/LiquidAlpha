import { z } from 'zod';
import { SUPPORTED_CANDLE_INTERVALS } from './marketData';
import { PERFORMANCE_PRELIMINARY_MIN_TRADES, PERFORMANCE_FULL_MIN_TRADES } from './analytics';

/**
 * Contract for BACKTEST-001's deterministic historical backtesting engine.
 *
 * Reuses the DATA-015 sample-adequacy tiering precedent (`insufficient` /
 * `preliminary` / `full` at the same 10/30-trade thresholds,
 * `schemas/analytics.ts`) rather than inventing a new silent threshold, and
 * the same "don't call it Sharpe unless it's really Sharpe" discipline
 * `analytics/metrics.ts` already applies (`riskAdjustedReturnRatio`, not
 * `sharpeRatio`).
 */

export const BACKTEST_ENGINE_VERSION = 'v1';

/** Hard per-run caps, independent of whatever SEC-HARDEN-001 layers on top -- this engine must not be unbounded-by-design even before that issue formalizes user-facing rate/size limits. */
export const MAX_BACKTEST_SYMBOLS = 3;
export const MAX_BACKTEST_CANDLES_PER_SYMBOL = 10_000;

export const BacktestConfigSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(10).toUpperCase()).min(1).max(MAX_BACKTEST_SYMBOLS),
  marketType: z.literal('perp'), // only perp exists in this app -- see DATA-HL-001
  interval: z.enum(SUPPORTED_CANDLE_INTERVALS),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  /** Only documented assumption implemented so far: a fired signal's entry fills at the very next candle's open, never at the signal candle's own close (the classic lookahead trap). */
  entryFillAssumption: z.literal('next-candle-open'),
  /** Simulated slippage in basis points, applied at both entry and exit -- reuses execution/slippage.ts's applySlippage rather than a separate implementation. */
  slippageBps: z.number().nonnegative().default(5),
  /** Round-trip trading fee, in basis points of notional, charged once per trade (entry+exit combined). */
  feeBps: z.number().nonnegative().default(5),
  fundingEnabled: z.boolean().default(false),
  /** A position still open after this many candles is closed at that candle's close price (time-based exit), never left unresolved. */
  maxHoldingCandles: z.number().int().positive().max(2000).default(200),
  /** Fixed notional per trade, in quote currency -- mirrors paper-trading's own fixed-size-per-order model rather than compounding equity across trades, which this engine does not simulate. */
  riskPerTradeNotional: z.number().positive().default(1000),
  leverage: z.number().positive().default(1),
  signalEngineVersion: z.string(),
  /** Null when SIGNAL-SCORE-001 wasn't available/enabled for this run -- trades are still graded by ruleAlignmentScore, but bySignalStrengthRange is omitted from the summary in that case. */
  scoreModelVersion: z.string().nullable(),
  dataSource: z.literal('hyperliquid'),
  /** Identifies exactly which candles were used without duplicating the candle data itself -- a hash of the ordered (symbol, openTime, close) tuples actually fed to the engine, per symbol, joined together. */
  datasetVersion: z.string(),
});
export type BacktestConfig = z.infer<typeof BacktestConfigSchema>;

export const BacktestTradeSchema = z.object({
  symbol: z.string(),
  side: z.enum(['LONG', 'SHORT']),
  signalStrengthScore: z.number().nullable(),
  ruleAlignmentScore: z.number(),
  entryTime: z.string(),
  entryPrice: z.number(),
  exitTime: z.string(),
  exitPrice: z.number(),
  exitReason: z.enum(['stop-loss', 'take-profit', 'time-exit']),
  holdingCandles: z.number().int(),
  feesPaid: z.number(),
  fundingPaid: z.number(),
  pnl: z.number(),
  returnPct: z.number(),
});
export type BacktestTrade = z.infer<typeof BacktestTradeSchema>;

export const BacktestTierSchema = z.enum(['insufficient', 'preliminary', 'full']);
export type BacktestTier = z.infer<typeof BacktestTierSchema>;

const DirectionBreakdownSchema = z.object({ count: z.number().int(), winRatePercent: z.number(), netPnl: z.number() });
const AssetBreakdownSchema = z.object({ count: z.number().int(), winRatePercent: z.number(), netPnl: z.number() });
const ScoreRangeBreakdownSchema = z.object({ count: z.number().int(), winRatePercent: z.number(), netPnl: z.number() });

export const BacktestSummarySchema = z.object({
  tier: BacktestTierSchema,
  sampleSize: z.number().int(),
  tradeCount: z.number().int(),
  winRatePercent: z.number().nullable(),
  netPnl: z.number().nullable(),
  avgTradeReturnPct: z.number().nullable(),
  /** Average PnL per trade, weighted by win/loss rate -- `winRate*avgWin - lossRate*avgLoss`, not a probability of anything. */
  expectancy: z.number().nullable(),
  /** Gross profit / gross loss. `null` (not `Infinity`) when there are zero losing trades, since a summary metric should never be a non-JSON-serializable value. */
  profitFactor: z.number().nullable(),
  maxDrawdown: z.number().nullable(),
  avgHoldingCandles: z.number().nullable(),
  longVsShort: z.object({ LONG: DirectionBreakdownSchema, SHORT: DirectionBreakdownSchema }).nullable(),
  byAsset: z.record(z.string(), AssetBreakdownSchema).nullable(),
  /** Omitted (null) entirely when scoreModelVersion is null for this run -- there is no score to bucket by. */
  bySignalStrengthRange: z.record(z.string(), ScoreRangeBreakdownSchema).nullable(),
  skippedSignalCount: z.number().int(),
  missingDataAffectedTradeCount: z.number().int(),
});
export type BacktestSummary = z.infer<typeof BacktestSummarySchema>;

export const BacktestStatusSchema = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']);
export type BacktestStatus = z.infer<typeof BacktestStatusSchema>;

export const CreateBacktestRequestSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(10).toUpperCase()).min(1).max(MAX_BACKTEST_SYMBOLS),
  interval: z.enum(SUPPORTED_CANDLE_INTERVALS),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  slippageBps: z.number().nonnegative().optional(),
  feeBps: z.number().nonnegative().optional(),
  fundingEnabled: z.boolean().optional(),
  maxHoldingCandles: z.number().int().positive().max(2000).optional(),
  riskPerTradeNotional: z.number().positive().optional(),
  leverage: z.number().positive().optional(),
});
export type CreateBacktestRequest = z.infer<typeof CreateBacktestRequestSchema>;

export const PRELIMINARY_MIN_TRADES = PERFORMANCE_PRELIMINARY_MIN_TRADES;
export const FULL_MIN_TRADES = PERFORMANCE_FULL_MIN_TRADES;
