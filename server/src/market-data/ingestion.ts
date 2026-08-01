import { db } from '../db/index';
import { markets, candles } from '../db/schema';
import { addPricePoints, pruneOldPriceHistory } from '../price-history';
import { fetchMarketData, type MarketData } from './coingecko';
import { fetchMetaAndAssetCtxs, fetchCandleSnapshot } from '../hyperliquid-real';
import { log } from '../observability/logger';
import { SUPPORTED_CANDLE_INTERVALS, type CandleInterval, type HyperliquidAssetSnapshot } from '../schemas/marketData';

export type PublishMarketUpdateFn = (symbol: string, event: string, payload: unknown) => void;

/** The three assets this product tracks -- see docs/architecture/market-data.md. */
export const TRACKED_SYMBOLS = ['BTC', 'ETH', 'SOL'] as const;
export type TrackedSymbol = (typeof TRACKED_SYMBOLS)[number];

/**
 * How stale `markets.updatedAt` can be before a row should be treated as
 * unreliable by API consumers. Three missed ingestion cycles (the loop
 * runs every 10s in server.ts) rather than one, so a single slow fetch
 * doesn't flip everything to "stale" -- only a sustained outage does.
 */
export const STALE_AFTER_MS = 30_000;

interface IngestionHealth {
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  consecutiveFailures: number;
  healthy: boolean;
  /** Which provider produced the most recent successful cycle's data. */
  lastSuccessSource: 'hyperliquid' | 'coingecko' | null;
}

let lastSuccessAt: Date | null = null;
let lastAttemptAt: Date | null = null;
let consecutiveFailures = 0;
let lastSuccessSource: 'hyperliquid' | 'coingecko' | null = null;

export interface LastKnownMarketMeta {
  change24h: string;
  volume: string;
  source: 'hyperliquid' | 'coingecko';
}

/**
 * The most recent REST-derived 24h-change/volume/source per symbol --
 * kept so the Hyperliquid WS client (DATA-RECOVERY-001, see server.ts)
 * can publish a fresher current-*price* update without inventing values
 * for the fields the WS `allMids` push doesn't carry. The REST cycle
 * above remains the sole writer of this cache and of `markets` itself;
 * the WS path only ever reads it.
 */
const lastKnownMarketMeta = new Map<string, LastKnownMarketMeta>();

export function getLastKnownMarketMeta(symbol: string): LastKnownMarketMeta | undefined {
  return lastKnownMarketMeta.get(symbol);
}

/**
 * Current market-data feed health. `healthy` is false once there have been
 * 3 consecutive failed fetch attempts -- this is what a future
 * /api/market-data/health-style check (or the broader system health model
 * in migration step 16) reads instead of clients having to infer feed
 * health from silence.
 */
export function getIngestionHealth(): IngestionHealth {
  return {
    lastSuccessAt,
    lastAttemptAt,
    consecutiveFailures,
    healthy: consecutiveFailures < 3,
    lastSuccessSource,
  };
}

interface MarketRow {
  symbol: string;
  price: string;
  volume: string;
  change24h: string;
  source: 'hyperliquid' | 'coingecko';
  szDecimals?: number;
  maxLeverage?: number;
}

/**
 * Picks which provider's data to actually write this cycle -- pure and
 * DB-free so the sourcing decision (Hyperliquid primary, CoinGecko only
 * when Hyperliquid genuinely didn't cover our tracked symbols) is fully
 * unit-testable without a database. Per the mission's own constraint, a
 * CoinGecko row is still labeled `source: 'coingecko'` rather than
 * silently presented as Hyperliquid data.
 */
export function selectMarketRows(
  hyperliquidSnapshots: HyperliquidAssetSnapshot[] | undefined,
  coingeckoData: MarketData | undefined,
): MarketRow[] {
  if (hyperliquidSnapshots) {
    const bySymbol = new Map(hyperliquidSnapshots.map((s) => [s.symbol, s]));
    const rows: MarketRow[] = [];
    for (const symbol of TRACKED_SYMBOLS) {
      const snap = bySymbol.get(symbol);
      // Hyperliquid dropped/renamed a tracked symbol -- skip it rather than
      // guess at a substitute; CoinGecko fallback (below) only kicks in
      // when *none* of the tracked symbols came back, not per-symbol, to
      // avoid mixing providers within the same cycle's row set.
      if (snap) {
        rows.push({
          symbol,
          price: snap.price,
          volume: snap.volume24h,
          change24h: snap.changePercent24h.toString(),
          source: 'hyperliquid',
          szDecimals: snap.szDecimals,
          maxLeverage: snap.maxLeverage,
        });
      }
    }
    if (rows.length > 0) return rows;
  }

  if (!coingeckoData) return [];
  return (Object.keys(coingeckoData) as Array<keyof MarketData>).map((symbol) => ({
    symbol,
    price: coingeckoData[symbol].price.toString(),
    volume: coingeckoData[symbol].volume.toString(),
    change24h: coingeckoData[symbol].change24h.toString(),
    source: 'coingecko',
  }));
}

/**
 * Fetches current prices -- Hyperliquid primary, CoinGecko only as a
 * fallback when Hyperliquid didn't cover any tracked symbol this cycle --
 * and, on success, persists a market snapshot + price-history point per
 * symbol, prunes old history, and broadcasts the update. On failure, does
 * nothing except record the failure for getIngestionHealth() -- no fake
 * data is substituted (unlike the Replit reference app's Math.random()
 * fallback), so a down feed shows up as stale `updatedAt` timestamps
 * rather than fabricated prices.
 */
