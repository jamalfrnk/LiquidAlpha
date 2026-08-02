import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbChain } from '../test-utils/dbMock';
import { NotFoundError, ForbiddenError } from './errors';

const selectMock = vi.fn();
const updateMock = vi.fn();
const insertMock = vi.fn();
const fetchFundingHistoryMock = vi.fn();

vi.mock('../db/index', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

vi.mock('../hyperliquid-real', () => ({
  fetchFundingHistory: (...args: unknown[]) => fetchFundingHistoryMock(...args),
}));

// vitest hoists `vi.mock` above imports, so `./paperEngine` picks up the
// mocked `../db/index`.
import { cancelOrder, closePosition, submitOrder, accruePaperFunding } from './paperEngine';

const BASE_ORDER_ROW = {
  id: 'order-1',
  userId: 'user-a',
  asset: 'BTC',
  side: 'LONG' as const,
  orderType: 'MARKET' as const,
  quantity: '1',
  limitPrice: null,
  leverage: '2',
  status: 'PENDING',
};

const RISK_LIMITS_ROW = {
  userId: 'user-a',
  maxPositionSize: '100000',
  maxLeverage: '10',
  maxOpenPositions: 5,
  maxDailyLossPercent: '5',
  killSwitchEnabled: false,
};

function marketRow() {
  // updatedAt must be "now", not a fixed past timestamp -- evaluateTrade's
  // stale-data check compares it against the real wall clock and would
  // otherwise reject every order in this fixture as stale before it ever
  // reaches fillOrder.
  return { symbol: 'BTC', price: '100', source: 'hyperliquid' as const, updatedAt: new Date() };
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
          {
            id: 'position-1',
            userId: 'user-a',
            status: 'OPEN',
            asset: 'BTC',
            side: 'LONG',
            entryPrice: '100',
            quantity: '1',
            feesPaid: '0',
            fundingPaid: '0',
          },
        ]),
      )
      .mockReturnValueOnce(dbChain([{ symbol: 'BTC', price: '110' }]));
    updateMock.mockReturnValue(dbChain([{ id: 'position-1', userId: 'user-a', status: 'CLOSED' }]));

    const result = await closePosition('user-a', 'position-1');

    expect(result).toMatchObject({ id: 'position-1', status: 'CLOSED' });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("realizedPnl (PAPER-REALISM-001) subtracts the exit fee, fees already accrued from entry, and funding paid over the position's life -- not just the raw price move", async () => {
    selectMock
      .mockReturnValueOnce(
        dbChain([
          {
            id: 'position-1',
            userId: 'user-a',
            status: 'OPEN',
            asset: 'BTC',
            side: 'LONG',
            entryPrice: '100',
            quantity: '10',
            feesPaid: '2', // already paid at entry
            fundingPaid: '3', // accrued over the holding period
          },
        ]),
      )
      .mockReturnValueOnce(dbChain([{ symbol: 'BTC', price: '110' }]));

    // dbChain's generic proxy discards arguments passed to chained calls
    // like `.set(...)`, so it can't be used to inspect what closePosition
    // actually computed -- this captures the real payload directly.
    let capturedSet: Record<string, unknown> | undefined;
    updateMock.mockImplementation(() => ({
      set: (payload: Record<string, unknown>) => {
        capturedSet = payload;
        return dbChain([{ id: 'position-1', status: 'CLOSED', ...payload }]);
      },
    }));

    await closePosition('user-a', 'position-1');

    expect(capturedSet).toBeDefined();
    // Exiting a LONG applies SHORT-direction slippage to the exit fill
    // (110 * (1 - 5bps)), matching applySlippage's default -- so the
    // expected values are computed the same way closePosition itself does,
    // not approximated.
    const exitPrice = 110 * (1 - 5 / 10_000);
    const grossPnl = (exitPrice - 100) * 10;
    const exitFee = exitPrice * 10 * (5 / 10_000);
    const expectedFeesPaid = 2 + exitFee;
    const expectedRealizedPnl = grossPnl - expectedFeesPaid - 3;

    const realizedPnl = parseFloat(capturedSet!.realizedPnl as string);
    const feesPaid = parseFloat(capturedSet!.feesPaid as string);
    expect(feesPaid).toBeCloseTo(expectedFeesPaid, 6);
    expect(realizedPnl).toBeCloseTo(expectedRealizedPnl, 6);
  });
});

