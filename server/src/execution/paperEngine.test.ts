import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbChain } from '../test-utils/dbMock';
import { NotFoundError, ForbiddenError } from './errors';

const selectMock = vi.fn();
const updateMock = vi.fn();
const insertMock = vi.fn();

vi.mock('../db/index', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

// vitest hoists `vi.mock` above imports, so `./paperEngine` picks up the
// mocked `../db/index`.
import { cancelOrder, closePosition, submitOrder, sweepLimitOrders } from './paperEngine';

const BASE_ORDER_ROW = {
  id: 'order-1',
  userId: 'user-a',
  asset: 'BTC',
  side: 'LONG' as const,
  orderType: 'MARKET' as const,
  quantity: '1',
  limitPrice: null,
  leverage: '1',
  status: 'PENDING',
};

const RISK_LIMITS_ROW = {
  userId: 'user-a',
  maxPositionSize: '1000',
  maxLeverage: '10',
  maxOpenPositions: 5,
  maxDailyLossPercent: '5',
  killSwitchEnabled: false,
};

function marketRow(source: 'hyperliquid' | 'coingecko') {
  return { symbol: 'BTC', price: '100', source, updatedAt: new Date() };
}

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
    insertMock.mockReset();
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
    insertMock.mockReset();
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

/**
 * Regression coverage for the trustworthy-source gate (DATA-RECOVERY-001)
 * at its actual call sites in processNewOrder/sweepLimitOrders -- flagged
 * by independent review of PR #59 (LA-QG-001) as untested at this level:
 * checkTrustworthySource itself and evaluateTrade's dispatch of it were
 * unit-tested, but nothing exercised the paperEngine.ts integration where
 * market.source is actually read from a DB row and threaded through. Each
 * block includes a positive control (a genuinely hyperliquid-sourced order
 * still fills) alongside the negative case, for the same reason the
 * ownership tests above do.
 */
describe('processNewOrder trustworthy-source gating', () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
    insertMock.mockReset();
  });

  it('rejects a new MARKET order priced off a CoinGecko-fallback row', async () => {
    insertMock.mockReturnValueOnce(dbChain([BASE_ORDER_ROW])); // insert(orders)
    selectMock
      .mockReturnValueOnce(dbChain([])) // isUserHalted -- no risk_limits row, defaults to false
      .mockReturnValueOnce(dbChain([marketRow('coingecko')])) // getMarketSnapshot
      .mockReturnValueOnce(dbChain([RISK_LIMITS_ROW])) // getOrCreateRiskLimits
      .mockReturnValueOnce(dbChain([{ value: 0 }])); // countOpenPositions
    updateMock.mockReturnValueOnce(dbChain([{ ...BASE_ORDER_ROW, status: 'REJECTED' }])); // rejectOrder -> setOrderStatus

    const result = await submitOrder('user-a', {
      asset: 'BTC',
      side: 'LONG',
      orderType: 'MARKET',
      quantity: 1,
      leverage: 1,
      idempotencyKey: 'key-reject',
    });

    expect(result.order.status).toBe('REJECTED');
    expect(result.fills).toEqual([]);
    expect(insertMock).toHaveBeenCalledTimes(1); // only the initial order insert -- never reached fillOrder's insert(fills)
  });

  it('positive control: a genuinely Hyperliquid-sourced MARKET order still fills', async () => {
    insertMock
      .mockReturnValueOnce(dbChain([BASE_ORDER_ROW])) // insert(orders)
      .mockReturnValueOnce(dbChain([{ id: 'fill-1', orderId: 'order-1', price: '100.05', quantity: '1' }])) // insert(fills)
      .mockReturnValueOnce(dbChain([{ id: 'position-1', userId: 'user-a', asset: 'BTC' }])); // insert(positions)
    selectMock
      .mockReturnValueOnce(dbChain([])) // isUserHalted
      .mockReturnValueOnce(dbChain([marketRow('hyperliquid')])) // getMarketSnapshot
      .mockReturnValueOnce(dbChain([RISK_LIMITS_ROW])) // getOrCreateRiskLimits
      .mockReturnValueOnce(dbChain([{ value: 0 }])) // countOpenPositions
      .mockReturnValueOnce(dbChain([])) // getOpenPosition (direction-conflict check)
      .mockReturnValueOnce(dbChain([])) // getOpenPosition again, inside fillOrder
      .mockReturnValueOnce(dbChain([{ id: 'fill-1', orderId: 'order-1', price: '100.05', quantity: '1' }])); // select(fills) at the end of fillOrder
    updateMock.mockReturnValueOnce(dbChain([{ ...BASE_ORDER_ROW, status: 'FILLED' }])); // setOrderStatus -> FILLED

    const result = await submitOrder('user-a', {
      asset: 'BTC',
      side: 'LONG',
      orderType: 'MARKET',
      quantity: 1,
      leverage: 1,
      idempotencyKey: 'key-fill',
    });

    expect(result.order.status).toBe('FILLED');
    expect(result.fills).toHaveLength(1);
  });
});

describe('sweepLimitOrders trustworthy-source gating', () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
    insertMock.mockReset();
  });

  it('leaves a marketable resting limit order ACKNOWLEDGED (not filled) when the market is CoinGecko-fallback-sourced', async () => {
    const restingOrder = { id: 'order-2', userId: 'user-a', asset: 'BTC', side: 'LONG', orderType: 'LIMIT', limitPrice: '100', status: 'ACKNOWLEDGED' };
    selectMock
      .mockReturnValueOnce(dbChain([restingOrder])) // resting LIMIT/ACKNOWLEDGED orders
      .mockReturnValueOnce(dbChain([marketRow('coingecko')])) // getMarketSnapshot -- price 100, limitPrice 100 -> marketable
      .mockReturnValueOnce(dbChain([])); // isUserHalted

    await sweepLimitOrders();

    // Blocked by the trustworthy-source gate before ever reaching fillOrder --
    // no fill inserted, no order-status update issued.
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('positive control: a genuinely Hyperliquid-sourced marketable resting limit order fills', async () => {
    const restingOrder = { id: 'order-2', userId: 'user-a', asset: 'BTC', side: 'LONG', orderType: 'LIMIT', limitPrice: '100', status: 'ACKNOWLEDGED' };
    selectMock
      .mockReturnValueOnce(dbChain([restingOrder])) // resting LIMIT/ACKNOWLEDGED orders
      .mockReturnValueOnce(dbChain([marketRow('hyperliquid')])) // getMarketSnapshot
      .mockReturnValueOnce(dbChain([])) // isUserHalted
      .mockReturnValueOnce(dbChain([])) // getOpenPosition (direction-conflict check)
      .mockReturnValueOnce(dbChain([])) // getOpenPosition again, inside fillOrder
      .mockReturnValueOnce(dbChain([{ id: 'fill-2', orderId: 'order-2', price: '100', quantity: '1' }])); // select(fills) at the end of fillOrder
    insertMock
      .mockReturnValueOnce(dbChain([{ id: 'fill-2', orderId: 'order-2', price: '100', quantity: '1' }])) // insert(fills)
      .mockReturnValueOnce(dbChain([{ id: 'position-2', userId: 'user-a', asset: 'BTC' }])); // insert(positions)
    updateMock.mockReturnValueOnce(dbChain([{ ...restingOrder, status: 'FILLED' }])); // setOrderStatus -> FILLED

    await sweepLimitOrders();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(2);
  });
});
