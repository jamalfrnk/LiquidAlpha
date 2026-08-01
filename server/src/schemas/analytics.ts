import { z } from 'zod';

/**
 * Sample-size tiers for performance metrics, per the DATA-015 decision
 * (2026-07-31): below 10 closed trades, nothing is shown at all -- not even
 * a win rate. 10-29 shows simple counts only, explicitly labeled
 * preliminary, withholding the risk-adjusted ratio and max drawdown
 * specifically since those are the most sample-size-sensitive. 30+ shows
 * everything. This schema is the single source of truth for that contract
 * -- server and client both import it rather than re-deriving the shape.
 */
export const PERFORMANCE_PRELIMINARY_MIN_TRADES = 10;
export const PERFORMANCE_FULL_MIN_TRADES = 30;

export const PerformanceTierSchema = z.enum(['insufficient', 'preliminary', 'full']);
export type PerformanceTier = z.infer<typeof PerformanceTierSchema>;

const PreliminaryMetricsSchema = z.object({
  winRatePercent: z.number(),
  totalPnl: z.number(),
  averagePnl: z.number(),
});

const FullMetricsSchema = PreliminaryMetricsSchema.extend({
  /**
   * mean(per-trade return) / sample-stddev(per-trade return), where a
   * trade's return is realizedPnl / notional (entryPrice * quantity) --
   * NOT an annualized Sharpe ratio (no time-period normalization or
   * risk-free-rate subtraction is applied). Deliberately not called
   * "Sharpe ratio" to avoid overclaiming a calibration this simplified
   * version doesn't have. `null` if standard deviation is zero (e.g. every
   * trade had an identical return).
   */
  riskAdjustedReturnRatio: z.number().nullable(),
  /**
   * Largest peak-to-trough decline in cumulative realized PnL, in absolute
   * quote-currency terms (not a percentage of account equity -- there is no
   * starting-balance concept in this schema to normalize against).
   */
  maxDrawdown: z.number(),
});

export const PerformanceResponseSchema = z.discriminatedUnion('tier', [
  z.object({
    tier: z.literal('insufficient'),
    sampleSize: z.number().int(),
    windowStart: z.string().nullable(),
    windowEnd: z.string().nullable(),
    mode: z.literal('paper'),
    metrics: z.null(),
  }),
  z.object({
    tier: z.literal('preliminary'),
    sampleSize: z.number().int(),
    windowStart: z.string(),
    windowEnd: z.string(),
    mode: z.literal('paper'),
    metrics: PreliminaryMetricsSchema,
  }),
  z.object({
    tier: z.literal('full'),
    sampleSize: z.number().int(),
    windowStart: z.string(),
    windowEnd: z.string(),
    mode: z.literal('paper'),
    metrics: FullMetricsSchema,
  }),
]);

export type PerformanceResponse = z.infer<typeof PerformanceResponseSchema>;
