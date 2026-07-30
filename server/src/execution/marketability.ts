import type { Side } from './slippage';

/**
 * Whether a limit order would fill immediately against the current market
 * price. A LONG (buy) limit is marketable once the limit price is at or
 * above the current price (willing to pay at least what it costs); a
 * SHORT (sell) limit is marketable once the limit price is at or below it
 * (willing to accept at most what it's worth). Market orders are always
 * marketable by definition.
 */
export function isMarketable(
  orderType: 'MARKET' | 'LIMIT',
  side: Side,
  limitPrice: number | null,
  currentPrice: number,
): boolean {
  if (orderType === 'MARKET') return true;
  if (limitPrice === null) return false;
  return side === 'LONG' ? limitPrice >= currentPrice : limitPrice <= currentPrice;
}
