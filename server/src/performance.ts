import { db } from './db/index';
import { performance } from './db/schema';
import { eq } from 'drizzle-orm';

/**
 * A performance record captures a realised profit or loss event for a user.
 * PnL values are stored as numeric strings in the database, therefore
 * consumers should parse them into numbers when performing calculations.
 */
export interface PerformanceRecord {
  id: string;
  userId: string;
  pnl: number;
  timestamp: Date;
}

/**
 * Inserts a single performance entry into the database for the given user.
 * Use this function after a trade has been executed to record the outcome.
 *
 * @param userId – the ID of the user
 * @param pnl – profit and loss measured in quote currency
 */
export async function recordPerformance(userId: string, pnl: number): Promise<void> {
  await db.insert(performance).values({ userId, pnl });
}

/**
 * Retrieves all performance records for a given user.  Records are returned
 * unsorted; you can sort them client‑side if required.
 *
 * @param userId – the ID of the user
 * @returns an array of performance records
 */
export async function getPerformance(userId: string): Promise<PerformanceRecord[]> {
  const records = await db
    .select()
    .from(performance)
    .where(eq(performance.userId, userId));
  return records as any;
}

/**
 * Computes the sum of all realised profits and losses across all users.
 * This can be used to measure the aggregate performance of the platform.
 *
 * @returns the total PnL across all performance records
 */
export async function getOverallPerformance(): Promise<number> {
  const records = await db.select().from(performance);
  return records.reduce((sum: number, rec: any) => sum + parseFloat(rec.pnl), 0);
}
