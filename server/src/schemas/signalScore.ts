import { z } from 'zod';

/**
 * Shared client/server contract for the "Signal strength" score model
 * (SIGNAL-SCORE-001). Mirrors the discriminated/versioned-contract pattern
 * established for performance metrics in schemas/analytics.ts (DATA-015):
 * one schema is the single source of truth both sides import, rather than
 * re-deriving the shape independently.
 *
 * Named "Signal strength" everywhere it's surfaced -- never "probability",
 * "confidence", or "expected return" -- for the same reason
 * `ruleAlignmentScore` replaced `confidence` in the underlying signal
 * engine (GH F-5): this is an agreement-based heuristic, not a calibrated
 * statistical estimate, and nothing here claims otherwise.
 */
export const SCORE_MODEL_VERSION = 'v1';

export const SignalDirectionSchema = z.enum(['LONG', 'SHORT', 'NEUTRAL']);
export type SignalDirection = z.infer<typeof SignalDirectionSchema>;

export const SignalComponentScoresSchema = z.object({
  trendAgreement: z.number().min(0).max(100),
  momentumAgreement: z.number().min(0).max(100),
  trendStrengthConfirmation: z.number().min(0).max(100),
  volatilitySuitability: z.number().min(0).max(100),
  dataFreshness: z.number().min(0).max(100),
  indicatorAvailability: z.number().min(0).max(100),
});
export type SignalComponentScores = z.infer<typeof SignalComponentScoresSchema>;

export const SignalScoreSchema = z.object({
  totalScore: z.number().min(0).max(100),
  direction: SignalDirectionSchema,
  componentScores: SignalComponentScoresSchema,
  indicatorsUsed: z.array(z.string()),
  indicatorsMissing: z.array(z.string()),
  freshnessStatus: z.enum(['fresh', 'stale']),
  conflictingConditions: z.array(z.string()),
  invalidationConditions: z.array(z.string()),
  signalEngineVersion: z.string(),
  scoreModelVersion: z.string(),
  /**
   * Always null: this dataset is tick-level price history, not fixed-
   * interval OHLC candles (see technical-analysis.ts's own dataQuality/
   * barCount naming, which avoids the same overclaim). Exposed explicitly
   * as null -- with this documented reason -- rather than fabricating an
   * interval label like "1h" that the underlying data doesn't actually have.
   */
  candleInterval: z.null(),
  sourceDataFrom: z.string(),
  sourceDataTo: z.string(),
  explanation: z.string(),
});
export type SignalScore = z.infer<typeof SignalScoreSchema>;
