import { describe, it, expect } from 'vitest';
import { applySlippage } from './slippage';

describe('applySlippage', () => {
  it('fills a LONG (buy) slightly above quote -- worse for the trader', () => {
    const filled = applySlippage(100, 'LONG', 5);
    expect(filled).toBeGreaterThan(100);
    expect(filled).toBeCloseTo(100.05, 5);
  });

  it('fills a SHORT (sell) slightly below quote -- worse for the trader', () => {
    const filled = applySlippage(100, 'SHORT', 5);
    expect(filled).toBeLessThan(100);
    expect(filled).toBeCloseTo(99.95, 5);
  });

  it('never favors the trader, regardless of slippage magnitude', () => {
    expect(applySlippage(100, 'LONG', 50)).toBeGreaterThan(100);
    expect(applySlippage(100, 'SHORT', 50)).toBeLessThan(100);
  });
});
