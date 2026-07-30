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
  dataFrom: string;
  dataTo: string;
  barCount: number;
  dataQuality: string;
  createdAt: string;
}
