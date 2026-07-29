import { db } from './db/index';
import { priceHistory } from './db/schema';
import { and, desc, eq, lt } from 'drizzle-orm';

/**
 * Maximum number of price points to retain per symbol.  Technical indicators
 * such as EMA200 require a minimum of 200 bars; using a buffer of 256 ensures
 * stability while not storing unnecessary historical data.  Increase this
 * value if you need longer lookbacks.
 */
export const HISTORY_LIMIT = 256;

/**
 * Represents a single price observation for an asset.  The `timestamp`
 * property is optional; if omitted the current date/time will be used.
 */
export interface PricePoint {
  symbol: string;
  price: number;
  timestamp?: Date;
}

/**
 * Inserts an array of price observations into the `price_history` table.
 * Clients should batch writes to this function to minimise database round trips.
 * Older rows are not purged here -- call pruneOldPriceHistory (below) after
 * writing to bound table growth per symbol.
 *
 * @param points – an array of price observations to store
 */
export async function addPricePoints(points: PricePoint[]): Promise<void> {
  // Construct rows using the provided timestamp or the current time.
  const rows = points.map((p) => ({
    symbol: p.symbol,
    price: p.price.toString(),
    timestamp: p.timestamp ?? new Date(),
  }));
  await db.insert(priceHistory).values(rows);
}

/**
 * Retrieves price history for a given symbol ordered by descending timestamp.
 *
 * @param symbol – the asset symbol to query
 * @param limit – maximum number of rows to return (default 100)
 * @returns an array of price history rows; the most recent observation is first
 */
export async function getPriceHistory(symbol: string, limit = 100) {
  return await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.symbol, symbol))
    .orderBy(desc(priceHistory.timestamp))
    .limit(limit);
}

/**
 * Deletes rows for `symbol` beyond the most recent `keep` (defaulting to
 * HISTORY_LIMIT), bounding table growth. The table was growing unbounded
 * forever -- a new row every ~10s, with HISTORY_LIMIT defined but never
 * enforced (GH audit finding F-7). Finds the cutoff timestamp (the Nth most
 * recent row) and deletes anything older, rather than a subquery-based
 * "delete all except these ids", which is simpler to reason about and just
 * as correct here since `timestamp` is monotonic per insert.
 */
export async function pruneOldPriceHistory(symbol: string, keep: number = HISTORY_LIMIT): Promise<void> {
  const [cutoffRow] = await db
    .select({ timestamp: priceHistory.timestamp })
    .from(priceHistory)
    .where(eq(priceHistory.symbol, symbol))
    .orderBy(desc(priceHistory.timestamp))
    .limit(1)
    .offset(keep - 1);

  if (!cutoffRow) return; // fewer than `keep` rows exist yet -- nothing to prune

  await db
    .delete(priceHistory)
    .where(and(eq(priceHistory.symbol, symbol), lt(priceHistory.timestamp, cutoffRow.timestamp)));
}
