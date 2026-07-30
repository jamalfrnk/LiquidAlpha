import { describe, it, expect } from 'vitest';
import { isMarketable } from './marketability';

describe('isMarketable', () => {
  it('market orders are always marketable', () => {
    expect(isMarketable('MARKET', 'LONG', null, 100)).toBe(true);
    expect(isMarketable('MARKET', 'SHORT', null, 100)).toBe(true);
  });

  it('a LONG limit is marketable once the limit price is at or above current price', () => {
    expect(isMarketable('LIMIT', 'LONG', 101, 100)).toBe(true);
    expect(isMarketable('LIMIT', 'LONG', 100, 100)).toBe(true);
    expect(isMarketable('LIMIT', 'LONG', 99, 100)).toBe(false);
  });

  it('a SHORT limit is marketable once the limit price is at or below current price', () => {
    expect(isMarketable('LIMIT', 'SHORT', 99, 100)).toBe(true);
    expect(isMarketable('LIMIT', 'SHORT', 100, 100)).toBe(true);
    expect(isMarketable('LIMIT', 'SHORT', 101, 100)).toBe(false);
  });

  it('a limit order with no limit price is never marketable', () => {
    expect(isMarketable('LIMIT', 'LONG', null, 100)).toBe(false);
  });
});
