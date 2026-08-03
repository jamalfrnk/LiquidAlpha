import { describe, it, expect } from 'vitest';
import { computeFee, estimateLiquidationPrice, computeFundingCost, FUNDING_INTERVAL_MS, DEFAULT_FEE_BPS } from './fillModel';

describe('computeFee', () => {
  it('computes fee as a fraction of notional', () => {
    expect(computeFee(1000, 10)).toBeCloseTo(1, 6); // 0.1% of 1000
  });

  it('defaults to DEFAULT_FEE_BPS when not specified', () => {
    expect(computeFee(1000)).toBeCloseTo(computeFee(1000, DEFAULT_FEE_BPS), 6);
  });

  it('is zero at zero notional', () => {
    expect(computeFee(0, 10)).toBe(0);
  });
});

describe('estimateLiquidationPrice', () => {
  it('is below entry price for a LONG, and the gap narrows as leverage decreases', () => {
    const highLev = estimateLiquidationPrice(100, 10, 'LONG');
    const lowLev = estimateLiquidationPrice(100, 2, 'LONG');
    expect(highLev).toBeLessThan(100);
    expect(lowLev).toBeLessThan(100);
    // Higher leverage means liquidation is closer to entry (less room to move against the position).
    expect(highLev).toBeGreaterThan(lowLev);
  });

  it('is above entry price for a SHORT, and the gap narrows as leverage decreases', () => {
    const highLev = estimateLiquidationPrice(100, 10, 'SHORT');
    const lowLev = estimateLiquidationPrice(100, 2, 'SHORT');
    expect(highLev).toBeGreaterThan(100);
    expect(lowLev).toBeGreaterThan(100);
    expect(highLev).toBeLessThan(lowLev);
  });

  it('still returns a small nonzero maintenance-margin buffer at leverage 1, not exactly 0', () => {
    const result = estimateLiquidationPrice(100, 1, 'LONG');
    expect(result).toBeCloseTo(100 * 0.005, 6);
    expect(result).toBeGreaterThan(0);
  });
});

describe('computeFundingCost', () => {
  it('a LONG position pays (positive cost) when funding rate is positive', () => {
    const cost = computeFundingCost(1000, 0.0001, 'LONG', FUNDING_INTERVAL_MS);
    expect(cost).toBeCloseTo(1000 * 0.0001, 6);
  });

  it('a SHORT position receives (negative cost) when funding rate is positive', () => {
    const cost = computeFundingCost(1000, 0.0001, 'SHORT', FUNDING_INTERVAL_MS);
    expect(cost).toBeCloseTo(-1000 * 0.0001, 6);
  });

  it('pro-rates linearly by elapsed time relative to the real funding interval', () => {
    const full = computeFundingCost(1000, 0.0001, 'LONG', FUNDING_INTERVAL_MS);
    const half = computeFundingCost(1000, 0.0001, 'LONG', FUNDING_INTERVAL_MS / 2);
    expect(half).toBeCloseTo(full / 2, 6);
  });

  it('is zero at zero elapsed time', () => {
    expect(computeFundingCost(1000, 0.0001, 'LONG', 0)).toBe(0);
  });
});
