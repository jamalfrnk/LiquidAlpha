import { apiRequest } from '../../lib/api';
import type { PerformanceResponse } from './types';

export function fetchPerformance(): Promise<PerformanceResponse> {
  return apiRequest('GET', '/api/analytics/performance');
}