export async function runIngestionCycle(publishMarketUpdate: PublishMarketUpdateFn): Promise<void> {
  lastAttemptAt = new Date();

  let hyperliquidSnapshots: HyperliquidAssetSnapshot[] | undefined;
  try {
    hyperliquidSnapshots = await fetchMetaAndAssetCtxs();
  } catch (err) {
    log('error', 'hyperliquid_ingestion_failed', { error: err instanceof Error ? err.message : String(err) });
  }

  const hyperliquidCoversTrackedSymbols = hyperliquidSnapshots?.some((s) =>
    (TRACKED_SYMBOLS as readonly string[]).includes(s.symbol),
  );

  let coingeckoData: MarketData | undefined;
  if (!hyperliquidCoversTrackedSymbols) {
    coingeckoData = await fetchMarketData();
    if (coingeckoData) {
      log('warn', 'market_data_fallback_to_coingecko', { reason: 'hyperliquid_unavailable_or_missing_tracked_symbols' });
    }
  }

  const rows = selectMarketRows(hyperliquidSnapshots, coingeckoData);
  if (rows.length === 0) {
    consecutiveFailures += 1;
    return;
  }

  consecutiveFailures = 0;
  lastSuccessAt = lastAttemptAt;
  lastSuccessSource = rows[0].source;

  const timestamp = new Date();
  for (const row of rows) {
    // Upsert -- one row per symbol, updated in place. This used to be a
    // plain insert, which meant markets grew a new row every cycle forever
    // (see the schema.ts docstring for why that's wrong for a "current
    // snapshot" table).
    await db
      .insert(markets)
      .values({
        symbol: row.symbol,
        price: row.price,
        change24h: row.change24h,
        volume: row.volume,
        source: row.source,
        szDecimals: row.szDecimals,
        maxLeverage: row.maxLeverage,
      })
      .onConflictDoUpdate({
        target: markets.symbol,
        set: {
          price: row.price,
          change24h: row.change24h,
          volume: row.volume,
          source: row.source,
          szDecimals: row.szDecimals,
          maxLeverage: row.maxLeverage,
          updatedAt: timestamp,
        },
      });
    await addPricePoints([{ symbol: row.symbol, price: Number(row.price), timestamp }]);
    await pruneOldPriceHistory(row.symbol);
    lastKnownMarketMeta.set(row.symbol, { change24h: row.change24h, volume: row.volume, source: row.source });

    publishMarketUpdate(row.symbol, 'marketUpdate', {
      symbol: row.symbol,
      price: Number(row.price),
      change24h: Number(row.change24h),
      volume: Number(row.volume),
      source: row.source,
      timestamp,
    });
  }
}

/**
 * How far back to backfill each interval every cycle -- large enough that
 * at least a handful of candles exist per interval (a 1h candle needs a
 * multi-hour window to have *any* history at all, unlike 1m), small
 * enough to stay a cheap, bounded request. Comfortably overlaps the
 * previous cycle's coverage either way, since the upsert below makes
 * re-fetching the same window idempotent.
 */
const CANDLE_BACKFILL_WINDOW_MS: Record<CandleInterval, number> = {
  '1m': 5 * 60_000,
  '5m': 30 * 60_000,
  '15m': 90 * 60_000,
  '1h': 6 * 60 * 60_000,
};

/**
 * Fetches recent candles for each tracked symbol, at every interval this
 * app's chart UI offers (CHART-001), from Hyperliquid and upserts them
 * into `candles`, keyed by (symbol, interval, openTime) so a re-fetched
 * in-progress candle updates in place rather than duplicating.
 * Deliberately independent of `runIngestionCycle` above (different cadence
 * -- candles don't need 10s freshness) and has no CoinGecko fallback:
 * CoinGecko doesn't provide OHLCV candles via this app's existing adapter,
 * and per the mission's own constraint a fallback source must never
 * silently stand in for Hyperliquid-specific data like this.
 */
export async function runCandleBackfillCycle(): Promise<void> {
  const now = Date.now();

  for (const symbol of TRACKED_SYMBOLS) {
    for (const interval of SUPPORTED_CANDLE_INTERVALS) {
      try {
        const startTime = now - CANDLE_BACKFILL_WINDOW_MS[interval];
        const fetchedCandles = await fetchCandleSnapshot(symbol, interval, startTime, now);
        for (const candle of fetchedCandles) {
          await db
            .insert(candles)
            .values({
              venue: candle.venue,
              symbol: candle.symbol,
              marketType: candle.marketType,
              interval: candle.interval,
              openTime: candle.openTime,
              closeTime: candle.closeTime,
              sourceTimestamp: candle.sourceTimestamp,
              receivedAt: candle.receivedAt,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              volume: candle.volume,
              closed: candle.closed,
            })
            .onConflictDoUpdate({
              target: [candles.symbol, candles.interval, candles.openTime],
              set: {
                closeTime: candle.closeTime,
                sourceTimestamp: candle.sourceTimestamp,
                receivedAt: candle.receivedAt,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume,
                closed: candle.closed,
              },
            });
        }
      } catch (err) {
        log('error', 'candle_backfill_failed', {
          symbol,
          interval,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
