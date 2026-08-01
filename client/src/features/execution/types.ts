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

export interface Fill {
  id: string;
  orderId: string;
  price: string;
  quantity: string;
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
