import {
  SCORE_MODEL_VERSION,
  type SignalScore,
  type SignalDirection,
  type SignalComponentScores,
} from '../schemas/signalScore';

/**
 * Explainable "Signal strength" score model (SIGNAL-SCORE-001).
 *
 * A pure, DB-free function -- same discipline as analytics/metrics.ts --
 * composing the indicators technical-analysis.ts already computes into a
 * single deterministic 0-100 score, six named component scores, and the
 * plain-language reasoning behind them. It does not invent new indicators;
 * every input here is one evaluateSignal() already produces.
 *
 * ## Weighting rationale (documented per the issue's requirement -- not
 * arbitrary numbers picked to "feel right"):
 *
 * - trendAgreement (25, highest): the EMA50/EMA200 relationship is the
 *   primary directional thesis every other component either confirms or
 *   undermines. If it disagrees with momentum at all, nothing else can
 *   meaningfully confirm a direction that hasn't been established -- see
 *   the conflict-handling below.
 * - momentumAgreement (20): the second half of evaluateSignal's own
 *   required gate (trend AND momentum must agree for a signal to exist at
 *   all), so it's weighted just under trend.
 * - trendStrengthConfirmation (15) and volatilitySuitability (15): two
 *   independent secondary confirmations of trade quality (is the trend
 *   actually strong per ADX; is price actually breaking out of its recent
 *   range per Keltner/ATR) -- weighted equally since neither is more
 *   fundamental than the other.
 * - dataFreshness (15): weighted on par with the secondary confirmations
 *   deliberately -- a mathematically perfect score computed from stale data
 *   is operationally worthless, so freshness isn't treated as a minor
 *   footnote.
 * - indicatorAvailability (10, lowest): an integrity/completeness check.
 *   Lowest weight because a single missing minor indicator shouldn't crater
 *   an otherwise well-supported score, but it still meaningfully reduces it.
 *
 * Weights sum to exactly 100, so a component score of 100 across the board
 * yields a total of exactly 100.
 *
 * ## Conflict and invalidation handling
 *
 * - If EMA trend and MACD momentum disagree (or the trend itself can't be
 *   determined because EMA data is unavailable), there is no coherent
 *   directional thesis to score the strength of -- direction is `NEUTRAL`
 *   and totalScore is forced to exactly 0, mirroring evaluateSignal's own
 *   choice to return no signal at all in this case.
 * - "Invalidation conditions" are secondary warning signs found on an
 *   otherwise-coherent directional read (RSI/Fisher pointing the opposite
 *   way, or price already breaking through the Keltner band against the
 *   thesis). Unlike an outright conflict, the directional call itself
 *   hasn't reversed -- only weakened -- so the score is capped at a low
 *   ceiling (15) rather than zeroed.
 */

const FULL_STRENGTH_BAND = 0.005; // 0.5% -- reuses technical-analysis.ts's EMA_SEPARATION_THRESHOLD as the "fully confirmed" reference band for every price-relative component, rather than inventing a separate arbitrary constant per component.
const ADX_TREND_THRESHOLD = 25; // reuses technical-analysis.ts's own ADX confirmation threshold.
const INVALIDATION_SCORE_CEILING = 15;

const WEIGHTS = {
  trendAgreement: 25,
  momentumAgreement: 20,
  trendStrengthConfirmation: 15,
  volatilitySuitability: 15,
  dataFreshness: 15,
  indicatorAvailability: 10,
} as const;

