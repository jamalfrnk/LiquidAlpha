import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbChain } from '../test-utils/dbMock';

const insertMock = vi.fn();

vi.mock('../db/index', () => ({
  db: {
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

// vitest hoists `vi.mock` above imports, so `./users` picks up the mocked
// `../db/index` even though this import appears after it textually.
import { createGuestUser } from './users';

/**
 * AUTH-GUEST-001: createGuestUser is what backs POST /api/auth/guest.
 * Unit-tested against a mocked `db` (no live Postgres in this
 * environment), matching the existing convention for this module's sibling
 * auth files (nonce.test.ts, etc.) -- no dedicated router-level integration
 * test exists for /api/auth/nonce or /api/auth/verify either, so the
 * router's own wiring for /guest is verified manually against a real local
 * stack instead (see the PR description), not duplicated here.
 */
describe('createGuestUser', () => {
  const insertedRow = {
    id: 'guest-row-id',
    address: 'guest:placeholder',
    chain: 'guest',
    builderCode: 'abc123',
    kind: 'guest' as const,
    createdAt: new Date(),
  };

  let valuesArg: Record<string, unknown> | undefined;

  beforeEach(() => {
    valuesArg = undefined;
    insertMock.mockReset().mockReturnValue({
      values: (v: Record<string, unknown>) => {
        valuesArg = v;
        return dbChain([insertedRow]);
      },
    });
  });

  it('inserts exactly one new row per call -- never looks up an existing user first', async () => {
    await createGuestUser();

    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('generates a synthetic, unique address and marks the row kind "guest"', async () => {
    await createGuestUser();

    expect(valuesArg).toBeDefined();
    expect(valuesArg!.kind).toBe('guest');
    expect(valuesArg!.chain).toBe('guest');
    expect(typeof valuesArg!.address).toBe('string');
    expect(valuesArg!.address as string).toMatch(/^guest:[0-9a-f-]{36}$/);
  });

  it('generates a different address on every call (never reused/collidable across guests)', async () => {
    await createGuestUser();
    const first = valuesArg!.address;

    await createGuestUser();
    const second = valuesArg!.address;

    expect(first).not.toBe(second);
  });

  it('generates a builderCode for the guest row, same as a wallet user gets', async () => {
    await createGuestUser();

    expect(typeof valuesArg!.builderCode).toBe('string');
    expect((valuesArg!.builderCode as string).length).toBeGreaterThan(0);
  });
});
