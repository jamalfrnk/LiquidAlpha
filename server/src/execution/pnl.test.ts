import { describe, it, expect } from 'vitest';
import { calculateUnrealizedPnl, weightedAverageEntryPrice } from './pnl';

describe('calculateUnrealizedPnl', () => {
  it('LONG profits when price rises above entry', () => {
    expect(calculateUnrealizedPnl('LONG', 100, 110, 2)).toBeCloseTo(20, 10);
  });
  it('LONG loses when price falls below entry', () => {
    expect(calculateUnrealizedPnl('LONG', 100, 90, 2)).toBeCloseTo(-20, 10);
  });
  it('SHORT profits when price falls below entry', () => {
    expect(calculateUnrealizedPnl('SHORT', 100, 90, 2)).toBeCloseTo(20, 10);
  });
  it('SHORT loses when price rises above entry', () => {
    expect(calculateUnrealizedPnl('SHORT', 100, 110, 2)).toBeCloseTo(-20, 10);
  });
  it('is zero at breakeven', () => {
    expect(calculateUnrealizedPnl('LONG', 100, 100, 5)).toBe(0);
  });
});

describe('weightedAverageEntryPrice', () => {
  it('averages two equal-sized fills evenly', () => {
    expect(weightedAverageEntryPrice(1, 100, 1, 200)).toBeCloseTo(150, 10);
  });
  it('weights toward the larger fill', () => {
    expect(weightedAverageEntryPrice(1, 100, 3, 200)).toBeCloseTo(175, 10);
  });
  it('is unchanged when adding a fill at the same price', () => {
    expect(weightedAverageEntryPrice(2, 100, 5, 100)).toBeCloseTo(100, 10);
  });
});
