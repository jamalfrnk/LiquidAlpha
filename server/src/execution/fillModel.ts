import type { Side } from './slippage';

/**
 * The paper fill-pricing model (PAPER-REALISM-001): fee and liquidation-
 * estimate math, versioned so every recorded fill can be traced back to
 * exactly which model produced it (mirrors `technical-analysis.ts`'s
 * `RULE_VERSION` / `signals/signalScore.ts`'s `SCORE_MODEL_VERSION`
 * precedent, not a new versioning convention).
 *
 * Everything here is **simulated**, applied to paper positions only --
 * this module has no path to a real order, exchange, or wallet signature.
 */
export const FILL_MODEL_VERSION = 'v1';

/** Round-trip-equivalent taker fee, in basis points of notional, charged once at entry and once at exit. A documented assumption, not Hyperliquid's real (tiered, volume-dependent) fee schedule. */
export const DEFAULT_FEE_BPS = 5;

/**
 * A single flat maintenance-margin ratio applied uniformly across assets --
 * a deliberate simplification of Hyperliquid's real per-asset, tiered
 * maintenance margin schedule. Named and returned as an *estimate* for
 * exactly this reason: it also ignores funding accrued so far and any
 * cross-margin balance, both of which a real liquidation price depends on.
 */
export const MAINTENANCE_MARGIN_RATIO = 0.005;

/** Hyperliquid's real funding interval -- used to pro-rate accrued funding by elapsed wall-clock time rather than charging a full period's rate regardless of how long a position was actually open for. */
export const FUNDING_INTERVAL_MS = 60 * 60_000;

export function computeFee(notional: number, feeBps: number = DEFAULT_FEE_BPS): number {
  return notional * (feeBps / 10_000);
}

/**
 * Estimated liquidation price for an isolated-margin position:
 * LONG:  entryPrice * (1 - 1/leverage + maintenanceMarginRatio)
 * SHORT: entryPrice * (1 + 1/leverage - maintenanceMarginRatio)
 *
 * At leverage 1 this still returns a (small) nonzero price rather than 0 --
 * a maintenance-margin buffer applies even to unleveraged positions in this
 * model, which is the mathematically honest behavior of the formula, not a
 * special case to work around.
 */
export function estimateLiquidationPrice(entryPrice: number, leverage: number, side: Side): number {
  const factor = 1 / leverage;
  return side === 'LONG'
    ? entryPrice * (1 - factor + MAINTENANCE_MARGIN_RATIO)
    : entryPrice * (1 + factor - MAINTENANCE_MARGIN_RATIO);
}

/**
 * Funding cost for one accrual event, pro-rated by elapsed time relative to
 * Hyperliquid's real hourly funding interval. Standard perp convention: a
 * positive funding rate is paid by longs to shorts.
 */
export function computeFundingCost(notional: number, fundingRate: number, side: Side, elapsedMs: number): number {
  const periods = elapsedMs / FUNDING_INTERVAL_MS;
  const cost = notional * fundingRate * periods;
  return side === 'LONG' ? cost : -cost;
}
