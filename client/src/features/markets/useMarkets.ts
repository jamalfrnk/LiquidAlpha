import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { fetchMarkets } from './api';

/**
 * Seeds from a real REST fetch on mount; kept live afterward by
 * useMarketDataSocket patching this same query's cache on each WS
 * `marketUpdate` message. One source of truth (the query cache), two ways
 * data arrives into it.
 */
export function useMarkets() {
  return useQuery({
    queryKey: queryKeys.marketData.list,
    queryFn: fetchMarkets,
    staleTime: 30_000,
  });
}
