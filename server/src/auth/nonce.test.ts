import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbChain } from '../test-utils/dbMock';

const deleteMock = vi.fn();
const insertMock = vi.fn();

vi.mock('../db/index', () => ({
  db: {
    delete: (...args: unknown[]) => deleteMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

// vitest hoists `vi.mock` calls above imports, so `./nonce` picks up the
// mocked `../db/index` even though this import appears after it textually.
import { issueNonce, consumeNonce } from './nonce';

/**
 * Regression coverage for SEC-017: nonce replay must be impossible and an
 * expired nonce must never verify, regardless of what the client claims.
 * `nonce.ts` has no prior test file -- these are the first tests to exercise
 * it, using the mocked `db` chain from `test-utils/dbMock` since no live
 * Postgres is available in this environment.
 */
describe('issueNonce', () => {
  beforeEach(() => {
    deleteMock.mockReset().mockReturnValue(dbChain([]));
    insertMock.mockReset().mockReturnValue(dbChain([]));
  });

  it('clears any prior outstanding nonce for the same address/chain before issuing a new one', async () => {
    await issueNonce('0xabc', 'evm');
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('issues a random, sufficiently long nonce with an expiry in the future', async () => {
    const issued = await issueNonce('0xabc', 'evm');
    expect(issued.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(issued.issuedAt.getTime());
  });
});

describe('consumeNonce', () => {
  beforeEach(() => {
    deleteMock.mockReset();
  });

  it('fails with "not_found" when no nonce row exists for the address/chain', async () => {
    deleteMock.mockReturnValue(dbChain([]));
    const result = await consumeNonce('0xabc', 'evm');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('fails with "expired" when the stored expiry is in the past, even though a row existed', async () => {
    const past = new Date(Date.now() - 1000);
    deleteMock.mockReturnValue(
      dbChain([{ address: '0xabc', chain: 'evm', nonce: 'deadbeef', createdAt: new Date(Date.now() - 2000), expiresAt: past }]),
    );
    const result = await consumeNonce('0xabc', 'evm');
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('succeeds when a row exists and its expiry is in the future', async () => {
    const future = new Date(Date.now() + 60_000);
    const issuedAt = new Date();
    deleteMock.mockReturnValue(dbChain([{ address: '0xabc', chain: 'evm', nonce: 'deadbeef', createdAt: issuedAt, expiresAt: future }]));
    const result = await consumeNonce('0xabc', 'evm');
    expect(result).toEqual({ ok: true, nonce: 'deadbeef', issuedAt, expiresAt: future });
  });

  it('rejects replay: consuming the same nonce twice fails the second time', async () => {
    const future = new Date(Date.now() + 60_000);
    // First call: the database still has the row (this is what "delete ...
    // returning" would produce on the one and only time the row exists).
    deleteMock.mockReturnValueOnce(
      dbChain([{ address: '0xabc', chain: 'evm', nonce: 'deadbeef', createdAt: new Date(), expiresAt: future }]),
    );
    // Second call: the row is already gone -- a real `DELETE ... RETURNING`
    // against the same primary key returns nothing once it's been deleted.
    deleteMock.mockReturnValueOnce(dbChain([]));

    const first = await consumeNonce('0xabc', 'evm');
    const second = await consumeNonce('0xabc', 'evm');

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: 'not_found' });
  });
});
