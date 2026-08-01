import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { users } from '../db/schema';
import type { Chain } from './chain';

function generateBuilderCode(): string {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * Finds the user row for this address, creating one on first successful
 * login. There's a small window between the select and insert where a
 * concurrent first-login for the same address could race (both find no
 * row, both try to insert) -- `users.address` is unique, so the loser's
 * insert fails cleanly rather than creating a duplicate; a real
 * upsert-on-conflict is deferred to the schema-hardening pass (migration
 * step 6), which is where `builderCode`'s own constraints are being
 * revisited anyway.
 */
export async function findOrCreateUser(address: string, chain: Chain) {
  const [existing] = await db.select().from(users).where(eq(users.address, address)).limit(1);
  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(users)
    .values({ address, chain, builderCode: generateBuilderCode() })
    .returning();
  return created;
}

/**
 * Creates a brand-new guest-practice identity -- no wallet, no signature,
 * no existing-user lookup (unlike findOrCreateUser above, every call
 * creates a fresh row; the *session* is what persists a guest's identity
 * across requests/refreshes, the same as it does for a wallet user).
 * `address`/`chain` get synthetic-but-unique values rather than nullable
 * columns -- see the `users.kind` doc comment in db/schema.ts for why that
 * keeps every downstream consumer (risk engine, execution, analytics)
 * working unmodified.
 */
export async function createGuestUser() {
  const address = `guest:${crypto.randomUUID()}`;
  const [created] = await db
    .insert(users)
    .values({ address, chain: 'guest', builderCode: generateBuilderCode(), kind: 'guest' })
    .returning();
  return created;
}
