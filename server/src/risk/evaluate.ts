import {
  checkPositionSize,
  checkLeverage,
  checkMaxOpenPositions,
  checkPriceDeviation,
  checkStalePrice,
  checkTrustworthySource,
} from './limits';

export interface TradeIntent {
  notionalSize: number;
  leverage: number;
  currentOpenPositions: number;
  requestedPrice: number;
  currentMarketPrice: number;
  marketDataAgeMs: number;
  /** 'hyperliquid' | 'coingecko' -- see checkTrustworthySource (DATA-RECOVERY-001). */
  marketDataSource: string;
}

export interface RiskLimitConfig {
  maxPositionSize: number;
  maxLeverage: number;
  maxOpenPositions: number;
  maxPriceDeviationPercent: number;
  maxDataAgeMs: number;
}

export interface RiskEvaluation {
  passed: boolean;
  /** Every failure, not just the first -- a caller should be able to show the user everything wrong at once. */
  failures: string[];
}

/**
 * Runs every applicable risk check against a candidate trade and collects
 * every failure rather than stopping at the first one. This is the
 * "Risk Validation" stage of the pipeline (Signal -> Risk Validation ->
 * Signal Publication -> ... -> Execution) -- not wired to a real execution
 * path yet since none exists in this repo (arrives in migration step 12),
 * but the rules themselves are real and fully testable today.
 */
export function evaluateTrade(intent: TradeIntent, limits: RiskLimitConfig): RiskEvaluation {
  const results = [
    checkStalePrice(intent.marketDataAgeMs, limits.maxDataAgeMs),
    checkTrustworthySource(intent.marketDataSource),
    checkPriceDeviation(intent.requestedPrice, intent.currentMarketPrice, limits.maxPriceDeviationPercent),
    checkPositionSize(intent.notionalSize, limits.maxPositionSize),
    checkLeverage(intent.leverage, limits.maxLeverage),
    checkMaxOpenPositions(intent.currentOpenPositions, limits.maxOpenPositions),
  ];

  const failures = results.filter((r) => !r.passed).map((r) => r.reason!);
  return { passed: failures.length === 0, failures };
}
