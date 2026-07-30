import { apiRequest } from '../../lib/api';
import type { MarketDataHealth, MarketSnapshot } from './types';

export function fetchMarketDataHealth(): Promise<MarketDataHealth> {
  return apiRequest('GET', '/api/market-data/health');
}

export function fetchMarkets(): Promise<MarketSnapshot[]> {
  return apiRequest('GET', '/api/markets');
}
