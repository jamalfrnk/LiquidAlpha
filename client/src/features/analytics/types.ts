/**
 * Mirrors server/src/schemas/analytics.ts's PerformanceResponseSchema
 * exactly. Tiered by sample size (DATA-015, decided 2026-07-31): below 10
 * closed trades, no metrics at all; 10-29 shows simple counts only; 30+
 * shows the risk-adjusted ratio and max drawdown too.
 */
export type PerformanceTier = 'insufficient' | 'preliminary' | 'full';

export interface PreliminaryMetrics {
  winRatePercent: number;
  totalPnl: number;
  averagePnl: number;
}

export interface FullMetrics extends PreliminaryMetrics {
  riskAdjustedReturnRatio: number | null;
  maxDrawdown: number;
}

export type PerformanceResponse =
  | { tier: 'insufficient'; sampleSize: number; windowStart: null; windowEnd: null; mode: 'paper'; metrics: null }
  | {
      tier: 'preliminary';
      sampleSize: number;
      windowStart: string;
      windowEnd: string;
      mode: 'paper';
      metrics: PreliminaryMetrics;
    }
  | { tier: 'full'; sampleSize: number; windowStart: string; windowEnd: string; mode: 'paper'; metrics: FullMetrics };
