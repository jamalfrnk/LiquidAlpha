import { db } from './db/index';
import { signals } from './db/schema';
import { getPriceHistory, HISTORY_LIMIT } from './price-history';
import { ema, macd, rsi, atr, adx, fisherTransform, keltnerChannel } from './indicators';
import { STALE_AFTER_MS } from './market-data/ingestion';
import { isGloballyHalted } from './risk/killSwitch';
import { computeSignalScore } from './signals/signalScore';
import type { SignalScore } from './schemas/signalScore';

/**
 * Signal generation engine.
 *
 * Evaluates a multi-indicator confluence -- EMA50/EMA200 trend, MACD
 * momentum, RSI, ADX (trend strength), Fisher Transform (turning points),
 * and Keltner Channel (breakout) -- and produces a directional signal with
 * a `ruleAlignmentScore`, not a "confidence": it's an explicit count of how
 * many rules agreed, versioned via RULE_VERSION, not a calibrated
 * probability of anything (GH F-5, Replit H-3 -- the "N confirmations = a
 * flat X% confidence" pattern flagged in both audits).
 *
 * The decision logic (evaluateSignal) is a pure function over price data,
 * deliberately separated from the DB orchestration (generateSignals) below
 * it -- same pattern used for the auth module -- so it's unit-testable
 * without a database.
 */

export const RULE_VERSION = 'v2';
/** Minimum closes evaluateSignal needs before EMA200 is meaningful -- exported so callers (e.g. the backtest engine, BACKTEST-001) can validate a dataset has enough history before running, without duplicating this threshold. */
export const MIN_HISTORY = 210;
const ATR_STOP_MULTIPLIER = 1.5;
const MIN_RISK_REWARD = 2; // enforced by construction, not checked after the fact
const EMA_SEPARATION_THRESHOLD = 0.005; // 0.5%
const ADX_TREND_THRESHOLD = 25;

export interface IndicatorSnapshot {
  ema50: number;
  ema200: number;
  macdHist: number;
  rsi: number;
  adx: number;
  fisher: number;
  keltnerUpper: number;
  keltnerLower: number;
  atr: number;
}

export interface SignalEvaluation {
  signalType: 'LONG' | 'SHORT';
  ruleAlignmentScore: number;
  ruleVersion: string;
  explanation: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  indicatorSnapshot: IndicatorSnapshot;
}

/**
 * Pure decision function: given a chronological (oldest-first) closing
 * price series, decides whether a signal fires and, if so, everything
 * needed to record it. Returns null when there isn't enough history, when
 * trend and momentum disagree (no directional call to make), or when the
 * computed indicators are still NaN (warm-up period).
 */
export function evaluateSignal(closes: number[]): SignalEvaluation | null {
  if (closes.length < MIN_HISTORY) return null;

  const ema50Series = ema(closes, 50);
  const ema200Series = ema(closes, 200);
  const macdResult = macd(closes, 12, 26, 9);
  const rsiSeries = rsi(closes, 14);
  const adxSeries = adx(closes, 14);
  const fisherSeries = fisherTransform(closes, 10);
  const keltner = keltnerChannel(closes, 20, 10, 2);
  const atrSeries = atr(closes, closes, closes, 14);

  const last = closes.length - 1;
  const ema50Value = ema50Series[last];
  const ema200Value = ema200Series[last];
  const macdHist = macdResult.hist[macdResult.hist.length - 1];
  const rsiValue = rsiSeries[last];
  const adxValue = adxSeries[last];
  const fisherValue = fisherSeries[last];
  const keltnerUpper = keltner.upper[last];
  const keltnerLower = keltner.lower[last];
  const atrValue = atrSeries[last];

  if ([ema50Value, ema200Value, macdHist, atrValue].some((v) => v === undefined || isNaN(v))) return null;

  const trendBullish = ema50Value > ema200Value;
  const momentumBullish = macdHist > 0;
  const bullish = trendBullish && momentumBullish;
  const bearish = !trendBullish && !momentumBullish;
  if (!bullish && !bearish) return null; // conflicting trend/momentum -- no call

  const entryPrice = closes[last];

  // Additional confirmations, each an independent vote for the same
  // direction the trend+momentum gate already settled on.
  let rsiConfirms = false;
  if (!isNaN(rsiValue)) {
    if (rsiValue < 30) rsiConfirms = bullish;
    else if (rsiValue > 70) rsiConfirms = bearish;
    else rsiConfirms = true; // neutral RSI doesn't contradict the trend
  }
  const adxConfirms = !isNaN(adxValue) && adxValue > ADX_TREND_THRESHOLD;
  const fisherConfirms = !isNaN(fisherValue) && (bullish ? fisherValue > 0 : fisherValue < 0);
  const keltnerConfirms = bullish ? entryPrice > keltnerUpper : entryPrice < keltnerLower;
  const emaSeparationConfirms = Math.abs(ema50Value - ema200Value) / ema200Value > EMA_SEPARATION_THRESHOLD;

  const confirmations = [rsiConfirms, adxConfirms, fisherConfirms, keltnerConfirms, emaSeparationConfirms];
  const confirmCount = confirmations.filter(Boolean).length;
  // 40 base (the trend+momentum gate itself) + up to 12 per additional
  // confirmation, capped at 100 by construction (40 + 5*12 = 100).
  const ruleAlignmentScore = 40 + confirmCount * 12;

  const signalType: 'LONG' | 'SHORT' = bullish ? 'LONG' : 'SHORT';
  const riskDistance = ATR_STOP_MULTIPLIER * atrValue;
  const stopLoss = bullish ? entryPrice - riskDistance : entryPrice + riskDistance;
  const takeProfit = bullish
    ? entryPrice + riskDistance * MIN_RISK_REWARD
    : entryPrice - riskDistance * MIN_RISK_REWARD;

  const explanation =
    `${signalType} signal: trend and momentum aligned ` +
    `(EMA50 ${trendBullish ? 'above' : 'below'} EMA200, MACD histogram ${momentumBullish ? 'positive' : 'negative'}). ` +
    `Confirmed by ${confirmCount} of 5 additional checks (RSI, ADX, Fisher Transform, Keltner breakout, EMA separation).`;

  return {
    signalType,
    ruleAlignmentScore,
    ruleVersion: RULE_VERSION,
    explanation,
    entryPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio: MIN_RISK_REWARD,
    indicatorSnapshot: {
      ema50: ema50Value,
      ema200: ema200Value,
      macdHist,
      rsi: rsiValue,
      adx: adxValue,
      fisher: fisherValue,
      keltnerUpper,
      keltnerLower,
      atr: atrValue,
    },
  };
}

