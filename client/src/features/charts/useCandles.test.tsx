import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Candle } from '../markets/types';

vi.mock('../markets/api', () => ({
  fetchCandles: vi.fn(),
}));

import { fetchCandles } from '../markets/api';
import { useCandles } from './useCandles';

function fakeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    id: '1',
    venue: 'hyperliquid',
    symbol: 'BTC',
    marketType: 'perp',
    interval: '1m',
    openTime: '2026-01-01T00:00:00.000Z',
    closeTime: '2026-01-01T00:00:59.999Z',
    sourceTimestamp: '2026-01-01T00:00:59.999Z',
    receivedAt: '2026-01-01T00:01:00.000Z',
    open: '100.5',
    high: '101.0',
    low: '99.5',
    close: '100.75',
    volume: '10',
    closed: true,
    createdAt: '2026-01-01T00:01:00.000Z',
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useCandles', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reverses the server's most-recent-first order into ascending-by-time for the chart", async () => {
    vi.mocked(fetchCandles).mockResolvedValue([
      fakeCandle({ openTime: '2026-01-01T00:02:00.000Z', close: '103' }),
      fakeCandle({ openTime: '2026-01-01T00:01:00.000Z', close: '102' }),
      fakeCandle({ openTime: '2026-01-01T00:00:00.000Z', close: '101' }),
    ]);

    const { result } = renderHook(() => useCandles('BTC', '1m'), { wrapper });

    await waitFor(() => expect(result.current.points).toHaveLength(3));
    expect(result.current.points.map((p) => p.close)).toEqual([101, 102, 103]);
    expect(result.current.points[0].time).toBeLessThan(result.current.points[1].time);
  });

  it('converts string decimal OHLC fields to numbers and openTime to epoch seconds', async () => {
    vi.mocked(fetchCandles).mockResolvedValue([fakeCandle({ openTime: '2026-01-01T00:00:00.000Z' })]);

    const { result } = renderHook(() => useCandles('BTC', '1m'), { wrapper });

    await waitFor(() => expect(result.current.points).toHaveLength(1));
    const [point] = result.current.points;
    expect(point).toEqual({
      time: Math.floor(new Date('2026-01-01T00:00:00.000Z').getTime() / 1000),
      open: 100.5,
      high: 101.0,
      low: 99.5,
      close: 100.75,
    });
  });

  it('returns an empty points array while loading, rather than undefined', () => {
    vi.mocked(fetchCandles).mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useCandles('BTC', '1m'), { wrapper });

    expect(result.current.points).toEqual([]);
  });
});
