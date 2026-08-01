import { z } from 'zod';

/**
 * Contracts for Hyperliquid's public Info endpoint (POST /info) and
 * WebSocket (wss://api.hyperliquid.xyz/ws), verified directly against
 * Hyperliquid's own docs (hyperliquid.gitbook.io/hyperliquid-docs) rather
 * than inferred -- see docs/architecture/market-data.md for the SDK-vs-
 * direct-integration decision this schema module is part of.
 *
 * Hyperliquid returns REST price/size fields as JSON strings (e.g.
 * "29258.0"), which is exactly the "validated decimal strings at external
 * boundaries" the mission calls for -- these schemas preserve that string
 * form rather than coercing to `number` and losing precision. The
 * WebSocket `candle` push is documented with numeric OHLCV fields, an
 * inconsistency with the REST shape this schema deliberately tolerates
 * (accepts either) rather than assuming one wire format everywhere.
 */

const decimalString = z.union([z.string(), z.number()]).transform((v) => String(v));

/** `{"type":"allMids","dex":""}` -> `Record<symbol, decimalString>` */
export const AllMidsResponseSchema = z.record(z.string(), z.string());
export type AllMidsResponse = z.infer<typeof AllMidsResponseSchema>;

/** One entry of `meta`'s `universe` array -- perpetual asset metadata. */
export const HyperliquidAssetMetaSchema = z.object({
  name: z.string(),
  szDecimals: z.number().int(),
  maxLeverage: z.number().int(),
  onlyIsolated: z.boolean().optional(),
  isDelisted: z.boolean().optional(),
});
export type HyperliquidAssetMeta = z.infer<typeof HyperliquidAssetMetaSchema>;

/** `{"type":"meta","dex":""}` response -- only the fields this app uses. */
export const HyperliquidMetaResponseSchema = z.object({
  universe: z.array(HyperliquidAssetMetaSchema),
});
export type HyperliquidMetaResponse = z.infer<typeof HyperliquidMetaResponseSchema>;

export const SUPPORTED_CANDLE_INTERVALS = ['1m', '5m', '15m', '1h'] as const;
export type CandleInterval = (typeof SUPPORTED_CANDLE_INTERVALS)[number];

/**
 * One candle as returned by `candleSnapshot` (REST) or pushed by the
 * `candle` WS channel. Hyperliquid's own field names are single letters
 * (`t`/`T`/`s`/`i`/`o`/`c`/`h`/`l`/`v`/`n`) -- kept as-is at this parsing
 * boundary (matching the wire contract exactly, the same rationale as
 * `hyperliquid-real.ts`'s existing FundingRateRes) and translated to the
 * descriptive `NormalizedCandle` shape below for everything downstream.
 */
export const HyperliquidCandleSchema = z.object({
  t: z.number().int(), // open time, ms epoch
  T: z.number().int(), // close time, ms epoch
  s: z.string(), // symbol
  i: z.string(), // interval
  o: decimalString,
  c: decimalString,
  h: decimalString,
  l: decimalString,
  v: decimalString,
  n: z.number().int(), // trade count
});
export type HyperliquidCandle = z.infer<typeof HyperliquidCandleSchema>;

export const HyperliquidCandleSnapshotResponseSchema = z.array(HyperliquidCandleSchema);

/** `{"type":"fundingHistory","coin","startTime","endTime"?}` entry. */
export const HyperliquidFundingHistoryEntrySchema = z.object({
  coin: z.string(),
  fundingRate: decimalString,
  premium: decimalString,
  time: z.number().int(),
});
export type HyperliquidFundingHistoryEntry = z.infer<typeof HyperliquidFundingHistoryEntrySchema>;
export const HyperliquidFundingHistoryResponseSchema = z.array(HyperliquidFundingHistoryEntrySchema);

/**
 * This system's own normalized candle shape -- what every consumer
 * (ingestion, future chart/backtest code) works with, independent of which
 * provider produced it. Covers the mission's "required data contracts"
 * list for the fields Hyperliquid's public API actually provides;
 * `sequence`/sub-field ordering info is *not* provided by this API and is
 * deliberately omitted here rather than fabricated.
 */
