import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbChain } from '../test-utils/dbMock';
import { MAX_BACKTEST_CANDLES_PER_SYMBOL } from '../schemas/backtest';
import type { NormalizedCandle, HyperliquidFundingHistoryEntry } from '../schemas/marketData';

const fetchCandleSnapshotMock = vi.fn();
const fetchFundingHistoryMock = vi.fn();
const insertMock = vi.fn();

vi.mock('../hyperliquid-real', () => ({
  fetchCandleSnapshot: (...args: unknown[]) => fetchCandleSnapshotMock(...args),
  fetchFundingHistory: (...args: unknown[]) => fetchFundingHistoryMock(...args),
}));

vi.mock('../db/index', () => ({
  db: {
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

import { fetchAndCacheCandles, fetchFundingForRange, computeDatasetVersion } from './dataset';

function candle(overrides: Partial<NormalizedCandle> = {}): NormalizedCandle {
  return {
    venue: 'hyperliquid',
    symbol: 'BTC',
    marketType: 'perp',
    interval: '1h',
    openTime: new Date('2026-01-01T00:00:00.000Z'),
    closeTime: new Date('2026-01-01T01:00:00.000Z'),
    sourceTimestamp: new Date('2026-01-01T01:00:00.000Z'),
    receivedAt: new Date('2026-01-01T01:00:00.000Z'),
    open: '100',
    high: '101',
    low: '99',
    close: '100.5',
    volume: '1000',
    closed: true,
    ...overrides,
  };
}

describe('fetchAndCacheCandles', () => {
  beforeEach(() => {
    fetchCandleSnapshotMock.mockReset();
    insertMock.mockReset();
    insertMock.mockReturnValue(dbChain([{}]));
  });

  it('filters out in-progress (not yet closed) candles', async () => {
    fetchCandleSnapshotMock.mockResolvedValue([
      candle({ openTime: new Date('2026-01-01T00:00:00.000Z'), closed: true }),
      candle({ openTime: new Date('2026-01-01T01:00:00.000Z'), closed: false }),
    ]);
    const result = await fetchAndCacheCandles('BTC', '1h', 0, 1);
    expect(result).toHaveLength(1);
    expect(result[0].closed).toBe(true);
  });

  it('sorts candles chronologically regardless of the order Hyperliquid returned them in', async () => {
    fetchCandleSnapshotMock.mockResolvedValue([
      candle({ openTime: new Date('2026-01-01T02:00:00.000Z') }),
      candle({ openTime: new Date('2026-01-01T00:00:00.000Z') }),
      candle({ openTime: new Date('2026-01-01T01:00:00.000Z') }),
    ]);
    const result = await fetchAndCacheCandles('BTC', '1h', 0, 1);
    expect(result.map((c) => c.openTime.toISOString())).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T01:00:00.000Z',
      '2026-01-01T02:00:00.000Z',
    ]);
  });

  it('throws rather than silently truncating when the range would exceed the per-symbol candle cap', async () => {
    const tooMany = Array.from({ length: MAX_BACKTEST_CANDLES_PER_SYMBOL + 1 }, (_, i) =>
      candle({ openTime: new Date(Date.UTC(2026, 0, 1, i, 0, 0)) }),
    );
    fetchCandleSnapshotMock.mockResolvedValue(tooMany);
    await expect(fetchAndCacheCandles('BTC', '1h', 0, 1)).rejects.toThrow(/exceeding/i);
  });

  it('upserts every closed candle into the candles table', async () => {
    fetchCandleSnapshotMock.mockResolvedValue([candle(), candle({ openTime: new Date('2026-01-01T01:00:00.000Z') })]);
    await fetchAndCacheCandles('BTC', '1h', 0, 1);
    expect(insertMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchFundingForRange', () => {
  beforeEach(() => {
    fetchFundingHistoryMock.mockReset();
  });

  it('returns the funding entries on success', async () => {
    const entries: HyperliquidFundingHistoryEntry[] = [{ coin: 'BTC', fundingRate: '0.0001', premium: '0', time: 0 }];
    fetchFundingHistoryMock.mockResolvedValue(entries);
    const result = await fetchFundingForRange('BTC', 0, 1);
    expect(result).toEqual(entries);
  });

  it('returns an empty array (never throws) when the funding endpoint fails -- the engine treats missing funding data as zero cost, not an error', async () => {
    fetchFundingHistoryMock.mockRejectedValue(new Error('endpoint unavailable'));
    const result = await fetchFundingForRange('BTC', 0, 1);
    expect(result).toEqual([]);
  });
});

describe('computeDatasetVersion', () => {
  it('is deterministic for the same candle set', () => {
    const set = { BTC: [candle()] };
    expect(computeDatasetVersion(set)).toBe(computeDatasetVersion(set));
  });

  it('differs when a candle close price differs', () => {
    const a = computeDatasetVersion({ BTC: [candle({ close: '100.5' })] });
    const b = computeDatasetVersion({ BTC: [candle({ close: '100.6' })] });
    expect(a).not.toBe(b);
  });

  it('is independent of symbol key ordering in the input object', () => {
    const a = computeDatasetVersion({ BTC: [candle({ symbol: 'BTC' })], ETH: [candle({ symbol: 'ETH' })] });
    const b = computeDatasetVersion({ ETH: [candle({ symbol: 'ETH' })], BTC: [candle({ symbol: 'BTC' })] });
    expect(a).toBe(b);
  });
});
