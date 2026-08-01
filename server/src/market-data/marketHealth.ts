import type { HyperliquidWsHealth } from './hyperliquidWs';

export type MarketDataMode = 'live' | 'degraded' | 'fallback' | 'unavailable';

export interface IngestionHealthLike {
  healthy: boolean;
  lastSuccessSource: 'hyperliquid' | 'coingecko' | null;
}

/** A WS message within this window counts as "currently live" -- older than this and the WS connection, even if technically open, isn't actually delivering fresh data. */
const WS_FRESHNESS_MS = 15_000;

/**
 * The single source of truth for "how good is our market data right now,"
 * combining the WS client's own connection state with the REST ingestion
 * cycle's -- deliberately a pure function (no I/O) so every state
 * combination is enumerable and unit-testable, per the mission's explicit
 * "current mode: live, degraded, fallback, or unavailable" requirement.
 *
 * - live: the Hyperliquid WS is connected and has delivered a message
 *   recently -- the fast path is genuinely working.
 * - degraded: the WS isn't currently live, but the REST cycle is
 *   succeeding against Hyperliquid -- real Hyperliquid data, just on the
 *   slower (10s) cadence.
 * - fallback: REST is succeeding, but only via the CoinGecko fallback --
 *   Hyperliquid itself is unreachable through either path.
 * - unavailable: neither path is currently succeeding.
 */
export function computeMarketDataMode(wsHealth: HyperliquidWsHealth, ingestionHealth: IngestionHealthLike): MarketDataMode {
  const wsIsLive = wsHealth.connected && wsHealth.lastMessageAt !== null && Date.now() - wsHealth.lastMessageAt.getTime() < WS_FRESHNESS_MS;
  if (wsIsLive) return 'live';

  if (!ingestionHealth.healthy) return 'unavailable';
  if (ingestionHealth.lastSuccessSource === 'coingecko') return 'fallback';
  if (ingestionHealth.lastSuccessSource === 'hyperliquid') return 'degraded';
  return 'unavailable';
}
