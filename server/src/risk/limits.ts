/**
 * Pure risk-check functions -- each takes the specific values it needs and
 * returns a pass/fail result with a human-readable reason, no DB or I/O
 * involved. Kept this way so the rules themselves are fully unit-testable,
 * and so the same checks can eventually run identically whether they're
 * validating a signal, a paper order, or a live order.
 */

export interface RiskCheckResult {
  passed: boolean;
  reason?: string;
}

function ok(): RiskCheckResult {
  return { passed: true };
}

function fail(reason: string): RiskCheckResult {
  return { passed: false, reason };
}

/** Notional position size must not exceed the configured maximum. */
export function checkPositionSize(notionalSize: number, maxPositionSize: number): RiskCheckResult {
  if (notionalSize > maxPositionSize) {
    return fail(`Position size ${notionalSize} exceeds the configured maximum of ${maxPositionSize}`);
  }
  return ok();
}

/** Requested leverage must not exceed the configured maximum. */
export function checkLeverage(requestedLeverage: number, maxLeverage: number): RiskCheckResult {
  if (requestedLeverage > maxLeverage) {
    return fail(`Leverage ${requestedLeverage}x exceeds the configured maximum of ${maxLeverage}x`);
  }
  return ok();
}

/** A new position must not push the account past its configured open-position count. */
export function checkMaxOpenPositions(currentOpenCount: number, maxOpenPositions: number): RiskCheckResult {
  if (currentOpenCount >= maxOpenPositions) {
    return fail(`Already at the maximum of ${maxOpenPositions} open position(s)`);
  }
  return ok();
}

/**
 * The price a caller wants to trade at must not deviate too far from the
 * current market price -- guards against acting on a bad quote, a stale
 * cached price, or a manipulated/erroneous input.
 */
export function checkPriceDeviation(
  requestedPrice: number,
  currentMarketPrice: number,
  maxDeviationPercent: number,
): RiskCheckResult {
  if (currentMarketPrice <= 0) return fail('Current market price is not available');
  const deviationPercent = (Math.abs(requestedPrice - currentMarketPrice) / currentMarketPrice) * 100;
  if (deviationPercent > maxDeviationPercent) {
    return fail(
      `Requested price deviates ${deviationPercent.toFixed(2)}% from the current market price, exceeding the ${maxDeviationPercent}% limit`,
    );
  }
  return ok();
}

/** The market data backing a decision must be recent enough to act on. */
export function checkStalePrice(dataAgeMs: number, maxAgeMs: number): RiskCheckResult {
  if (dataAgeMs > maxAgeMs) {
    return fail(`Market data is ${dataAgeMs}ms old, exceeding the ${maxAgeMs}ms freshness limit`);
  }
  return ok();
}

/**
 * A new order must be priced against a genuinely Hyperliquid-sourced
 * reference, not a CoinGecko fallback row (DATA-RECOVERY-001) --
 * `checkStalePrice` alone doesn't catch this case: when Hyperliquid is down
 * and the CoinGecko fallback engages, `runIngestionCycle` still refreshes
 * `markets.updatedAt` on every successful CoinGecko poll, so a fallback
 * price can look perfectly "fresh" by age while still being exactly the
 * kind of aggregate-market price the mission says must never silently
 * drive a new Hyperliquid paper fill. Closing an existing position is
 * deliberately not gated by this -- the mission only requires blocking
 * *new* orders, not preventing a user from exiting on the only price
 * currently available.
 */
export function checkTrustworthySource(source: string): RiskCheckResult {
  if (source !== 'hyperliquid') {
    return fail(
      `Reference price is currently sourced from ${source} (Hyperliquid feed unavailable), not a trustworthy execution reference -- new orders are blocked until it recovers`,
    );
  }
  return ok();
}
