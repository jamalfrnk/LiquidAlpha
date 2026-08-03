import { createHash } from 'crypto';
import { fetchCandleSnapshot, fetchFundingHistory } from '../hyperliquid-real';
import { db } from '../db/index';
import { candles } from '../db/schema';
import type { NormalizedCandle, HyperliquidFundingHistoryEntry, CandleInterval } from '../schemas/marketData';
import { MAX_BACKTEST_CANDLES_PER_SYMBOL } from '../schemas/backtest';

/**
 * Fetches historical candles for exactly the requested range directly from
 * Hyperliquid (rather than relying on whatever the live 10s/60s ingestion
 * cycles happen to have already accumulated in `candles` -- that cycle only
 * keeps a short rolling window per symbol/interval, nowhere near enough
 * depth for an arbitrary historical backtest range). The fetched candles
 * are still upserted into `candles` afterward (same conflict target as
 * `market-data/ingestion.ts`'s `runCandleBackfillCycle`), so a repeated or
 * overlapping backtest range benefits chart UI too -- but the engine itself
 * never trusts the DB as its primary source, only Hyperliquid's own
 * response for this exact call, which is what makes the run's `datasetVersion`
 * hash meaningful.
 *
 * In-progress (not yet closed) candles are filtered out entirely -- an
 * incomplete candle's close price isn't the real close, and including one
 * would be a live-data leak into what's supposed to be a fixed historical
 * simulation.
 */
export async function fetchAndCacheCandles(
  symbol: string,
  interval: CandleInterval,
  startTimeMs: number,
  endTimeMs: number,
): Promise<NormalizedCandle[]> {
  const fetched = await fetchCandleSnapshot(symbol, interval, startTimeMs, endTimeMs);
  const closedOnly = fetched.filter((c) => c.closed).sort((a, b) => a.openTime.getTime() - b.openTime.getTime());

  if (closedOnly.length > MAX_BACKTEST_CANDLES_PER_SYMBOL) {
    throw new Error(
      `Requested range for ${symbol} would use ${closedOnly.length} candles, exceeding the ${MAX_BACKTEST_CANDLES_PER_SYMBOL}-candle-per-symbol cap -- narrow the date range or use a larger interval.`,
    );
  }

  for (const candle of closedOnly) {
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

  return closedOnly;
}

/** Funding history for one symbol over the exact backtest range -- empty array (never thrown) if Hyperliquid has none for this range, since the engine already treats "no funding data" as "zero funding cost" rather than an error. */
export async function fetchFundingForRange(
  symbol: string,
  startTimeMs: number,
  endTimeMs: number,
): Promise<HyperliquidFundingHistoryEntry[]> {
  try {
    return await fetchFundingHistory(symbol, startTimeMs, endTimeMs);
  } catch {
    return [];
  }
}

/**
 * Identifies exactly which candles a run actually used, without storing
 * the candle data itself in the run's config -- a hash of every symbol's
 * ordered (openTime, close) pairs, so two runs over the same nominal date
 * range can be told apart if the underlying data was later corrected
 * (e.g. Hyperliquid revising a candle) or if the range genuinely differs.
 */
export function computeDatasetVersion(candlesBySymbol: Record<string, NormalizedCandle[]>): string {
  const hash = createHash('sha256');
  for (const symbol of Object.keys(candlesBySymbol).sort()) {
    for (const candle of candlesBySymbol[symbol]) {
      hash.update(`${symbol}|${candle.openTime.toISOString()}|${candle.close}`);
    }
  }
  return hash.digest('hex');
}
