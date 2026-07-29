import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index';
import { authNonces } from '../db/schema';
import { env } from '../config/env';
import type { Chain } from './chain';

export interface IssuedNonce {
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}

/**
 * Issues a fresh nonce for (address, chain). Any previously issued,
 * unconsumed nonce for the same address/chain is dropped first -- only one
 * nonce can be outstanding at a time, so requesting a new one invalidates
 * whatever was issued before rather than letting old nonces accumulate.
 */
export async function issueNonce(address: string, chain: Chain): Promise<IssuedNonce> {
  await db.delete(authNonces).where(and(eq(authNonces.address, address), eq(authNonces.chain, chain)));

  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + env.NONCE_TTL_SECONDS * 1000);

  await db.insert(authNonces).values({ address, chain, nonce, expiresAt, createdAt: issuedAt });

  return { nonce, issuedAt, expiresAt };
}

export type ConsumeNonceResult =
  | { ok: true; nonce: string; issuedAt: Date; expiresAt: Date }
  | { ok: false; reason: 'not_found' | 'expired' };

/**
 * Looks up and deletes the (sole, since issueNonce clears any prior one)
 * outstanding nonce row for (address, chain) in one step -- whether it's
 * valid or not, it's gone after this call, so the same nonce can never be
 * consumed twice (replay protection). The client never sends the raw nonce
 * value back explicitly; the server reconstructs the exact signed message
 * from this row's own nonce/issuedAt/expiresAt and verifies the signature
 * against that, which is what actually proves the wallet saw the real
 * nonce. Expiry is checked against the stored `expiresAt`, not anything the
 * client claims.
 */
export async function consumeNonce(address: string, chain: Chain): Promise<ConsumeNonceResult> {
  const rows = await db
    .delete(authNonces)
    .where(and(eq(authNonces.address, address), eq(authNonces.chain, chain)))
    .returning();

  const row = rows[0];
  if (!row) {
    return { ok: false, reason: 'not_found' };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, nonce: row.nonce, issuedAt: row.createdAt, expiresAt: row.expiresAt };
}
