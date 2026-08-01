import { useMarkets } from '../markets/useMarkets';

/**
 * A thin selector over the existing `useMarkets()` query cache -- kept
 * live by `useMarketDataSocket` (mounted once in AppShell) patching that
 * same cache on every WS `marketUpdate`. Deliberately not a second
 * WebSocket subscription: one shared upstream connection feeding one
 * client-side cache is the same principle the mission applies
 * server-side (a single shared Hyperliquid connection, not one per
 * client) applied to this feature's own data access.
 */
export function useLivePrice(symbol: string) {
  const { data, isLoading, isError } = useMarkets();
  const row = data?.find((m) => m.symbol === symbol);
  return { row, isLoading, isError };
}
