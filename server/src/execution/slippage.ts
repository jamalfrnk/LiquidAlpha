export type Side = 'LONG' | 'SHORT';

/** Default simulated slippage for paper market orders, in basis points. */
export const DEFAULT_SLIPPAGE_BPS = 5;

/**
 * Applies simulated slippage against the trader -- a paper market BUY
 * (LONG) fills slightly higher than quote, a market SELL (SHORT) fills
 * slightly lower. Always unfavorable to the trader, matching how slippage
 * actually behaves, so paper fills don't look artificially better than a
 * real fill would.
 */
export function applySlippage(price: number, side: Side, slippageBps: number = DEFAULT_SLIPPAGE_BPS): number {
  const factor = slippageBps / 10_000;
  return side === 'LONG' ? price * (1 + factor) : price * (1 - factor);
}
