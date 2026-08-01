export interface MarketDataHealth {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  consecutiveFailures: number;
  healthy: boolean;
}

/** 'coingecko' means the Hyperliquid fetch failed this cycle -- display-only fallback, see DATA-HL-001. */
export type MarketSnapshotSource = 'hyperliquid' | 'coingecko';

export interface MarketSnapshot {
  id: string;
  symbol: string;
  price: string;
  volume: string;
  change24h: string;
  updatedAt: string;
  stale: boolean;
  source: MarketSnapshotSource;
  szDecimals: number | null;
  maxLeverage: number | null;
}

export const SUPPORTED_CANDLE_INTERVALS = ['1m', '5m', '15m', '1h'] as const;
export type CandleInterval = (typeof SUPPORTED_CANDLE_INTERVALS)[number];

/** Matches server/src/schemas/marketData.ts's NormalizedCandle, as returned by GET /api/markets/:symbol/candles. */
export interface Candle {
  id: string;
  venue: string;
  symbol: string;
  marketType: string;
  interval: CandleInterval;
  openTime: string;
  closeTime: string;
  sourceTimestamp: string;
  receivedAt: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closed: boolean;
  createdAt: string;
}
