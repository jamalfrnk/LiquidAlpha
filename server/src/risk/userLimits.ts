import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { riskLimits } from '../db/schema';

/**
 * Conservative defaults applied the first time a user's risk limits are
 * read -- deliberately cautious rather than permissive, since the
 * alternative (no row, no limit) would mean unlimited risk by default.
 */
export const DEFAULT_RISK_LIMITS = {
  maxPositionSize: 1000,
  maxLeverage: 10,
  maxOpenPositions: 5,
  maxDailyLossPercent: 5,
};

/** Fetches a user's risk limits, creating a row with conservative defaults on first access. */
export async function getOrCreateRiskLimits(userId: string) {
  const [existing] = await db.select().from(riskLimits).where(eq(riskLimits.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(riskLimits)
    .values({
      userId,
      maxPositionSize: DEFAULT_RISK_LIMITS.maxPositionSize.toString(),
      maxLeverage: DEFAULT_RISK_LIMITS.maxLeverage.toString(),
      maxOpenPositions: DEFAULT_RISK_LIMITS.maxOpenPositions,
      maxDailyLossPercent: DEFAULT_RISK_LIMITS.maxDailyLossPercent.toString(),
    })
    .returning();
  return created;
}
