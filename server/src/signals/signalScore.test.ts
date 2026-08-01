import { describe, it, expect } from 'vitest';
import { computeSignalScore, type SignalScoreInput } from './signalScore';
import { SCORE_MODEL_VERSION } from '../schemas/signalScore';

const PRICE = 50_000;

function baseInput(overrides: Partial<SignalScoreInput> = {}): SignalScoreInput {
  return {
    ema50: 50_500, // > ema200 -- bullish trend, well beyond the 0.5% band vs 50000
    ema200: 50_000,
    macdHist: 300, // 0.6% of price -- beyond the 0.5% band, bullish
    rsi: 55, // neutral, no invalidation
    adx: 30, // > 25 threshold -- fully confirming
    fisher: 1.2, // positive -- agrees with LONG
    keltnerUpper: 49_500, // price (50000) already beyond upper band -- breakout confirmed
    keltnerLower: 48_000,
    atr: 500,
    price: PRICE,
    dataAgeMs: 1_000,
    staleAfterMs: 30_000,
    signalEngineVersion: 'v2',
    sourceDataFrom: '2026-08-01T00:00:00.000Z',
    sourceDataTo: '2026-08-01T01:00:00.000Z',
    ...overrides,
  };
}

describe('computeSignalScore', () => {
  it('scores near-100 when every indicator fully agrees, is available, and data is fresh', () => {
    const result = computeSignalScore(baseInput());
    expect(result.direction).toBe('LONG');
    expect(result.totalScore).toBeGreaterThanOrEqual(95);
    expect(result.conflictingConditions).toEqual([]);
    expect(result.invalidationConditions).toEqual([]);
    expect(result.indicatorsMissing).toEqual([]);
    expect(result.freshnessStatus).toBe('fresh');
  });

  it('scores exactly 0 with direction NEUTRAL when trend and momentum disagree', () => {
    const result = computeSignalScore(baseInput({ macdHist: -300 })); // bearish momentum vs bullish trend
    expect(result.direction).toBe('NEUTRAL');
    expect(result.totalScore).toBe(0);
    expect(result.conflictingConditions.length).toBeGreaterThan(0);
    expect(result.conflictingConditions[0]).toMatch(/disagrees/i);
  });

  it('scores exactly 0 with direction NEUTRAL when the trend itself cannot be determined', () => {
    const result = computeSignalScore(baseInput({ ema50: null }));
    expect(result.direction).toBe('NEUTRAL');
    expect(result.totalScore).toBe(0);
    expect(result.indicatorsMissing).toContain('ema50');
  });

  it('reduces but does not zero the score when a non-critical indicator is missing', () => {
    const full = computeSignalScore(baseInput());
    const missingAdx = computeSignalScore(baseInput({ adx: null }));
    expect(missingAdx.direction).toBe('LONG');
    expect(missingAdx.componentScores.trendStrengthConfirmation).toBe(0);
    expect(missingAdx.indicatorsMissing).toEqual(['adx']);
    expect(missingAdx.totalScore).toBeLessThan(full.totalScore);
    expect(missingAdx.totalScore).toBeGreaterThan(0);
  });

  it('reduces the dataFreshness component and total score for stale data, without affecting direction', () => {
    const fresh = computeSignalScore(baseInput());
    const stale = computeSignalScore(baseInput({ dataAgeMs: 60_000, staleAfterMs: 30_000 }));
    expect(stale.direction).toBe('LONG');
    expect(stale.freshnessStatus).toBe('stale');
    expect(stale.componentScores.dataFreshness).toBe(0);
    expect(stale.totalScore).toBeLessThan(fresh.totalScore);
  });

  it('caps the score at 15 when an invalidation condition fires, without flipping direction to NEUTRAL', () => {
    const result = computeSignalScore(baseInput({ rsi: 85 })); // overbought against a LONG thesis
    expect(result.direction).toBe('LONG');
    expect(result.invalidationConditions.length).toBeGreaterThan(0);
    expect(result.invalidationConditions[0]).toMatch(/overbought/i);
    expect(result.totalScore).toBeLessThanOrEqual(15);
  });

  it('is stable across repeated calls with identical input, and reports the current model/engine versions', () => {
    const input = baseInput();
    const first = computeSignalScore(input);
    const second = computeSignalScore(input);
    expect(second).toEqual(first);
    expect(first.scoreModelVersion).toBe(SCORE_MODEL_VERSION);
    expect(first.signalEngineVersion).toBe('v2');
  });

  it('always reports candleInterval as null (tick-level data, not fixed-interval candles)', () => {
    const result = computeSignalScore(baseInput());
    expect(result.candleInterval).toBeNull();
  });
});
