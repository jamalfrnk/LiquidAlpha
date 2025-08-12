import { db } from './db/index';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';

export interface User {
  id: string;
  address: string;
  builderCode: string;
  createdAt: Date;
}

export async function register(address: string, builderCode: string): Promise<User> {
  // Check if user exists
  const existing = await db.select().from(users).where(eq(users.address, address));
  if (existing.length > 0) {
    return existing[0] as any;
  }
  // Insert new user
  await db.insert(users).values({ address, builderCode });
  const inserted = await db.select().from(users).where(eq(users.address, address));
  return inserted[0] as any;
}

export async function login(address: string): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.address, address));
  if (result.length > 0) {
    return result[0] as any;
  }
  return null;
}