export interface NormalizedCandle {
  venue: 'hyperliquid';
  symbol: string;
  marketType: 'perp';
  interval: CandleInterval;
  openTime: Date;
  closeTime: Date;
  /** Hyperliquid's own candle timestamp (== closeTime for a closed candle). */
  sourceTimestamp: Date;
  /** When this server received/computed the candle -- distinct from sourceTimestamp. */
  receivedAt: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  /** True once `closeTime` has passed relative to sourceTimestamp -- an in-progress candle can still be pushed. */
  closed: boolean;
}

export function normalizeHyperliquidCandle(candle: HyperliquidCandle, receivedAt: Date): NormalizedCandle {
  const interval = candle.i as CandleInterval;
  return {
    venue: 'hyperliquid',
    symbol: candle.s,
    marketType: 'perp',
    interval,
    openTime: new Date(candle.t),
    closeTime: new Date(candle.T),
    sourceTimestamp: new Date(candle.T),
    receivedAt,
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
    volume: candle.v,
    closed: candle.T <= receivedAt.getTime(),
  };
}

export const MarketSnapshotSourceSchema = z.enum(['hyperliquid', 'coingecko']);
export type MarketSnapshotSource = z.infer<typeof MarketSnapshotSourceSchema>;

/**
 * One entry of `metaAndAssetCtxs`'s second array element -- live per-asset
 * context, index-aligned with `meta`'s `universe` array (same position,
 * same asset). `midPx` can be `null` (Hyperliquid falls back to no mid
 * during e.g. a very illiquid moment); `markPx` doesn't have that gap, so
 * ingestion prefers `midPx` but falls back to `markPx` rather than the
 * whole row failing.
 */
export const HyperliquidAssetCtxSchema = z.object({
  dayNtlVlm: decimalString,
  funding: decimalString,
  markPx: decimalString,
  midPx: decimalString.nullable(),
  prevDayPx: decimalString,
});
export type HyperliquidAssetCtx = z.infer<typeof HyperliquidAssetCtxSchema>;

/** `{"type":"metaAndAssetCtxs","dex":""}` -> `[meta, assetCtxs[]]`, index-aligned to `meta.universe`. */
export const HyperliquidMetaAndAssetCtxsResponseSchema = z.tuple([
  HyperliquidMetaResponseSchema,
  z.array(HyperliquidAssetCtxSchema),
]);

/** One asset's metadata merged with its live context -- what ingestion actually consumes. */
export interface HyperliquidAssetSnapshot {
  symbol: string;
  szDecimals: number;
  maxLeverage: number;
  /** midPx if available, else markPx -- see HyperliquidAssetCtxSchema's docstring. */
  price: string;
  changePercent24h: number;
  volume24h: string;
}

/**
 * Zips `meta.universe` with its index-aligned `assetCtxs`, computing a 24h
 * percent change from `prevDayPx` -> current price (Hyperliquid's REST API
 * doesn't return a pre-computed percentage, only the two price points).
 * Extra/missing entries from a length mismatch between the two arrays are
 * dropped rather than guessed at -- a real API-contract-drift signal, not
 * something to paper over with a default.
 */
export function zipMetaAndAssetCtxs(
  universe: HyperliquidAssetMeta[],
  assetCtxs: HyperliquidAssetCtx[],
): HyperliquidAssetSnapshot[] {
  const length = Math.min(universe.length, assetCtxs.length);
  const result: HyperliquidAssetSnapshot[] = [];
  for (let i = 0; i < length; i++) {
    const asset = universe[i];
    const ctx = assetCtxs[i];
    const price = ctx.midPx ?? ctx.markPx;
    const prevDayPx = Number(ctx.prevDayPx);
    const changePercent24h = prevDayPx > 0 ? ((Number(price) - prevDayPx) / prevDayPx) * 100 : 0;
    result.push({
      symbol: asset.name,
      szDecimals: asset.szDecimals,
      maxLeverage: asset.maxLeverage,
      price,
      changePercent24h,
      volume24h: ctx.dayNtlVlm,
    });
  }
  return result;
}
