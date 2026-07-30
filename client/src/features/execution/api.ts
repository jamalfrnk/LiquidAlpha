import { apiRequest } from '../../lib/api';
import type { Order, Position, Fill, SubmitOrderInput } from './types';

export function fetchOrders(params: { limit: number; offset: number }): Promise<Order[]> {
  return apiRequest('GET', `/api/execution/orders?limit=${params.limit}&offset=${params.offset}`);
}

export function fetchPositions(params: { limit: number; offset: number }): Promise<Position[]> {
  return apiRequest('GET', `/api/execution/positions?limit=${params.limit}&offset=${params.offset}`);
}

export function submitOrder(input: SubmitOrderInput): Promise<{ order: Order; fills: Fill[] }> {
  return apiRequest('POST', '/api/execution/orders', input);
}

export function cancelOrder(orderId: string): Promise<Order> {
  return apiRequest('POST', `/api/execution/orders/${orderId}/cancel`);
}

export function closePosition(positionId: string): Promise<Position> {
  return apiRequest('POST', `/api/execution/positions/${positionId}/close`);
}
