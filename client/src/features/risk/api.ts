import { apiRequest } from '../../lib/api';
import type { RiskLimits } from './types';

export function fetchRiskLimits(): Promise<RiskLimits> {
  return apiRequest('GET', '/api/risk/limits');
}