describe('fill provenance and position tracking (PAPER-REALISM-001)', () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
    insertMock.mockReset();
  });

  it('records price source, source timestamp, fill-model version, reference price, slippage, and fee on a new fill', async () => {
    let capturedFillValues: Record<string, unknown> | undefined;
    const market = marketRow();
    selectMock
      .mockReturnValueOnce(dbChain([])) // isUserHalted
      .mockReturnValueOnce(dbChain([market])) // getMarketSnapshot
      .mockReturnValueOnce(dbChain([RISK_LIMITS_ROW])) // getOrCreateRiskLimits
      .mockReturnValueOnce(dbChain([{ value: 0 }])) // countOpenPositions
      .mockReturnValueOnce(dbChain([])) // getOpenPosition (direction-conflict check)
      .mockReturnValueOnce(dbChain([])) // getOpenPosition again, inside fillOrder
      .mockReturnValueOnce(dbChain([{ id: 'fill-1' }])); // select(fills) at the end of fillOrder
    updateMock.mockReturnValueOnce(dbChain([{ ...BASE_ORDER_ROW, status: 'FILLED' }]));
    insertMock
      .mockImplementationOnce(() => ({ values: () => dbChain([BASE_ORDER_ROW]) })) // insert(orders)
      .mockImplementationOnce(() => ({
        values: (payload: Record<string, unknown>) => {
          capturedFillValues = payload;
          return dbChain([{}]);
        },
      })) // insert(fills)
      .mockImplementationOnce(() => ({ values: () => dbChain([{}]) })); // insert(positions)

    await submitOrder('user-a', {
      asset: 'BTC',
      side: 'LONG',
      orderType: 'MARKET',
      quantity: 1,
      leverage: 2,
      idempotencyKey: 'key-1',
    });

    expect(capturedFillValues).toBeDefined();
    expect(capturedFillValues!.priceSource).toBe('hyperliquid');
    expect(capturedFillValues!.sourceTimestamp).toEqual(market.updatedAt);
    expect(capturedFillValues!.fillModelVersion).toBe('v1');
    expect(capturedFillValues!.referencePrice).toBe('100');
    expect(parseFloat(capturedFillValues!.slippageAmount as string)).toBeGreaterThan(0); // MARKET order -- slippage applied
    expect(parseFloat(capturedFillValues!.feeAmount as string)).toBeGreaterThan(0);
  });
});

describe('accruePaperFunding', () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
    fetchFundingHistoryMock.mockReset();
  });

  it('charges a LONG position funding pro-rated by elapsed time, using the real current funding rate', async () => {
    const openedAt = new Date('2026-08-01T00:00:00.000Z');
    const now = new Date(openedAt.getTime() + 60 * 60_000); // exactly one funding interval later
    selectMock.mockReturnValueOnce(
      dbChain([
        {
          id: 'position-1',
          asset: 'BTC',
          side: 'LONG',
          entryPrice: '100',
          quantity: '10',
          fundingPaid: '0',
          createdAt: openedAt,
          lastFundingChargedAt: null,
        },
      ]),
    );
    fetchFundingHistoryMock.mockResolvedValue([{ time: 0, coin: 'BTC', fundingRate: '0.0001', premium: '0' }]);
    let capturedSet: Record<string, unknown> | undefined;
    updateMock.mockImplementation(() => ({
      set: (payload: Record<string, unknown>) => {
        capturedSet = payload;
        return dbChain([{}]);
      },
    }));

    await accruePaperFunding(now);

    expect(capturedSet).toBeDefined();
    // notional 1000 * rate 0.0001 * exactly 1 funding interval elapsed = 0.1, LONG pays positive.
    expect(parseFloat(capturedSet!.fundingPaid as string)).toBeCloseTo(0.1, 6);
  });

  it('skips a position without fabricating a charge when the funding-history endpoint fails', async () => {
    const openedAt = new Date('2026-08-01T00:00:00.000Z');
    const now = new Date(openedAt.getTime() + 60 * 60_000);
    selectMock.mockReturnValueOnce(
      dbChain([
        { id: 'position-1', asset: 'BTC', side: 'LONG', entryPrice: '100', quantity: '10', fundingPaid: '0', createdAt: openedAt, lastFundingChargedAt: null },
      ]),
    );
    fetchFundingHistoryMock.mockRejectedValue(new Error('endpoint unavailable'));

    await accruePaperFunding(now);

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('skips a position without fabricating a charge when no funding entry is available in the lookback window', async () => {
    const openedAt = new Date('2026-08-01T00:00:00.000Z');
    const now = new Date(openedAt.getTime() + 60 * 60_000);
    selectMock.mockReturnValueOnce(
      dbChain([
        { id: 'position-1', asset: 'BTC', side: 'LONG', entryPrice: '100', quantity: '10', fundingPaid: '0', createdAt: openedAt, lastFundingChargedAt: null },
      ]),
    );
    fetchFundingHistoryMock.mockResolvedValue([]);

    await accruePaperFunding(now);

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does not charge again before FUNDING_MIN_ACCRUAL_INTERVAL_MS has elapsed since the position's last charge", async () => {
    const lastCharged = new Date('2026-08-01T00:00:00.000Z');
    const now = new Date(lastCharged.getTime() + 60_000); // only 1 minute later
    selectMock.mockReturnValueOnce(
      dbChain([
        {
          id: 'position-1',
          asset: 'BTC',
          side: 'LONG',
          entryPrice: '100',
          quantity: '10',
          fundingPaid: '0',
          createdAt: lastCharged,
          lastFundingChargedAt: lastCharged,
        },
      ]),
    );

    await accruePaperFunding(now);

    expect(fetchFundingHistoryMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
