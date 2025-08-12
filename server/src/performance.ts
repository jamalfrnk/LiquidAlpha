import { db } from './db/index';
import { performance } from './db/schema';
import { eq } from 'drizzle-orm';

export interface PerformanceRecord {
  id: string;
  userId: string;
  pnl: number;
  timestamp: Date;
}

export async function recordPerformance(userId: string, pnl: number): Promise<void> {
  await db.insert(performance).values({ userId, pnl });
}

export async function getPerformance(userId: string): Promise<PerformanceRecord[]> {
  const records = await db.select().from(performance).where(eq(performance.userId, userId));
  return records as any;
}

export async function getOverallPerformance(): Promise<number> {
  const records = await db.select().from(performance);
  return records.reduce((sum: number, rec: any) => sum + parseFloat(rec.pnl), 0);
}
