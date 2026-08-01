import { sql } from 'drizzle-orm';
import { db } from '../db/index';
import { getIngestionHealth } from '../market-data/ingestion';

export interface ReadinessCheck {
  ok: boolean;
  error?: string;
}

export interface ReadinessResult {
  ready: boolean;
  checks: {
    database: ReadinessCheck;
    marketData: ReadinessCheck & { consecutiveFailures: number };
  };
}

/**
 * Distinguishes "process is up" (liveness, /api/health) from "dependencies
 * are actually usable" (readiness, /api/ready) -- a process that's running
 * but can't reach Postgres, or whose market-data feed has failed 3+ cycles
 * in a row, should not report itself as ready even though it would happily
 * answer a liveness ping. Split into its own module (not inlined in
 * server.ts) specifically so it's unit-testable without importing
 * server.ts, which connects to a real database and starts background
 * intervals as a side effect of being imported at all.
 */
export async function checkReadiness(): Promise<ReadinessResult> {
  const database = await checkDatabase();
  const ingestion = getIngestionHealth();
  const marketData: ReadinessCheck & { consecutiveFailures: number } = {
    ok: ingestion.healthy,
    consecutiveFailures: ingestion.consecutiveFailures,
  };

  return {
    ready: database.ok && marketData.ok,
    checks: { database, marketData },
  };
}

async function checkDatabase(): Promise<ReadinessCheck> {
  try {
    await db.execute(sql`select 1`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown database error' };
  }
}
