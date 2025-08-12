import { db } from './db/index';
import { signals } from './db/schema';
import { getPriceHistory } from './price-history';

// Generate trading signals based on recent price history
export async function generateSignals() {
  const symbols = ['BTC', 'ETH', 'SOL'];
  for (const symbol of symbols) {
    const history = await getPriceHistory(symbol, 2);
    // Need at least two data points to compute change
    if (history.length < 2) continue;
    // Latest price is first element, previous is second (since getPriceHistory returns ordered by timestamp desc)
    const latest = parseFloat((history[0] as any).price);
    const previous = parseFloat((history[1] as any).price);
    const change = ((latest - previous) / previous) * 100;
    // Only generate signals when change magnitude exceeds 1%
    if (Math.abs(change) < 1) {
      continue;
    }
    const signalType = change > 0 ? 'LONG' : 'SHORT';
    // Confidence scaled by absolute percent change (capped at 100)
    const confidence = Math.min(Math.abs(change) * 10, 100);
    await db.insert(signals).values({
      asset: symbol,
      signalType,
      confidence,
      active: true,
    });
  }
}
