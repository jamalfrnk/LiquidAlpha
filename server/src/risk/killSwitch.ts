import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { riskLimits } from '../db/schema';
import { env } from '../config/env';

/** Deploy-gated emergency stop -- see the comment on GLOBAL_KILL_SWITCH in config/env.ts for why. */
export function isGloballyHalted(): boolean {
  return env.GLOBAL_KILL_SWITCH;
}

/**
 * Self-service per-user halt. A user with no risk_limits row yet has
 * never touched their settings, so there's nothing to be halted by --
 * defaults to false rather than requiring a row to exist first.
 */
export async function isUserHalted(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ killSwitchEnabled: riskLimits.killSwitchEnabled })
    .from(riskLimits)
    .where(eq(riskLimits.userId, userId))
    .limit(1);
  return row?.killSwitchEnabled ?? false;
}