/** IndicatorSnapshot stores raw NaN for indicators still in their warm-up period (see the `.some(isNaN)` gate above, which only applies to the required ones); computeSignalScore expects `null` for "unavailable" rather than NaN. */
function nanToNull(value: number): number | null {
  return isNaN(value) ? null : value;
}

/**
 * Generates trading signals for a fixed set of assets. Fetches recent price
 * history, applies a stale-price guard (skips a symbol entirely if its most
 * recent observation is older than STALE_AFTER_MS -- the same freshness
 * threshold market-data/ingestion.ts uses -- rather than generating a
 * signal from data nobody would call current), and persists the full
 * evaluation, including the evidence snapshot, for any that fire.
 *
 * Checked against the global kill switch first: a platform-wide halt
 * should stop new recommendations from being generated at all, not just
 * block execution of ones that already exist -- execution doesn't exist
 * yet in this repo, so this is the one real enforcement point available
 * today (see risk/killSwitch.ts and risk/evaluate.ts for the rest of the
 * risk engine, ready but not yet wired to an execution path).
 *
 * Idempotent across calls: it does not deactivate or delete old signals;
 * consumers should interpret the most recent signal per asset as current.
 */
export async function generateSignals(): Promise<void> {
  if (isGloballyHalted()) {
    console.warn('Signal generation skipped: GLOBAL_KILL_SWITCH is enabled');
    return;
  }

  const symbols = ['BTC', 'ETH', 'SOL'];
  for (const symbol of symbols) {
    const history = await getPriceHistory(symbol, HISTORY_LIMIT);
    if (history.length < 210) {
      console.warn(`Skipping ${symbol}: not enough history (${history.length} < 210)`);
      continue;
    }

    const chronological = [...history].reverse(); // getPriceHistory returns newest-first
    const mostRecent = chronological[chronological.length - 1];
    const dataAgeMs = Date.now() - mostRecent.timestamp.getTime();
    if (dataAgeMs > STALE_AFTER_MS) {
      console.warn(`Skipping ${symbol}: most recent price data is ${dataAgeMs}ms old (stale-price guard)`);
      continue;
    }

    const closes = chronological.map((row) => parseFloat(row.price));
    const evaluation = evaluateSignal(closes);
    if (!evaluation) {
      console.info(`Skipping ${symbol}: no aligned signal this cycle`);
      continue;
    }

    const snapshot = evaluation.indicatorSnapshot;
    const signalScore: SignalScore = computeSignalScore({
      ema50: nanToNull(snapshot.ema50),
      ema200: nanToNull(snapshot.ema200),
      macdHist: nanToNull(snapshot.macdHist),
      rsi: nanToNull(snapshot.rsi),
      adx: nanToNull(snapshot.adx),
      fisher: nanToNull(snapshot.fisher),
      keltnerUpper: nanToNull(snapshot.keltnerUpper),
      keltnerLower: nanToNull(snapshot.keltnerLower),
      atr: nanToNull(snapshot.atr),
      price: evaluation.entryPrice,
      dataAgeMs,
      staleAfterMs: STALE_AFTER_MS,
      signalEngineVersion: evaluation.ruleVersion,
      sourceDataFrom: chronological[0].timestamp.toISOString(),
      sourceDataTo: mostRecent.timestamp.toISOString(),
    });

    await db.insert(signals).values({
      asset: symbol,
      signalType: evaluation.signalType,
      status: 'ACTIVE',
      ruleAlignmentScore: evaluation.ruleAlignmentScore.toString(),
      ruleVersion: evaluation.ruleVersion,
      explanation: evaluation.explanation,
      entryPrice: evaluation.entryPrice.toString(),
      stopLoss: evaluation.stopLoss.toString(),
      takeProfit: evaluation.takeProfit.toString(),
      riskRewardRatio: evaluation.riskRewardRatio.toString(),
      indicatorSnapshot: evaluation.indicatorSnapshot,
      signalScore,
      dataFrom: chronological[0].timestamp,
      dataTo: mostRecent.timestamp,
      barCount: chronological.length,
      dataQuality: 'fresh',
    });
  }
}
