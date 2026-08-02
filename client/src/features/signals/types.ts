export type SignalStatus = 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'TRIGGERED' | 'EXPIRED' | 'CANCELLED' | 'INVALIDATED';

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

export type SignalDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface SignalComponentScores {
  trendAgreement: number;
  momentumAgreement: number;
  trendStrengthConfirmation: number;
  volatilitySuitability: number;
  dataFreshness: number;
  indicatorAvailability: number;
}

/**
 * Mirrors server/src/schemas/signalScore.ts exactly. "Signal strength" --
 * never probability/confidence/expected-return language, client included
 * (SIGNAL-SCORE-001, same rationale as `ruleAlignmentScore` below, GH F-5).
 */
export interface SignalScore {
  totalScore: number;
  direction: SignalDirection;
  componentScores: SignalComponentScores;
  indicatorsUsed: string[];
  indicatorsMissing: string[];
  freshnessStatus: 'fresh' | 'stale';
  conflictingConditions: string[];
  invalidationConditions: string[];
  signalEngineVersion: string;
  scoreModelVersion: string;
  candleInterval: null;
  sourceDataFrom: string;
  sourceDataTo: string;
  explanation: string;
}

/**
 * Matches the server's signals table exactly (server/src/db/schema.ts).
 * `ruleAlignmentScore` -- deliberately not called "confidence" anywhere,
 * client included -- see GITHUB_REPOSITORY_AUDIT.md finding F-5.
 */
export interface Signal {
  id: string;
  asset: string;
  signalType: 'LONG' | 'SHORT';
  status: SignalStatus;
  ruleAlignmentScore: string;
  ruleVersion: string;
  explanation: string;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  riskRewardRatio: string;
  indicatorSnapshot: IndicatorSnapshot;
  /** Null for any signal generated before SIGNAL-SCORE-001 shipped -- see server/src/db/schema.ts's own comment on why this column is nullable rather than backfilled. */
  signalScore: SignalScore | null;
  dataFrom: string;
  dataTo: string;
  barCount: number;
  dataQuality: string;
  createdAt: string;
}
