import { db } from '../db/index';
import { markets } from '../db/schema';
import { addPricePoints, pruneOldPriceHistory } from '../price-history';
import { fetchMarketData, type MarketData } from './coingecko';

export type BroadcastFn = (event: string, payload: unknown) => void;

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
}

let lastSuccessAt: Date | null = null;
let lastAttemptAt: Date | null = null;
let consecutiveFailures = 0;

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
  };
}

/**
 * Fetches current prices and, on success, persists a market snapshot +
 * price-history point per symbol, prunes old history, and broadcasts the
 * update. On failure, does nothing except record the failure for
 * getIngestionHealth() -- no fake data is substituted (unlike the Replit
 * reference app's Math.random() fallback), so a down feed shows up as
 * stale `updatedAt` timestamps rather than fabricated prices.
 */
export async function runIngestionCycle(broadcast: BroadcastFn): Promise<void> {
  lastAttemptAt = new Date();
  const data: MarketData | undefined = await fetchMarketData();

  if (!data) {
    consecutiveFailures += 1;
    return;
  }

  consecutiveFailures = 0;
  lastSuccessAt = lastAttemptAt;

  const timestamp = new Date();
  for (const symbol of Object.keys(data) as Array<keyof MarketData>) {
    const { price, change24h, volume } = data[symbol];

    await db.insert(markets).values({
      symbol,
      price: price.toString(),
      change24h: change24h.toString(),
      volume: volume.toString(),
    });
    await addPricePoints([{ symbol, price, timestamp }]);
    await pruneOldPriceHistory(symbol);

    broadcast('marketUpdate', { symbol, price, change24h, volume, timestamp });
  }
}
