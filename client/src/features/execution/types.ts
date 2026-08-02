export type Side = 'LONG' | 'SHORT';
export type OrderType = 'MARKET' | 'LIMIT';
export type Environment = 'paper' | 'testnet' | 'production';

export type OrderStatus =
  | 'PENDING_CONFIRMATION'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCEL_PENDING'
  | 'CANCELLED'
  | 'REJECTED'
  | 'FAILED';

export type PositionStatus = 'OPEN' | 'CLOSED' | 'LIQUIDATED';

export interface Order {
  id: string;
  userId: string;
  asset: string;
  side: Side;
  orderType: OrderType;
  quantity: string;
  limitPrice: string | null;
  leverage: string;
  status: OrderStatus;
  rejectionReason: string | null;
  environment: Environment;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export type PriceSource = 'hyperliquid' | 'coingecko';

/**
 * Matches the server's fills table exactly (server/src/db/schema.ts).
 * Provenance fields (PAPER-REALISM-001) so a fill's pricing basis is
 * always traceable: which source priced it, when, by which fill-model
 * version, and how much slippage/fee were simulated on top of the
 * reference price. `simulated` is always `true` -- this platform has no
 * live-execution path.
 */
export interface Fill {
  id: string;
  orderId: string;
  price: string;
  quantity: string;
  /** Null only for fills recorded before PAPER-REALISM-001 shipped -- every fill from here forward always populates these. */
  priceSource: PriceSource | null;
  sourceTimestamp: string | null;
  fillModelVersion: string | null;
  referencePrice: string | null;
  slippageAmount: string | null;
  feeAmount: string | null;
  marketType: string;
  simulated: boolean;
  createdAt: string;
}

export interface Position {
  id: string;
  userId: string;
  asset: string;
  side: Side;
  quantity: string;
  entryPrice: string;
  stopLoss: string | null;
  takeProfit: string | null;
  status: PositionStatus;
  environment: Environment;
  realizedPnl: string | null;
  /** Quantity-weighted-averaged the same way entryPrice is, across every fill that added to this position. */
  leverage: string;
  /** A simulated estimate (flat maintenance-margin assumption) -- never an exact liquidation price. Null only if never computed (shouldn't happen for any position opened after PAPER-REALISM-001). */
  liquidationPriceEstimate: string | null;
  feesPaid: string;
  fundingPaid: string;
  lastFundingChargedAt: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface SubmitOrderInput {
  asset: string;
  side: Side;
  orderType: OrderType;
  quantity: number;
  limitPrice?: number;
  leverage: number;
  idempotencyKey: string;
}

/** Only cancellable in these statuses -- everything else is terminal or already in flight toward terminal. */
export const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  'PENDING_CONFIRMATION',
  'SUBMITTED',
  'ACKNOWLEDGED',
  'PARTIALLY_FILLED',
];
