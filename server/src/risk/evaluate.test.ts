import { describe, it, expect } from 'vitest';
import { evaluateTrade, type RiskLimitConfig, type TradeIntent } from './evaluate';

const limits: RiskLimitConfig = {
  maxPositionSize: 1000,
  maxLeverage: 10,
  maxOpenPositions: 5,
  maxPriceDeviationPercent: 2,
  maxDataAgeMs: 30_000,
};

const goodIntent: TradeIntent = {
  notionalSize: 500,
  leverage: 5,
  currentOpenPositions: 1,
  requestedPrice: 100,
  currentMarketPrice: 100,
  marketDataAgeMs: 1000,
  marketDataSource: 'hyperliquid',
};

describe('evaluateTrade', () => {
  it('passes when every check passes', () => {
    const result = evaluateTrade(goodIntent, limits);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('collects every failure, not just the first', () => {
    const badIntent: TradeIntent = {
      notionalSize: 2000, // over
      leverage: 20, // over
      currentOpenPositions: 5, // at cap
      requestedPrice: 110, // over deviation
      currentMarketPrice: 100,
      marketDataAgeMs: 1000,
      marketDataSource: 'hyperliquid',
    };
    const result = evaluateTrade(badIntent, limits);
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBe(4);
  });

  it('fails on stale data even when every other check would pass', () => {
    const result = evaluateTrade({ ...goodIntent, marketDataAgeMs: 60_000 }, limits);
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBe(1);
    expect(result.failures[0]).toMatch(/old|stale|exceeding/i);
  });

  it('fails when the reference price is CoinGecko-fallback-sourced, even when every other check would pass (DATA-RECOVERY-001)', () => {
    const result = evaluateTrade({ ...goodIntent, marketDataSource: 'coingecko' }, limits);
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBe(1);
    expect(result.failures[0]).toMatch(/coingecko/i);
  });
});
