import { db } from './db/index';
import { signals } from './db/schema';
import { getPriceHistory, HISTORY_LIMIT } from './price-history';
import { ema, macd, rsi } from './indicators';

/**
 * Signal generation engine.
 *
 * This module implements a simplified multi‑indicator strategy inspired by
 * Pine Script.  The generator loops over a predefined list of symbols,
 * retrieves their recent price history and calculates a set of indicators
 * (EMA50/EMA200 crossover, MACD histogram and RSI).  Based on the
 * alignment of these indicators a trading signal is produced with a
 * corresponding confidence score.  If the data series is too short for
 * accurate indicator calculation the symbol is skipped.
 */

/**
 * Generates trading signals for a fixed set of assets.  The resulting
 * signals are inserted into the `signals` table.  The function is idempotent
 * across calls: it does not deactivate or delete old signals; consumers
 * should interpret the most recent signals per asset as the current
 * recommendation.
 */
export async function generateSignals(): Promise<void> {
  const symbols = ['BTC', 'ETH', 'SOL'];
  for (const symbol of symbols) {
    // Fetch up to HISTORY_LIMIT bars for the symbol.  We need at least 210
    // observations for EMA200 to be meaningful (see PDF specification).
    const history = await getPriceHistory(symbol, HISTORY_LIMIT);
    if (history.length < 210) {
      console.warn(`Skipping ${symbol}: not enough history (${history.length} < 210)`);
      continue;
    }
    // Extract closing prices as numbers in ascending order (oldest first)
    const closes = history.map((row: any) => parseFloat(row.price)).reverse();
    // Calculate indicators
    const ema50 = ema(closes, 50);
    const ema200 = ema(closes, 200);
    const macdObj = macd(closes, 12, 26, 9);
    const macdHist = macdObj.hist;
    const rsiSeries = rsi(closes, 14);
    // Determine trend direction based on EMA cross
    const latestEma50 = ema50[ema50.length - 1];
    const latestEma200 = ema200[ema200.length - 1];
    const trendBullish = latestEma50 > latestEma200;
    const latestMacdHist = macdHist[macdHist.length - 1];
    const momentumBullish = latestMacdHist > 0;
    const latestRsi = rsiSeries[rsiSeries.length - 1];
    // In RSI interpretation, values above 70 suggest overbought (bearish), below 30 oversold (bullish)
    let rsiBullish: boolean;
    if (isNaN(latestRsi)) {
      rsiBullish = false;
    } else if (latestRsi < 30) {
      rsiBullish = true;
    } else if (latestRsi > 70) {
      rsiBullish = false;
    } else {
      // Neutral range (30‑70) is treated as neutral; align with trend
      rsiBullish = trendBullish;
    }
    // Determine final signal direction.  Require trend and momentum to agree.
    const bullish = trendBullish && momentumBullish;
    const bearish = !trendBullish && !momentumBullish;
    if (!bullish && !bearish) {
      // Conflicting indicators: skip creating a signal
      console.info(`Skipping ${symbol}: conflicting trend/momentum`);
      continue;
    }
    // Build confidence score.  Start at 60 and add points for each confirming indicator.
    let confidence = 60;
    if ((bullish || bearish) && Math.abs(latestMacdHist) > 0) confidence += 10;
    if (Math.abs(latestEma50 - latestEma200) / latestEma200 > 0.005) confidence += 10;
    if (rsiBullish === bullish) confidence += 10;
    if (confidence > 100) confidence = 100;
    // Determine signal type string
    const signalType = bullish ? 'LONG' : 'SHORT';
    // Insert the signal into the database
    await db.insert(signals).values({
      asset: symbol,
      signalType,
      confidence,
      active: true,
    });
  }
}
