import { describe, it, expect } from 'vitest';
import { evaluateSignal, RULE_VERSION } from './technical-analysis';

function acceleratingUptrend(length = 250): number[] {
  return Array.from({ length }, (_, i) => 100 + i * 0.2 + Math.max(0, i - 200) * 1.5);
}

function acceleratingDowntrend(length = 250): number[] {
  return Array.from({ length }, (_, i) => 300 - i * 0.2 - Math.max(0, i - 200) * 1.5);
}

/** Steady uptrend that reverses sharply in the last few bars -- slow EMAs
 * still read "bullish trend" while the faster MACD histogram has already
 * flipped negative. Trend and momentum disagreeing should produce no
 * signal at all, regardless of how strong either one looks in isolation. */
function trendMomentumConflict(length = 250): number[] {
  return Array.from({ length }, (_, i) => {
    if (i < length - 10) return 100 + i * 0.5;
    return 100 + (length - 10) * 0.5 - (i - (length - 10)) * 3;
  });
}

describe('evaluateSignal', () => {
  it('returns null when there is not enough history', () => {
    expect(evaluateSignal(acceleratingUptrend(100))).toBeNull();
  });

  it('returns null when trend and momentum disagree, even with a strong prior trend', () => {
    expect(evaluateSignal(trendMomentumConflict())).toBeNull();
  });

  it('produces a LONG signal for an accelerating uptrend', () => {
    const result = evaluateSignal(acceleratingUptrend());
    expect(result).not.toBeNull();
    expect(result!.signalType).toBe('LONG');
    expect(result!.ruleVersion).toBe(RULE_VERSION);
  });

  it('produces a SHORT signal for an accelerating downtrend', () => {
    const result = evaluateSignal(acceleratingDowntrend());
    expect(result).not.toBeNull();
    expect(result!.signalType).toBe('SHORT');
  });

  it('LONG stop-loss is always below entry, take-profit always above', () => {
    const result = evaluateSignal(acceleratingUptrend())!;
    expect(result.stopLoss).toBeLessThan(result.entryPrice);
    expect(result.takeProfit).toBeGreaterThan(result.entryPrice);
  });

  it('SHORT stop-loss is always above entry, take-profit always below', () => {
    const result = evaluateSignal(acceleratingDowntrend())!;
    expect(result.stopLoss).toBeGreaterThan(result.entryPrice);
    expect(result.takeProfit).toBeLessThan(result.entryPrice);
  });

  it('risk/reward ratio meets the configured minimum by construction, for both directions', () => {
    const long = evaluateSignal(acceleratingUptrend())!;
    const longRisk = Math.abs(long.entryPrice - long.stopLoss);
    const longReward = Math.abs(long.takeProfit - long.entryPrice);
    expect(longReward / longRisk).toBeCloseTo(long.riskRewardRatio, 6);
    expect(long.riskRewardRatio).toBeGreaterThanOrEqual(2);

    const short = evaluateSignal(acceleratingDowntrend())!;
    const shortRisk = Math.abs(short.stopLoss - short.entryPrice);
    const shortReward = Math.abs(short.entryPrice - short.takeProfit);
    expect(shortReward / shortRisk).toBeCloseTo(short.riskRewardRatio, 6);
  });

  it('rule alignment score stays within [40, 100] -- the gate plus up to 5 weighted confirmations', () => {
    const result = evaluateSignal(acceleratingUptrend())!;
    expect(result.ruleAlignmentScore).toBeGreaterThanOrEqual(40);
    expect(result.ruleAlignmentScore).toBeLessThanOrEqual(100);
  });

  it('never calls the score "confidence" or a probability in its own explanation text', () => {
    const result = evaluateSignal(acceleratingUptrend())!;
    expect(result.explanation.toLowerCase()).not.toContain('confidence');
    expect(result.explanation.toLowerCase()).not.toContain('probability');
  });

  it('captures a full indicator snapshot', () => {
    const result = evaluateSignal(acceleratingUptrend())!;
    expect(result.indicatorSnapshot).toMatchObject({
      ema50: expect.any(Number),
      ema200: expect.any(Number),
      macdHist: expect.any(Number),
      rsi: expect.any(Number),
      adx: expect.any(Number),
      fisher: expect.any(Number),
      keltnerUpper: expect.any(Number),
      keltnerLower: expect.any(Number),
      atr: expect.any(Number),
    });
  });
});
