import { apiRequest } from '../../lib/api';
import type { MarketDataHealth } from './types';

export function fetchMarketDataHealth(): Promise<MarketDataHealth> {
  return apiRequest('GET', '/api/market-data/health');
}
