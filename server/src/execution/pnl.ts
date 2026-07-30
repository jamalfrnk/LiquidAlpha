import type { Side } from './slippage';

/**
 * Unrealized PnL for an open position. LONG profits when price rises
 * above entry; SHORT profits when price falls below it.
 */
export function calculateUnrealizedPnl(side: Side, entryPrice: number, currentPrice: number, quantity: number): number {
  const priceDiff = side === 'LONG' ? currentPrice - entryPrice : entryPrice - currentPrice;
  return priceDiff * quantity;
}

/**
 * New quantity-weighted average entry price after adding to an existing
 * same-direction position.
 */
export function weightedAverageEntryPrice(
  existingQuantity: number,
  existingEntryPrice: number,
  addedQuantity: number,
  addedPrice: number,
): number {
  const totalQuantity = existingQuantity + addedQuantity;
  return (existingQuantity * existingEntryPrice + addedQuantity * addedPrice) / totalQuantity;
}
