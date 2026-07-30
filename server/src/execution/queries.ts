import { and, count, eq } from 'drizzle-orm';
import { db } from '../db/index';
import { markets, positions } from '../db/schema';

export async function getMarketSnapshot(asset: string) {
  const [row] = await db.select().from(markets).where(eq(markets.symbol, asset)).limit(1);
  return row ?? null;
}

export async function countOpenPositions(userId: string): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(positions)
    .where(and(eq(positions.userId, userId), eq(positions.status, 'OPEN')));
  return value;
}

export async function getOpenPosition(userId: string, asset: string) {
  const [row] = await db
    .select()
    .from(positions)
    .where(and(eq(positions.userId, userId), eq(positions.asset, asset), eq(positions.status, 'OPEN')))
    .limit(1);
  return row ?? null;
}
