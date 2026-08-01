import { describe, it, expect } from 'vitest';
import {
  checkPositionSize,
  checkLeverage,
  checkMaxOpenPositions,
  checkPriceDeviation,
  checkStalePrice,
  checkTrustworthySource,
} from './limits';

describe('checkPositionSize', () => {
  it('passes at or under the max', () => {
    expect(checkPositionSize(500, 1000).passed).toBe(true);
    expect(checkPositionSize(1000, 1000).passed).toBe(true);
  });
  it('fails over the max, with a reason', () => {
    const result = checkPositionSize(1001, 1000);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/exceeds/);
  });
});

describe('checkLeverage', () => {
  it('passes at or under the max', () => {
    expect(checkLeverage(10, 10).passed).toBe(true);
  });
  it('fails over the max', () => {
    expect(checkLeverage(11, 10).passed).toBe(false);
  });
});

describe('checkMaxOpenPositions', () => {
  it('passes when under the cap', () => {
    expect(checkMaxOpenPositions(4, 5).passed).toBe(true);
  });
  it('fails when already at the cap', () => {
    const result = checkMaxOpenPositions(5, 5);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/maximum/);
  });
});

describe('checkPriceDeviation', () => {
  it('passes within the allowed deviation', () => {
    expect(checkPriceDeviation(101, 100, 2).passed).toBe(true);
  });
  it('fails outside the allowed deviation, in either direction', () => {
    expect(checkPriceDeviation(103, 100, 2).passed).toBe(false);
    expect(checkPriceDeviation(97, 100, 2).passed).toBe(false);
  });
  it('fails safe when the market price is not available', () => {
    const result = checkPriceDeviation(100, 0, 2);
    expect(result.passed).toBe(false);
  });
});

describe('checkStalePrice', () => {
  it('passes when data is fresh enough', () => {
    expect(checkStalePrice(1000, 30_000).passed).toBe(true);
  });
  it('fails when data is too old', () => {
    const result = checkStalePrice(31_000, 30_000);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/stale|old|exceeding/i);
  });
});

describe('checkTrustworthySource (DATA-RECOVERY-001)', () => {
  it('passes when the reference price is Hyperliquid-sourced', () => {
    expect(checkTrustworthySource('hyperliquid').passed).toBe(true);
  });
  it('fails when the reference price is CoinGecko-fallback-sourced, with a reason naming the actual source', () => {
    const result = checkTrustworthySource('coingecko');
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/coingecko/i);
  });
});
