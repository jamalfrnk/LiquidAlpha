import type { Side } from './types';

/**
 * Same formula as the server's execution/pnl.ts calculateUnrealizedPnl --
 * duplicated deliberately rather than imported, since there's no shared
 * package between client and server yet (see the note in the app-shell
 * PR). This is display-only math for an open position; the server's copy
 * is what actually gets persisted on close, so a client-side rounding
 * difference here is cosmetic, not a source of truth discrepancy.
 */
export function calculateUnrealizedPnl(side: Side, entryPrice: number, currentPrice: number, quantity: number): number {
  const priceDiff = side === 'LONG' ? currentPrice - entryPrice : entryPrice - currentPrice;
  return priceDiff * quantity;
}
