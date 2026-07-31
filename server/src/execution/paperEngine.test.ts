import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbChain } from '../test-utils/dbMock';
import { NotFoundError, ForbiddenError } from './errors';

const selectMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../db/index', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

// vitest hoists `vi.mock` above imports, so `./paperEngine` picks up the
// mocked `../db/index`.
import { cancelOrder, closePosition } from './paperEngine';

/**
 * Regression coverage for SEC-017: user A must never be able to cancel user
 * B's order or close user B's position via a guessable ID -- the exact IDOR
 * class of bug flagged against the Replit reference app (audit finding C-2).
 * `cancelOrder`/`closePosition` had no test file before this one.
 *
 * Each describe block includes a positive-control case (the owning user
 * succeeds) alongside the negative cases -- without it, an ownership check
 * that threw `ForbiddenError` unconditionally (denying legitimate owners
 * too) would pass a suite that only asserted the negative path.
 */
describe('cancelOrder ownership', () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it('throws NotFoundError when the order does not exist', async () => {
    selectMock.mockReturnValue(dbChain([]));
    await expect(cancelOrder('user-a', 'missing-order')).rejects.toThrow(NotFoundError);
  });

  it('throws ForbiddenError when the order belongs to a different user', async () => {
    selectMock.mockReturnValue(dbChain([{ id: 'order-1', userId: 'user-b', status: 'PENDING' }]));
    await expect(cancelOrder('user-a', 'order-1')).rejects.toThrow(ForbiddenError);
  });

  it('positive control: the owning user can cancel their own non-terminal order', async () => {
    selectMock.mockReturnValue(dbChain([{ id: 'order-1', userId: 'user-a', status: 'ACKNOWLEDGED' }]));
    updateMock.mockReturnValue(dbChain([{ id: 'order-1', userId: 'user-a', status: 'CANCELLED' }]));

    const result = await cancelOrder('user-a', 'order-1');

    expect(result).toMatchObject({ id: 'order-1', status: 'CANCELLED' });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

describe('closePosition ownership', () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it('throws NotFoundError when the position does not exist', async () => {
    selectMock.mockReturnValue(dbChain([]));
    await expect(closePosition('user-a', 'missing-position')).rejects.toThrow(NotFoundError);
  });

  it('throws ForbiddenError when the position belongs to a different user', async () => {
    selectMock.mockReturnValue(dbChain([{ id: 'position-1', userId: 'user-b', status: 'OPEN' }]));
    await expect(closePosition('user-a', 'position-1')).rejects.toThrow(ForbiddenError);
  });

  it('positive control: the owning user can close their own open position', async () => {
    // closePosition issues two selects in sequence: the position lookup,
    // then getMarketSnapshot's markets lookup -- mockReturnValueOnce lines
    // them up in call order.
    selectMock
      .mockReturnValueOnce(
        dbChain([
          { id: 'position-1', userId: 'user-a', status: 'OPEN', asset: 'BTC', side: 'LONG', entryPrice: '100', quantity: '1' },
        ]),
      )
      .mockReturnValueOnce(dbChain([{ symbol: 'BTC', price: '110' }]));
    updateMock.mockReturnValue(dbChain([{ id: 'position-1', userId: 'user-a', status: 'CLOSED' }]));

    const result = await closePosition('user-a', 'position-1');

    expect(result).toMatchObject({ id: 'position-1', status: 'CLOSED' });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
