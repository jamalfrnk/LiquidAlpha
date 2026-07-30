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

/** Terminal states an order can never leave. */
const ORDER_TERMINAL: ReadonlySet<OrderStatus> = new Set(['FILLED', 'CANCELLED', 'REJECTED', 'FAILED']);

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_CONFIRMATION: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['ACKNOWLEDGED', 'FILLED', 'REJECTED', 'FAILED'],
  ACKNOWLEDGED: ['PARTIALLY_FILLED', 'FILLED', 'CANCEL_PENDING', 'CANCELLED'],
  PARTIALLY_FILLED: ['PARTIALLY_FILLED', 'FILLED', 'CANCEL_PENDING', 'CANCELLED'],
  CANCEL_PENDING: ['CANCELLED', 'FILLED'], // an in-flight fill can still beat a cancel request
  FILLED: [],
  CANCELLED: [],
  REJECTED: [],
  FAILED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function isOrderTerminal(status: OrderStatus): boolean {
  return ORDER_TERMINAL.has(status);
}

export type PositionStatus = 'OPEN' | 'CLOSED' | 'LIQUIDATED';

const POSITION_TRANSITIONS: Record<PositionStatus, readonly PositionStatus[]> = {
  OPEN: ['CLOSED', 'LIQUIDATED'],
  CLOSED: [],
  LIQUIDATED: [],
};

export function canTransitionPosition(from: PositionStatus, to: PositionStatus): boolean {
  return POSITION_TRANSITIONS[from].includes(to);
}
