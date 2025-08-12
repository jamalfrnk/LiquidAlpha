import { db } from './db/index';
import { priceHistory } from './db/schema';
import { eq } from 'drizzle-orm';

export interface PricePoint {
  symbol: string;
  price: number;
  timestamp?: Date;
}

export async function addPricePoints(points: PricePoint[]): Promise<void> {
  const rows = points.map((p) => ({
    symbol: p.symbol,
    price: p.price,
    timestamp: p.timestamp ?? new Date(),
  }));
  await db.insert(priceHistory).values(rows);
}

export async function getPriceHistory(symbol: string, limit = 100) {
  return await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.symbol, symbol))
    .orderBy(priceHistory.timestamp.desc())
    .limit(limit);
}
