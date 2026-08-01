import { describe, it, expect } from 'vitest';
import { selectMarketRows, TRACKED_SYMBOLS } from './ingestion';
import type { HyperliquidAssetSnapshot } from '../schemas/marketData';
import type { MarketData } from './coingecko';

/**
 * Pure, DB-free -- covers DATA-HL-001's "provider-selection logic
 * (Hyperliquid primary, CoinGecko fallback only for display)" test-plan
 * requirement without needing a database.
 */
describe('selectMarketRows', () => {
  const hlSnapshot = (symbol: string): HyperliquidAssetSnapshot => ({
    symbol,
    szDecimals: 5,
    maxLeverage: 50,
    price: '100',
    changePercent24h: 1.5,
    volume24h: '1000',
  });

  const coingeckoData: MarketData = {
    BTC: { price: 99, change24h: -1, volume: 500 },
    ETH: { price: 98, change24h: -2, volume: 400 },
    SOL: { price: 97, change24h: -3, volume: 300 },
  };

  it('uses Hyperliquid rows, tagged with source "hyperliquid", when it covers the tracked symbols', () => {
    const hyperliquidSnapshots = TRACKED_SYMBOLS.map(hlSnapshot);

    const rows = selectMarketRows(hyperliquidSnapshots, coingeckoData);

    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.source === 'hyperliquid')).toBe(true);
    expect(rows.map((r) => r.symbol)).toEqual([...TRACKED_SYMBOLS]);
  });

  it('never uses CoinGecko data when Hyperliquid already covers the tracked symbols, even if CoinGecko data is also present', () => {
    const hyperliquidSnapshots = TRACKED_SYMBOLS.map(hlSnapshot);

    const rows = selectMarketRows(hyperliquidSnapshots, coingeckoData);

    expect(rows.some((r) => r.source === 'coingecko')).toBe(false);
  });

  it('falls back to CoinGecko, tagged with source "coingecko", when Hyperliquid is unavailable', () => {
    const rows = selectMarketRows(undefined, coingeckoData);

    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.source === 'coingecko')).toBe(true);
  });

  it('falls back to CoinGecko when Hyperliquid responded but covered none of the tracked symbols', () => {
    const hyperliquidSnapshots = [hlSnapshot('DOGE'), hlSnapshot('AVAX')];

    const rows = selectMarketRows(hyperliquidSnapshots, coingeckoData);

    expect(rows.every((r) => r.source === 'coingecko')).toBe(true);
  });

  it('skips a tracked symbol Hyperliquid omitted rather than substituting CoinGecko for just that one symbol', () => {
    const hyperliquidSnapshots = [hlSnapshot('BTC'), hlSnapshot('ETH')]; // no SOL

    const rows = selectMarketRows(hyperliquidSnapshots, coingeckoData);

    expect(rows.map((r) => r.symbol)).toEqual(['BTC', 'ETH']);
    expect(rows.every((r) => r.source === 'hyperliquid')).toBe(true);
  });

  it('returns an empty array when both providers are unavailable, rather than fabricating data', () => {
    const rows = selectMarketRows(undefined, undefined);

    expect(rows).toEqual([]);
  });
});
