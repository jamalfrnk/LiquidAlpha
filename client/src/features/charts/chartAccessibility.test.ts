import { describe, it, expect } from 'vitest';
import { describeMarketForScreenReader } from './chartAccessibility';
import type { MarketSnapshot } from '../markets/types';

function fakeRow(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    id: '1',
    symbol: 'BTC',
    price: '63077.02',
    volume: '1000000',
    change24h: '1.5',
    updatedAt: new Date().toISOString(),
    stale: false,
    source: 'hyperliquid',
    szDecimals: 5,
    maxLeverage: 40,
    ...overrides,
  };
}

describe('describeMarketForScreenReader', () => {
  it('states direction in words, never relying on color to convey it', () => {
    const up = describeMarketForScreenReader('BTC', fakeRow({ change24h: '2.5' }));
    expect(up).toContain('up 2.50%');

    const down = describeMarketForScreenReader('BTC', fakeRow({ change24h: '-1.25' }));
    expect(down).toContain('down 1.25%');

    const flat = describeMarketForScreenReader('BTC', fakeRow({ change24h: '0' }));
    expect(flat).not.toContain('up');
    expect(flat).not.toContain('down');
  });

  it('names the actual data source, distinguishing Hyperliquid from the CoinGecko fallback', () => {
    const hl = describeMarketForScreenReader('BTC', fakeRow({ source: 'hyperliquid' }));
    expect(hl).toContain('Source: Hyperliquid');

    const cg = describeMarketForScreenReader('BTC', fakeRow({ source: 'coingecko' }));
    expect(cg).toContain('Source: CoinGecko fallback');
  });

  it('mentions staleness when the row is stale', () => {
    const stale = describeMarketForScreenReader('BTC', fakeRow({ stale: true }));
    expect(stale).toContain('stale');

    const fresh = describeMarketForScreenReader('BTC', fakeRow({ stale: false }));
    expect(fresh).not.toContain('stale');
  });

  it('reports unavailable when there is no row at all, rather than throwing', () => {
    const result = describeMarketForScreenReader('BTC', undefined);
    expect(result).toBe('BTC: market data is currently unavailable.');
  });
});
