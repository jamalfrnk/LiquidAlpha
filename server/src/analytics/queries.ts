import { and, eq } from 'drizzle-orm';
import { db } from '../db/index';
import { positions } from '../db/schema';
import type { ClosedTrade } from './metrics';

/**
 * Real closed-trade data only -- CLOSED positions with a recorded
 * `realizedPnl` (set by `execution/paperEngine.ts`'s `closePosition`).
 * Scoped to `environment = 'paper'` explicitly rather than "all positions
 * for this user": every position is 'paper' today (this is the only
 * implemented execution mode), but filtering explicitly means a future
 * testnet/production environment can't silently get mixed into the same
 * risk-adjusted-ratio/drawdown calculation without this query being
 * revisited on purpose.
 */
export async function getClosedPaperTrades(userId: string): Promise<ClosedTrade[]> {
  const rows = await db
    .select()
    .from(positions)
    .where(and(eq(positions.userId, userId), eq(positions.status, 'CLOSED'), eq(positions.environment, 'paper')));

  return rows
    .filter((row) => row.realizedPnl !== null && row.closedAt !== null)
    .map((row) => ({
      realizedPnl: parseFloat(row.realizedPnl!),
      notional: parseFloat(row.entryPrice) * parseFloat(row.quantity),
      closedAt: row.closedAt!,
    }));
}
