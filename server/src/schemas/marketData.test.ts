import { describe, it, expect } from 'vitest';
import { zipMetaAndAssetCtxs, normalizeHyperliquidCandle, type HyperliquidAssetMeta, type HyperliquidAssetCtx } from './marketData';

describe('zipMetaAndAssetCtxs', () => {
  const meta: HyperliquidAssetMeta[] = [
    { name: 'BTC', szDecimals: 5, maxLeverage: 50 },
    { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
  ];

  it('pairs each universe entry with its index-aligned context and computes a 24h percent change from prevDayPx', () => {
    const ctxs: HyperliquidAssetCtx[] = [
      { dayNtlVlm: '1000000', funding: '0.00001', markPx: '65000', midPx: '64990', prevDayPx: '64000' },
      { dayNtlVlm: '500000', funding: '0.00002', markPx: '3500', midPx: null, prevDayPx: '3600' },
    ];

    const result = zipMetaAndAssetCtxs(meta, ctxs);

    expect(result[0]).toMatchObject({ symbol: 'BTC', price: '64990', volume24h: '1000000' });
    expect(result[0].changePercent24h).toBeCloseTo(((64990 - 64000) / 64000) * 100, 5);

    // midPx null -> falls back to markPx.
    expect(result[1]).toMatchObject({ symbol: 'ETH', price: '3500', volume24h: '500000' });
    expect(result[1].changePercent24h).toBeCloseTo(((3500 - 3600) / 3600) * 100, 5);
  });

  it('drops entries beyond the shorter array instead of guessing at a pairing', () => {
    const ctxs: HyperliquidAssetCtx[] = [
      { dayNtlVlm: '1000000', funding: '0.00001', markPx: '65000', midPx: '64990', prevDayPx: '64000' },
    ];

    const result = zipMetaAndAssetCtxs(meta, ctxs);

    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('BTC');
  });

  it('treats a zero or missing prevDayPx as an undefined 24h change (0) rather than dividing by zero', () => {
    const ctxs: HyperliquidAssetCtx[] = [
      { dayNtlVlm: '0', funding: '0', markPx: '1', midPx: '1', prevDayPx: '0' },
    ];

    const result = zipMetaAndAssetCtxs([meta[0]], ctxs);

    expect(result[0].changePercent24h).toBe(0);
  });
});

describe('normalizeHyperliquidCandle', () => {
  it('marks a candle closed when its close time has already passed', () => {
    const receivedAt = new Date(2000);
    const candle = normalizeHyperliquidCandle(
      { t: 500, T: 1000, s: 'BTC', i: '1m', o: '100', c: '101', h: '102', l: '99', v: '10', n: 5 },
      receivedAt,
    );

    expect(candle.closed).toBe(true);
    expect(candle.venue).toBe('hyperliquid');
    expect(candle.marketType).toBe('perp');
  });

  it('marks a candle not yet closed when its close time is still in the future', () => {
    const receivedAt = new Date(500);
    const candle = normalizeHyperliquidCandle(
      { t: 0, T: 1000, s: 'BTC', i: '1m', o: '100', c: '101', h: '102', l: '99', v: '10', n: 5 },
      receivedAt,
    );

    expect(candle.closed).toBe(false);
  });
});
