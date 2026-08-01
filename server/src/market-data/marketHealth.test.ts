import { describe, it, expect } from 'vitest';
import { computeMarketDataMode } from './marketHealth';
import type { HyperliquidWsHealth } from './hyperliquidWs';

function wsHealth(overrides: Partial<HyperliquidWsHealth> = {}): HyperliquidWsHealth {
  return { connected: false, lastMessageAt: null, consecutiveFailures: 0, reconnectAttempts: 0, ...overrides };
}

describe('computeMarketDataMode', () => {
  it('is "live" when the WS is connected and delivered a message recently', () => {
    const mode = computeMarketDataMode(wsHealth({ connected: true, lastMessageAt: new Date() }), {
      healthy: true,
      lastSuccessSource: 'hyperliquid',
    });
    expect(mode).toBe('live');
  });

  it('is not "live" when the WS is connected but its last message is stale (silently stalled, per DATA-RECOVERY-001)', () => {
    const staleMessage = new Date(Date.now() - 60_000);
    const mode = computeMarketDataMode(wsHealth({ connected: true, lastMessageAt: staleMessage }), {
      healthy: true,
      lastSuccessSource: 'hyperliquid',
    });
    expect(mode).not.toBe('live');
  });

  it('is "degraded" when the WS is down but REST ingestion is succeeding against Hyperliquid', () => {
    const mode = computeMarketDataMode(wsHealth({ connected: false }), { healthy: true, lastSuccessSource: 'hyperliquid' });
    expect(mode).toBe('degraded');
  });

  it('is "fallback" when REST ingestion is only succeeding via CoinGecko', () => {
    const mode = computeMarketDataMode(wsHealth({ connected: false }), { healthy: true, lastSuccessSource: 'coingecko' });
    expect(mode).toBe('fallback');
  });

  it('is "unavailable" when REST ingestion has failed 3+ consecutive times, regardless of last known source', () => {
    const mode = computeMarketDataMode(wsHealth({ connected: false }), { healthy: false, lastSuccessSource: 'hyperliquid' });
    expect(mode).toBe('unavailable');
  });

  it('is "unavailable" when nothing has ever succeeded', () => {
    const mode = computeMarketDataMode(wsHealth(), { healthy: true, lastSuccessSource: null });
    expect(mode).toBe('unavailable');
  });

  it('prefers "live" over a merely-healthy REST cycle when both are true', () => {
    const mode = computeMarketDataMode(wsHealth({ connected: true, lastMessageAt: new Date() }), {
      healthy: true,
      lastSuccessSource: 'coingecko',
    });
    expect(mode).toBe('live');
  });
});
