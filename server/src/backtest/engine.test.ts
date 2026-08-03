import { describe, it, expect } from 'vitest';
import { runBacktestEngineForSymbol, type BacktestEngineInput } from './engine';
import { evaluateSignal, MIN_HISTORY } from '../technical-analysis';
import type { NormalizedCandle, HyperliquidFundingHistoryEntry } from '../schemas/marketData';

const INTERVAL_MS = 60 * 60_000; // '1h'
const START_TIME = Date.UTC(2026, 0, 1, 0, 0, 0);

/** Same shape of accelerating trend used by technical-analysis.test.ts -- proven to fire a LONG signal via evaluateSignal. */
function acceleratingUptrend(length = 250): number[] {
  return Array.from({ length }, (_, i) => 100 + i * 0.2 + Math.max(0, i - 200) * 1.5);
}
function acceleratingDowntrend(length = 250): number[] {
  return Array.from({ length }, (_, i) => 300 - i * 0.2 - Math.max(0, i - 200) * 1.5);
}
/** A gentle, never-accelerating slope -- unlike acceleratingUptrend, per-candle movement stays small even long after the signal first fires, so a fixture can force a specific stop/target breach without the "natural" untouched candles also happening to cross it. */
function mildUptrend(length: number): number[] {
  return Array.from({ length }, (_, i) => 100 + i * 0.2);
}

/** Wraps a chronological closes array into tight-range synthetic candles -- high/low close enough to the close that they never accidentally trigger a stop/target hit unless a test deliberately overrides one. */
function closesToCandles(closes: number[], symbol = 'BTC', startTimeMs = START_TIME, intervalMs = INTERVAL_MS): NormalizedCandle[] {
  return closes.map((close, i) => {
    const openTime = new Date(startTimeMs + i * intervalMs);
    const closeTime = new Date(startTimeMs + (i + 1) * intervalMs);
    const open = i === 0 ? close : closes[i - 1];
    return {
      venue: 'hyperliquid',
      symbol,
      marketType: 'perp',
      interval: '1h',
      openTime,
      closeTime,
      sourceTimestamp: closeTime,
      receivedAt: closeTime,
      open: open.toString(),
      high: (Math.max(open, close) * 1.0001).toString(),
      low: (Math.min(open, close) * 0.9999).toString(),
      close: close.toString(),
      volume: '1000',
      closed: true,
    };
  });
}

function baseConfig(): Omit<BacktestEngineInput, 'symbol' | 'candles' | 'fundingEntries'> {
  return {
    interval: '1h',
    slippageBps: 0,
    feeBps: 0,
    fundingEnabled: false,
    maxHoldingCandles: 50,
    riskPerTradeNotional: 1000,
    leverage: 1,
    scoreModelEnabled: true,
  };
}

/** Runs the engine once on a generously long, unmodified series to discover exactly where the first signal fires, so exit-resolution fixtures can force a precise breach without guessing an index. */
function findFirstEntry(closes: number[]) {
  const probeCandles = closesToCandles(closes);
  const probe = runBacktestEngineForSymbol({
    ...baseConfig(),
    symbol: 'BTC',
    candles: probeCandles,
    fundingEntries: [],
    maxHoldingCandles: 1000,
  });
  if (probe.trades.length === 0) throw new Error('fixture bug: no trade fired in probe run');
  const entryTime = probe.trades[0].entryTime;
  const entryIndex = probeCandles.findIndex((c) => c.openTime.toISOString() === entryTime);
  const evaluation = evaluateSignal(closes.slice(0, entryIndex))!;
  return { entryIndex, evaluation };
}

