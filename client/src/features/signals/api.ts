import { apiRequest } from '../../lib/api';
import type { Signal } from './types';

export function fetchSignals(params: { limit: number; offset: number }): Promise<Signal[]> {
  return apiRequest('GET', `/api/signals?limit=${params.limit}&offset=${params.offset}`);
}
