import { z } from 'zod';
import { SUPPORTED_CANDLE_INTERVALS } from './marketData';

/** Params for GET /api/funding/:symbol. */
export const FundingRateParamsSchema = z.object({
  symbol: z.string().trim().min(1).max(10).toUpperCase(),
});

export type FundingRateParams = z.infer<typeof FundingRateParamsSchema>;

/** Params for GET /api/markets/:symbol/candles. */
export const CandlesParamsSchema = z.object({
  symbol: z.string().trim().min(1).max(10).toUpperCase(),
});
export type CandlesParams = z.infer<typeof CandlesParamsSchema>;

/**
 * Query for GET /api/markets/:symbol/candles. `limit` capped at 500 -- a
 * chart/backtest consumer asking for more than that per request is almost
 * certainly a bug, not a legitimate use case, and an unbounded limit here
 * is exactly the kind of resource-exhaustion surface SEC-HARDEN-001 is
 * meant to close off repo-wide; this endpoint just doesn't open it up in
 * the first place.
 */
export const CandlesQuerySchema = z.object({
  interval: z.enum(SUPPORTED_CANDLE_INTERVALS).default('1m'),
  limit: z.coerce.number().int().positive().max(500).default(100),
});
export type CandlesQuery = z.infer<typeof CandlesQuerySchema>;
