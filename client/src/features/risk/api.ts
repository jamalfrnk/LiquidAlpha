import { apiRequest } from '../../lib/api';
import type { RiskLimits, UpdateRiskLimitsRequest } from './types';

export function fetchRiskLimits(): Promise<RiskLimits> {
  return apiRequest('GET', '/api/risk/limits');
}

export function updateRiskLimits(updates: UpdateRiskLimitsRequest): Promise<RiskLimits> {
  return apiRequest('PUT', '/api/risk/limits', updates);
}
