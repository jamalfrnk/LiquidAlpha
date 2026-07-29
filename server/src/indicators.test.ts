import { describe, it, expect } from 'vitest';
import { ema, macd, rsi, atr, fisherTransform, adx, keltnerChannel } from './indicators';

describe('ema', () => {
  it('stays constant on a flat series', () => {
    const result = ema([5, 5, 5, 5, 5], 3);
    expect(result).toEqual([5, 5, 5, 5, 5]);
  });

  it('matches hand-computed values for a simple two-point series', () => {
    // period=3 -> k = 2/(3+1) = 0.5. Seed = 10, then 20*0.5 + 10*0.5 = 15.
    const result = ema([10, 20], 3);
    expect(result[0]).toBe(10);
    expect(result[1]).toBeCloseTo(15, 10);
  });

  it('returns the input unchanged when period <= 1', () => {
    expect(ema([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
});

describe('rsi', () => {
  it('is 100 for a pure uptrend (all gains, zero losses) -- not 0', () => {
    // Regression test: avgLoss === 0 used to be treated as rs=0, which
    // computed RSI=0 (maximally oversold) for what should be RSI=100
    // (maximally overbought, since there were no losses at all).
    const series = Array.from({ length: 20 }, (_, i) => 100 + i); // strictly increasing
    const result = rsi(series, 14);
    expect(result[14]).toBe(100);
    expect(result[19]).toBe(100);
  });

  it('is 0 for a pure downtrend (all losses, zero gains)', () => {
    const series = Array.from({ length: 20 }, (_, i) => 100 - i); // strictly decreasing
    const result = rsi(series, 14);
    expect(result[14]).toBe(0);
    expect(result[19]).toBe(0);
  });

  it('is 50 for a perfectly flat series (no movement at all)', () => {
    const series = new Array(20).fill(100);
    const result = rsi(series, 14);
    expect(result[14]).toBe(50);
  });

  it('stays within [0, 100] for a mixed series', () => {
    const series = [100, 102, 101, 105, 103, 108, 106, 110, 107, 112, 109, 115, 111, 118, 116, 120];
    const result = rsi(series, 14);
    for (const value of result) {
      if (!isNaN(value)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('macd', () => {
  it('returns empty arrays when the series is too short', () => {
    const result = macd([1, 2, 3], 12, 26, 9);
    expect(result.macd).toEqual([]);
    expect(result.signal).toEqual([]);
    expect(result.hist).toEqual([]);
  });

  it('histogram is the macd line minus the signal line at every index', () => {
    const series = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 10);
    const { macd: macdLine, signal, hist } = macd(series);
    for (let i = 0; i < macdLine.length; i++) {
      expect(hist[i]).toBeCloseTo(macdLine[i] - (signal[i] ?? 0), 10);
    }
  });
});

describe('atr', () => {
  it('degenerates to average absolute price change when high=low=close', () => {
    // Documented tick-data behavior: with no real high/low, true range is
    // just abs(close[i] - close[i-1]).
    const closes = [100, 105, 95, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    const result = atr(closes, closes, closes, 5);
    // First ATR (index 4) = mean of |5|,|10|,|5|,|0|,|0| = 20/5 = 4
    expect(result[4]).toBeCloseTo(4, 10);
  });

  it('is always non-negative', () => {
    const closes = Array.from({ length: 30 }, () => 100 + (Math.random() - 0.5) * 10);
    const result = atr(closes, closes, closes, 14);
    for (const value of result) {
      if (!isNaN(value) && value !== undefined) expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('fisherTransform', () => {
  it('leaves the first period-1 entries as NaN', () => {
    const series = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = fisherTransform(series, 10);
    for (let i = 0; i < 9; i++) expect(result[i]).toBeNaN();
    expect(result[9]).not.toBeNaN();
  });

  it('does not throw and stays finite on a flat series (zero range)', () => {
    const series = new Array(20).fill(100);
    const result = fisherTransform(series, 10);
    for (const value of result) {
      if (!isNaN(value)) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('is positive while price is near the top of its recent range, negative near the bottom', () => {
    // Ramp up then down through the same range -- Fisher should track sign.
    const up = Array.from({ length: 15 }, (_, i) => 100 + i);
    const down = Array.from({ length: 15 }, (_, i) => 114 - i);
    const result = fisherTransform([...up, ...down], 10);
    expect(result[14]).toBeGreaterThan(0); // at the peak
    expect(result[result.length - 1]).toBeLessThan(0); // back near the bottom
  });
});

describe('adx', () => {
  it('is higher for a strongly trending series than a choppy sideways one', () => {
    const trending = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
    // Small alternating noise, not a perfectly flat series -- true range of
    // exactly 0 everywhere makes ADX genuinely undefined (0/0), which is a
    // separate, pathological case from "low but real" trend strength.
    const choppy = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 === 0 ? 0.5 : -0.5));
    const trendingAdx = adx(trending, 14);
    const choppyAdx = adx(choppy, 14);
    const lastTrending = trendingAdx[trendingAdx.length - 1];
    const lastChoppy = choppyAdx[choppyAdx.length - 1];
    expect(lastTrending).not.toBeNaN();
    expect(lastChoppy).not.toBeNaN();
    expect(lastTrending).toBeGreaterThan(lastChoppy);
  });

  it('stays within [0, 100]', () => {
    const series = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 2) * 15);
    const result = adx(series, 14);
    for (const value of result) {
      if (!isNaN(value)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('keltnerChannel', () => {
  it('upper is always above middle, and middle always above lower, wherever ATR is defined', () => {
    const series = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 10 + i * 0.1);
    const { middle, upper, lower } = keltnerChannel(series, 20, 10, 2);
    for (let i = 0; i < series.length; i++) {
      if (isNaN(middle[i]) || isNaN(upper[i]) || isNaN(lower[i])) continue;
      expect(upper[i]).toBeGreaterThanOrEqual(middle[i]);
      expect(middle[i]).toBeGreaterThanOrEqual(lower[i]);
    }
  });
});