describe('runBacktestEngineForSymbol', () => {
  describe('no-lookahead guarantee', () => {
    it('a signal decision at a given index is identical regardless of wildly different future candles', () => {
      const sharedPrefix = acceleratingUptrend(211); // exactly enough for one signal-eligible index at i=210
      const moonShotFuture = [...sharedPrefix, ...Array.from({ length: 60 }, (_, k) => sharedPrefix[210] + k * 500)];
      const crashFuture = [...sharedPrefix, ...Array.from({ length: 60 }, (_, k) => Math.max(1, sharedPrefix[210] - k * 50))];

      const candlesA = closesToCandles(moonShotFuture);
      const candlesB = closesToCandles(crashFuture);

      const resultA = runBacktestEngineForSymbol({ ...baseConfig(), symbol: 'BTC', candles: candlesA, fundingEntries: [] });
      const resultB = runBacktestEngineForSymbol({ ...baseConfig(), symbol: 'BTC', candles: candlesB, fundingEntries: [] });

      // Both datasets are byte-identical up through index 210 -- the entry
      // decision (whether a trade opens, its side, its entry time/price)
      // must be identical between the two runs even though what happens
      // afterward diverges wildly. Only the *resolution* (exit price/pnl)
      // may legitimately differ, since that depends on the diverging future.
      expect(resultA.trades.length).toBeGreaterThan(0);
      expect(resultB.trades.length).toBeGreaterThan(0);
      const firstA = resultA.trades[0];
      const firstB = resultB.trades[0];
      expect(firstA.side).toBe(firstB.side);
      expect(firstA.entryTime).toBe(firstB.entryTime);
      expect(firstA.entryPrice).toBe(firstB.entryPrice);
      expect(firstA.ruleAlignmentScore).toBe(firstB.ruleAlignmentScore);
    });

    it('a naive off-by-one that fed the signal candle itself into evaluateSignal would fail the above test -- documented as the exact bug class this guards against', () => {
      // Sanity-check the fixture itself: evaluateSignal on the shared prefix
      // alone must actually fire (otherwise the test above would pass
      // vacuously with zero trades).
      const sharedPrefix = acceleratingUptrend(211);
      const evaluation = evaluateSignal(sharedPrefix);
      expect(evaluation).not.toBeNull();
      expect(evaluation!.signalType).toBe('LONG');
    });
  });

  describe('signal generation and entry timing', () => {
    it('produces a LONG trade for an accelerating uptrend, entering at the next candle after signal generation, not the signal candle itself', () => {
      const candles = closesToCandles(acceleratingUptrend(230));
      const result = runBacktestEngineForSymbol({ ...baseConfig(), symbol: 'BTC', candles, fundingEntries: [] });

      expect(result.trades.length).toBeGreaterThan(0);
      const trade = result.trades[0];
      expect(trade.side).toBe('LONG');
      // Entry price must equal the entry candle's open (no slippage configured here), not the signal candle's close.
      const entryCandleIndex = candles.findIndex((c) => c.openTime.toISOString() === trade.entryTime);
      expect(entryCandleIndex).toBeGreaterThan(0);
      expect(trade.entryPrice).toBeCloseTo(parseFloat(candles[entryCandleIndex].open), 6);
    });

    it('produces a SHORT trade for an accelerating downtrend', () => {
      const candles = closesToCandles(acceleratingDowntrend(230));
      const result = runBacktestEngineForSymbol({ ...baseConfig(), symbol: 'BTC', candles, fundingEntries: [] });
      expect(result.trades.length).toBeGreaterThan(0);
      expect(result.trades[0].side).toBe('SHORT');
    });

    it('produces zero trades when there is not yet enough history for evaluateSignal to fire at all', () => {
      // Exactly MIN_HISTORY candles means the very last index the loop could
      // evaluate (candles.length - 2) still has only MIN_HISTORY - 1 closes
      // available -- one short of evaluateSignal's own minimum -- so the
      // loop must never execute its body at all, deterministically, whatever
      // the underlying trend looks like.
      const candles = closesToCandles(acceleratingUptrend(MIN_HISTORY));
      const result = runBacktestEngineForSymbol({ ...baseConfig(), symbol: 'BTC', candles, fundingEntries: [] });
      expect(result.trades).toEqual([]);
      expect(result.skippedSignalCount).toBe(0);
    });
  });

  describe('exit resolution', () => {
    it('resolves a stop-loss hit correctly for a LONG trade, at exactly the stop-loss price', () => {
      const fullCloses = mildUptrend(300);
      const { entryIndex, evaluation } = findFirstEntry(fullCloses);
      const closes = fullCloses.slice(0, entryIndex + 2); // warm-up + entry candle + one more, nothing beyond
      const candles = closesToCandles(closes);
      const riskDistance = Math.abs(evaluation.entryPrice - evaluation.stopLoss);
      const entryOpen = parseFloat(candles[entryIndex].open);
      const stopLevel = entryOpen - riskDistance;

      // Force the entry candle's low to breach the stop level.
      candles[entryIndex] = { ...candles[entryIndex], low: (stopLevel - 1).toString() };

      const result = runBacktestEngineForSymbol({ ...baseConfig(), symbol: 'BTC', candles, fundingEntries: [] });
      expect(result.trades.length).toBe(1);
      expect(result.trades[0].exitReason).toBe('stop-loss');
      expect(result.trades[0].exitPrice).toBeCloseTo(stopLevel, 6);
      expect(result.trades[0].pnl).toBeLessThan(0);
    });

    it('resolves a take-profit hit correctly for a LONG trade, at exactly the take-profit price', () => {
      const fullCloses = mildUptrend(300);
      const { entryIndex, evaluation } = findFirstEntry(fullCloses);
      const closes = fullCloses.slice(0, entryIndex + 2);
      const candles = closesToCandles(closes);
      const rewardDistance = Math.abs(evaluation.takeProfit - evaluation.entryPrice);
      const entryOpen = parseFloat(candles[entryIndex].open);
      const targetLevel = entryOpen + rewardDistance;

      candles[entryIndex] = { ...candles[entryIndex], high: (targetLevel + 1).toString() };

      const result = runBacktestEngineForSymbol({ ...baseConfig(), symbol: 'BTC', candles, fundingEntries: [] });
      expect(result.trades.length).toBe(1);
      expect(result.trades[0].exitReason).toBe('take-profit');
      expect(result.trades[0].exitPrice).toBeCloseTo(targetLevel, 6);
      expect(result.trades[0].pnl).toBeGreaterThan(0);
    });

    it('conservatively resolves a same-candle stop/target collision as a stop-loss, never a take-profit', () => {
      const fullCloses = mildUptrend(300);
      const { entryIndex, evaluation } = findFirstEntry(fullCloses);
      const closes = fullCloses.slice(0, entryIndex + 2);
      const candles = closesToCandles(closes);
      const riskDistance = Math.abs(evaluation.entryPrice - evaluation.stopLoss);
      const rewardDistance = Math.abs(evaluation.takeProfit - evaluation.entryPrice);
      const entryOpen = parseFloat(candles[entryIndex].open);
      const stopLevel = entryOpen - riskDistance;
      const targetLevel = entryOpen + rewardDistance;

      // This single candle's range spans BOTH the stop and the target.
      candles[entryIndex] = { ...candles[entryIndex], low: (stopLevel - 1).toString(), high: (targetLevel + 1).toString() };

      const result = runBacktestEngineForSymbol({ ...baseConfig(), symbol: 'BTC', candles, fundingEntries: [] });
      expect(result.trades.length).toBe(1);
      expect(result.trades[0].exitReason).toBe('stop-loss');
    });

    it('closes at the final candle in the holding window when neither stop nor target is hit (time-exit), when there is enough data beyond it', () => {
      const fullCloses = mildUptrend(300);
      const { entryIndex } = findFirstEntry(fullCloses);
      // maxHoldingCandles of exactly 1 means only the entry candle's own
      // (unmodified, tight) range is checked -- proven too tight to
      // naturally breach stop/target by the "exit resolution" tests above,
      // which had to explicitly force a breach to get anything other than
      // a time-exit here.
      const closes = fullCloses.slice(0, entryIndex + 1);
      const candles = closesToCandles(closes);
      const result = runBacktestEngineForSymbol({
        ...baseConfig(),
        symbol: 'BTC',
        candles,
        fundingEntries: [],
        maxHoldingCandles: 1,
      });
      expect(result.trades.length).toBe(1);
      expect(result.trades[0].exitReason).toBe('time-exit');
      expect(result.trades[0].holdingCandles).toBe(1);
    });

    it('excludes (rather than resolves) a trade whose holding window runs past the end of the dataset, counting it as skipped', () => {
      const fullCloses = mildUptrend(300);
      const { entryIndex } = findFirstEntry(fullCloses);
      // Only 1 candle exists after entry, but maxHoldingCandles is 50 -- not
      // enough data to know the real outcome. (A larger trailing count risks
      // the mild uptrend's cumulative drift naturally crossing the take-profit
      // level before the window truncates, which is a legitimate resolution,
      // not the "ran out of data" case this test targets.)
      const closes = fullCloses.slice(0, entryIndex + 1 + 1);
      const candles = closesToCandles(closes);
      const result = runBacktestEngineForSymbol({
        ...baseConfig(),
        symbol: 'BTC',
        candles,
        fundingEntries: [],
        maxHoldingCandles: 50,
      });
      expect(result.trades).toEqual([]);
      expect(result.skippedSignalCount).toBe(1);
    });
  });

  describe('missing data (candle gaps)', () => {
    it('flags a trade whose holding window contains a candle-interval gap, without excluding it', () => {
      const fullCloses = mildUptrend(300);
      const { entryIndex } = findFirstEntry(fullCloses);
      const closes = fullCloses.slice(0, entryIndex + 5);
      const candles = closesToCandles(closes);
      // Introduce a gap: the candle right after entry jumps forward by 3 extra intervals' worth of time.
      const gappedCandle = candles[entryIndex + 1];
      candles[entryIndex + 1] = {
        ...gappedCandle,
        openTime: new Date(gappedCandle.openTime.getTime() + 3 * INTERVAL_MS),
        closeTime: new Date(gappedCandle.closeTime.getTime() + 3 * INTERVAL_MS),
      };

      const result = runBacktestEngineForSymbol({
        ...baseConfig(),
        symbol: 'BTC',
        candles,
        fundingEntries: [],
        maxHoldingCandles: 5,
      });
      expect(result.trades.length).toBe(1);
      expect(result.missingDataAffectedTradeCount).toBe(1);
    });
  });

  describe('fees, slippage, and funding', () => {
    it('a round-trip fee reduces net pnl by exactly notional * feeBps/10000', () => {
      const fullCloses = mildUptrend(300);
      const { entryIndex } = findFirstEntry(fullCloses);
      const closes = fullCloses.slice(0, entryIndex + 5);
      const candles = closesToCandles(closes);
      const withoutFees = runBacktestEngineForSymbol({
        ...baseConfig(),
        symbol: 'BTC',
        candles,
        fundingEntries: [],
        maxHoldingCandles: 5,
        feeBps: 0,
      });
      const withFees = runBacktestEngineForSymbol({
        ...baseConfig(),
        symbol: 'BTC',
        candles,
        fundingEntries: [],
        maxHoldingCandles: 5,
        feeBps: 10, // 0.1%
      });
      const notional = 1000 * 1; // riskPerTradeNotional * leverage
      const expectedFee = notional * (10 / 10_000);
      expect(withFees.trades[0].feesPaid).toBeCloseTo(expectedFee, 6);
      expect(withFees.trades[0].pnl).toBeCloseTo(withoutFees.trades[0].pnl - expectedFee, 6);
    });

    it('slippage makes a LONG entry fill at a worse (higher) price than the raw candle open', () => {
      const candles = closesToCandles(acceleratingUptrend(230));
      const noSlippage = runBacktestEngineForSymbol({ ...baseConfig(), symbol: 'BTC', candles, fundingEntries: [], slippageBps: 0 });
      const withSlippage = runBacktestEngineForSymbol({ ...baseConfig(), symbol: 'BTC', candles, fundingEntries: [], slippageBps: 20 });
      expect(withSlippage.trades[0].entryPrice).toBeGreaterThan(noSlippage.trades[0].entryPrice);
    });

    it('funding cost accrues only when fundingEnabled is true, using entries within the holding window', () => {
      const fullCloses = mildUptrend(300);
      const { entryIndex } = findFirstEntry(fullCloses);
      const closes = fullCloses.slice(0, entryIndex + 5);
      const candles = closesToCandles(closes);
      const entryTime = candles[entryIndex].openTime.getTime();
      const fundingEntries: HyperliquidFundingHistoryEntry[] = [
        { coin: 'BTC', fundingRate: '0.0001', premium: '0', time: entryTime + INTERVAL_MS },
      ];

      const disabled = runBacktestEngineForSymbol({
        ...baseConfig(),
        symbol: 'BTC',
        candles,
        fundingEntries,
        fundingEnabled: false,
        maxHoldingCandles: 5,
      });
      const enabled = runBacktestEngineForSymbol({
        ...baseConfig(),
        symbol: 'BTC',
        candles,
        fundingEntries,
        fundingEnabled: true,
        maxHoldingCandles: 5,
      });

      expect(disabled.trades[0].fundingPaid).toBe(0);
      expect(enabled.trades[0].fundingPaid).toBeCloseTo(1000 * 0.0001, 6); // LONG pays positive funding
      expect(enabled.trades[0].pnl).toBeCloseTo(disabled.trades[0].pnl - enabled.trades[0].fundingPaid, 6);
    });
  });

  describe('signal-strength scoring integration', () => {
    it('populates signalStrengthScore when scoreModelEnabled, leaves it null when disabled', () => {
      const candles = closesToCandles(acceleratingUptrend(230));
      const withScore = runBacktestEngineForSymbol({ ...baseConfig(), symbol: 'BTC', candles, fundingEntries: [], scoreModelEnabled: true });
      const withoutScore = runBacktestEngineForSymbol({ ...baseConfig(), symbol: 'BTC', candles, fundingEntries: [], scoreModelEnabled: false });

      expect(withScore.trades[0].signalStrengthScore).not.toBeNull();
      expect(withScore.trades[0].signalStrengthScore).toBeGreaterThanOrEqual(0);
      expect(withScore.trades[0].signalStrengthScore).toBeLessThanOrEqual(100);
      expect(withoutScore.trades[0].signalStrengthScore).toBeNull();
    });
  });

  describe('determinism', () => {
    it('produces byte-identical output across repeated runs with identical input', () => {
      const candles = closesToCandles(acceleratingUptrend(400));
      const input: BacktestEngineInput = { ...baseConfig(), symbol: 'BTC', candles, fundingEntries: [] };
      const first = runBacktestEngineForSymbol(input);
      const second = runBacktestEngineForSymbol(input);
      expect(second).toEqual(first);
    });
  });
});