export interface SignalScoreInput {
  ema50: number | null;
  ema200: number | null;
  macdHist: number | null;
  rsi: number | null;
  adx: number | null;
  fisher: number | null;
  keltnerUpper: number | null;
  keltnerLower: number | null;
  atr: number | null;
  /** Current/entry price -- needed to express indicator magnitudes as a percentage of price. */
  price: number;
  dataAgeMs: number;
  staleAfterMs: number;
  signalEngineVersion: string;
  sourceDataFrom: string;
  sourceDataTo: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildExplanation(args: {
  direction: SignalDirection;
  isConflict: boolean;
  invalidationConditions: string[];
  freshnessStatus: 'fresh' | 'stale';
  indicatorsMissing: string[];
}): string {
  const { direction, isConflict, invalidationConditions, freshnessStatus, indicatorsMissing } = args;
  if (isConflict) {
    return (
      'Signal strength is 0: trend and momentum indicators disagree (or trend cannot be determined), ' +
      'so there is no coherent directional thesis to score.'
    );
  }
  const parts = [
    `${direction} signal strength reflects agreement across trend, momentum, trend-strength, and volatility indicators.`,
  ];
  if (invalidationConditions.length > 0) {
    parts.push(
      `Score is capped low because ${invalidationConditions.length} invalidation condition(s) were found: ${invalidationConditions.join(' ')}`,
    );
  }
  if (freshnessStatus === 'stale') {
    parts.push('Underlying price data is stale, reducing the data-freshness component.');
  }
  if (indicatorsMissing.length > 0) {
    parts.push(`${indicatorsMissing.length} indicator(s) unavailable this cycle: ${indicatorsMissing.join(', ')}.`);
  }
  return parts.join(' ');
}

export function computeSignalScore(input: SignalScoreInput): SignalScore {
  const {
    ema50,
    ema200,
    macdHist,
    rsi,
    adx,
    fisher,
    keltnerUpper,
    keltnerLower,
    atr,
    price,
    dataAgeMs,
    staleAfterMs,
    signalEngineVersion,
    sourceDataFrom,
    sourceDataTo,
  } = input;

  const fields: Record<string, number | null> = {
    ema50,
    ema200,
    macdHist,
    rsi,
    adx,
    fisher,
    keltnerUpper,
    keltnerLower,
    atr,
  };
  const indicatorsUsed = Object.entries(fields)
    .filter(([, v]) => v !== null)
    .map(([k]) => k);
  const indicatorsMissing = Object.entries(fields)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  const indicatorAvailability = (indicatorsUsed.length / Object.keys(fields).length) * 100;

  const freshnessStatus: 'fresh' | 'stale' = dataAgeMs <= staleAfterMs ? 'fresh' : 'stale';
  const freshnessRatio = dataAgeMs / staleAfterMs;
  const dataFreshness =
    freshnessRatio <= 0.5 ? 100 : freshnessRatio >= 1 ? 0 : 100 * (1 - (freshnessRatio - 0.5) / 0.5);

  const conflictingConditions: string[] = [];
  const invalidationConditions: string[] = [];

  let direction: SignalDirection = 'NEUTRAL';
  let trendBullish: boolean | null = null;

  if (ema50 === null || ema200 === null) {
    conflictingConditions.push('EMA50/EMA200 trend direction cannot be determined -- one or both are unavailable.');
  } else {
    trendBullish = ema50 > ema200;
    direction = trendBullish ? 'LONG' : 'SHORT';
  }

  if (trendBullish !== null && macdHist !== null) {
    const momentumBullish = macdHist > 0;
    if (momentumBullish !== trendBullish) {
      conflictingConditions.push('MACD momentum disagrees with the EMA trend direction.');
      direction = 'NEUTRAL';
    }
  }

  const isConflict = conflictingConditions.length > 0;

  let trendAgreement = 0;
  if (ema50 !== null && ema200 !== null && ema200 !== 0) {
    const separation = Math.abs(ema50 - ema200) / ema200;
    trendAgreement = clamp((separation / FULL_STRENGTH_BAND) * 100, 0, 100);
  }

  let momentumAgreement = 0;
  if (macdHist !== null && price > 0 && !isConflict && trendBullish !== null) {
    const macdPct = Math.abs(macdHist) / price;
    momentumAgreement = clamp((macdPct / FULL_STRENGTH_BAND) * 100, 0, 100);
  }

  let trendStrengthConfirmation = 0;
  if (adx !== null) {
    trendStrengthConfirmation = clamp((adx / ADX_TREND_THRESHOLD) * 100, 0, 100);
  }

  let volatilitySuitability = 0;
  if (keltnerUpper !== null && keltnerLower !== null && trendBullish !== null && !isConflict) {
    const breakoutDistance = trendBullish
      ? (price - keltnerUpper) / keltnerUpper
      : (keltnerLower - price) / keltnerLower;
    volatilitySuitability = clamp(50 + (breakoutDistance / FULL_STRENGTH_BAND) * 50, 0, 100);
  }

  if (!isConflict && trendBullish !== null) {
    if (rsi !== null) {
      if (trendBullish && rsi > 70) {
        invalidationConditions.push(`RSI is overbought (${rsi.toFixed(1)} > 70), undermining the LONG thesis.`);
      } else if (!trendBullish && rsi < 30) {
        invalidationConditions.push(`RSI is oversold (${rsi.toFixed(1)} < 30), undermining the SHORT thesis.`);
      }
    }
    if (fisher !== null) {
      if (trendBullish && fisher < 0) {
        invalidationConditions.push('Fisher Transform is negative, opposing the LONG thesis.');
      } else if (!trendBullish && fisher > 0) {
        invalidationConditions.push('Fisher Transform is positive, opposing the SHORT thesis.');
      }
    }
    if (keltnerUpper !== null && keltnerLower !== null) {
      if (trendBullish && price < keltnerLower) {
        invalidationConditions.push('Price has broken below the Keltner lower band, opposite the LONG thesis.');
      } else if (!trendBullish && price > keltnerUpper) {
        invalidationConditions.push('Price has broken above the Keltner upper band, opposite the SHORT thesis.');
      }
    }
  }

  const componentScores: SignalComponentScores = {
    trendAgreement: Math.round(trendAgreement),
    momentumAgreement: Math.round(momentumAgreement),
    trendStrengthConfirmation: Math.round(trendStrengthConfirmation),
    volatilitySuitability: Math.round(volatilitySuitability),
    dataFreshness: Math.round(dataFreshness),
    indicatorAvailability: Math.round(indicatorAvailability),
  };

  let totalScore: number;
  if (isConflict) {
    totalScore = 0;
  } else {
    const weighted =
      (componentScores.trendAgreement * WEIGHTS.trendAgreement +
        componentScores.momentumAgreement * WEIGHTS.momentumAgreement +
        componentScores.trendStrengthConfirmation * WEIGHTS.trendStrengthConfirmation +
        componentScores.volatilitySuitability * WEIGHTS.volatilitySuitability +
        componentScores.dataFreshness * WEIGHTS.dataFreshness +
        componentScores.indicatorAvailability * WEIGHTS.indicatorAvailability) /
      100;
    const capped = invalidationConditions.length > 0 ? Math.min(weighted, INVALIDATION_SCORE_CEILING) : weighted;
    totalScore = Math.round(clamp(capped, 0, 100));
  }

  const explanation = buildExplanation({
    direction,
    isConflict,
    invalidationConditions,
    freshnessStatus,
    indicatorsMissing,
  });

  return {
    totalScore,
    direction,
    componentScores,
    indicatorsUsed,
    indicatorsMissing,
    freshnessStatus,
    conflictingConditions,
    invalidationConditions,
    signalEngineVersion,
    scoreModelVersion: SCORE_MODEL_VERSION,
    candleInterval: null,
    sourceDataFrom,
    sourceDataTo,
    explanation,
  };
}
