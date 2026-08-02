import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbChain } from '../test-utils/dbMock';
import type { NormalizedCandle } from '../schemas/marketData';

const insertMock = vi.fn();
const updateMock = vi.fn();
const fetchAndCacheCandlesMock = vi.fn();
const fetchFundingForRangeMock = vi.fn();

vi.mock('../db/index', () => ({
  db: {
    insert: (...args: unknown[]) => insertMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

vi.mock('./dataset', () => ({
  fetchAndCacheCandles: (...args: unknown[]) => fetchAndCacheCandlesMock(...args),
  fetchFundingForRange: (...args: unknown[]) => fetchFundingForRangeMock(...args),
  computeDatasetVersion: () => 'dataset-hash',
}));

import { createAndRunBacktest } from './runner';
import { MIN_HISTORY } from '../technical-analysis';

/** A gentle, never-accelerating slope -- same fixture rationale as engine.test.ts's mildUptrend: enough to eventually fire a signal, without the natural candle range accidentally crossing a stop/target on its own. */
function mildUptrendCandles(length: number, symbol = 'BTC'): NormalizedCandle[] {
  return Array.from({ length }, (_, i) => {
    const close = 100 + i * 0.2;
    const open = i === 0 ? close : 100 + (i - 1) * 0.2;
    const openTime = new Date(Date.UTC(2026, 0, 1, i, 0, 0));
    const closeTime = new Date(Date.UTC(2026, 0, 1, i + 1, 0, 0));
    return {
      venue: 'hyperliquid',
      symbol,
      marketType: 'perp',
      interval: '1h',
      openTime,
      closeTime,
      sourceTimestamp: closeTime,
      receivedAt: closeTime,
      open: open.toString(),
      high: (Math.max(open, close) * 1.0001).toString(),
      low: (Math.min(open, close) * 0.9999).toString(),
      close: close.toString(),
      volume: '1000',
      closed: true,
    };
  });
}

describe('createAndRunBacktest', () => {
  beforeEach(() => {
    insertMock.mockReset();
    updateMock.mockReset();
    fetchAndCacheCandlesMock.mockReset();
    fetchFundingForRangeMock.mockReset();
  });

  it('rejects a request where startTime is not before endTime, before touching the database', async () => {
    await expect(
      createAndRunBacktest('user-a', {
        symbols: ['BTC'],
        interval: '1h',
        startTime: '2026-01-02T00:00:00.000Z',
        endTime: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/startTime must be before endTime/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('records a FAILED run (never left RUNNING/PENDING) when a symbol has insufficient historical candles, even though no RUNNING row was ever created', async () => {
    insertMock.mockReturnValueOnce(dbChain([{ id: 'run-1', userId: 'user-a', status: 'FAILED', failureReason: 'Not enough historical candles for BTC' }]));
    fetchAndCacheCandlesMock.mockResolvedValue(mildUptrendCandles(50)); // far fewer than MIN_HISTORY + 1

    const result = await createAndRunBacktest('user-a', {
      symbols: ['BTC'],
      interval: '1h',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-03T00:00:00.000Z',
    });

    expect(result.status).toBe('FAILED');
    expect(insertMock).toHaveBeenCalledTimes(1); // one direct FAILED insert -- no RUNNING row, no update() call
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('completes successfully, persisting a summary and per-trade rows, for a valid request', async () => {
    insertMock
      .mockReturnValueOnce(dbChain([{ id: 'run-1', userId: 'user-a', status: 'RUNNING' }])) // insert(backtestRuns)
      .mockReturnValueOnce(dbChain([{}])); // insert(backtestTrades), if any trades fired
    fetchAndCacheCandlesMock.mockResolvedValue(mildUptrendCandles(MIN_HISTORY + 50));
    fetchFundingForRangeMock.mockResolvedValue([]);
    updateMock.mockReturnValueOnce(
      dbChain([{ id: 'run-1', status: 'COMPLETED', summary: { tier: 'insufficient' } }]),
    );

    const result = await createAndRunBacktest('user-a', {
      symbols: ['BTC'],
      interval: '1h',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-05T00:00:00.000Z',
    });

    expect(result.status).toBe('COMPLETED');
  });

  it('does not fetch funding history when fundingEnabled is not set (defaults to false)', async () => {
    insertMock.mockReturnValueOnce(dbChain([{ id: 'run-1' }])).mockReturnValueOnce(dbChain([{}]));
    fetchAndCacheCandlesMock.mockResolvedValue(mildUptrendCandles(MIN_HISTORY + 50));
    updateMock.mockReturnValueOnce(dbChain([{ id: 'run-1', status: 'COMPLETED' }]));

    await createAndRunBacktest('user-a', {
      symbols: ['BTC'],
      interval: '1h',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-05T00:00:00.000Z',
    });

    expect(fetchFundingForRangeMock).not.toHaveBeenCalled();
  });
});
