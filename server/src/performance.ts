import { db } from './db/index';
import { performance } from './db/schema';
import { eq } from 'drizzle-orm';

/**
 * DEAD CODE, kept in place rather than deleted in this pass -- nothing in
 * the current codebase calls `recordPerformance`, `getPerformance`, or
 * `getOverallPerformance` (verified via a repo-wide grep during DATA-015).
 * This module predates the real execution domain (`execution/paperEngine.ts`,
 * PR #14) and is keyed by `signalId` against a separate `performance` table
 * -- incompatible with the actual closed-trade data model, which lives on
 * `positions.realizedPnl`/`positions.closedAt`. Real performance analytics
 * are implemented in `analytics/metrics.ts` + `analytics/queries.ts` against
 * `positions`, not this file. Flagged here rather than removed because
 * deleting it doesn't fall within this issue's scope and the `performance`
 * DB table it depends on is a separate, out-of-scope migration decision.
 */

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
 * @param signalId – the ID of the signal this performance entry is tied to
 * @param pnl – profit and loss measured in quote currency
 * @param isOpen – whether the position is still open (defaults to true for a freshly recorded trade)
 */
export async function recordPerformance(
  userId: string,
  signalId: string,
  pnl: number,
  isOpen = true,
): Promise<void> {
  await db.insert(performance).values({ userId, signalId, pnl: pnl.toString(), isOpen });
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
