import type { CandleInterval, MarketSnapshotSource } from '../markets/types';

export type { CandleInterval };

export const TRACKED_SYMBOLS = ['BTC', 'ETH', 'SOL'] as const;
export type TrackedSymbol = (typeof TRACKED_SYMBOLS)[number];

/**
 * A single OHLC point in the shape the chart renderer actually needs --
 * numeric, epoch-seconds `time` (lightweight-charts' own convention),
 * independent of both the server's string-decimal wire format and
 * whichever charting library is adopted. `chartAdapter.ts` is the only
 * file that converts to/from a specific library's shape; everything else
 * in this feature depends on this type instead.
 */
export interface ChartPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLoadState = 'loading' | 'empty' | 'error' | 'ready';

/**
 * How trustworthy the *current price* shown alongside the chart is --
 * distinct from ChartLoadState, which is about the candle series itself.
 * `stale` mirrors the server's own staleness flag (server/src/market-data/
 * ingestion.ts's STALE_AFTER_MS); `fallback` means the row came from
 * CoinGecko, not Hyperliquid (see MarketSnapshotSource) -- shown
 * separately so a viewer never mistakes a CoinGecko-sourced price for a
 * Hyperliquid one.
 */
export interface PriceFreshness {
  stale: boolean;
  source: MarketSnapshotSource;
  updatedAt: string;
}
