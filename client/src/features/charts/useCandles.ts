import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { fetchCandles } from '../markets/api';
import type { CandleInterval } from '../markets/types';
import type { ChartPoint } from './chartTypes';

const INITIAL_CANDLE_LIMIT = 200;

/**
 * Fetches candle history for one symbol/interval and normalizes it into
 * ascending-by-time `ChartPoint`s. No live WebSocket candle push exists
 * yet (that's DATA-RECOVERY-001's scope) -- the 30s refetch is this
 * feature's only update mechanism today, matching the mission's "near
 * real-time · refreshed every 30 seconds" degraded-mode language rather
 * than overclaiming a live feed. The server itself backfills candles every
 * 60s (see market-data/ingestion.ts's runCandleBackfillCycle), so refetching
 * faster than that would just re-ask the same answer half the time.
 */
export function useCandles(symbol: string, interval: CandleInterval) {
  const query = useQuery({
    queryKey: queryKeys.marketData.candles(symbol, interval),
    queryFn: () => fetchCandles(symbol, interval, INITIAL_CANDLE_LIMIT),
    refetchInterval: 30_000,
  });

  const points = useMemo<ChartPoint[]>(() => {
    if (!query.data) return [];
    // The API returns most-recent-first (see server's `orderBy(desc(candles.openTime))`);
    // the chart needs ascending time order.
    return [...query.data].reverse().map((candle) => ({
      time: Math.floor(new Date(candle.openTime).getTime() / 1000),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    }));
  }, [query.data]);

  return { ...query, points };
}
