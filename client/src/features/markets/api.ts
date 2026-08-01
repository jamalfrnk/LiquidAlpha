import { apiRequest } from '../../lib/api';
import type { Candle, CandleInterval, MarketDataHealth, MarketSnapshot } from './types';

export function fetchMarketDataHealth(): Promise<MarketDataHealth> {
  return apiRequest('GET', '/api/market-data/health');
}

export function fetchMarkets(): Promise<MarketSnapshot[]> {
  return apiRequest('GET', '/api/markets');
}

export function fetchCandles(symbol: string, interval: CandleInterval, limit = 200): Promise<Candle[]> {
  return apiRequest('GET', `/api/markets/${symbol}/candles?interval=${interval}&limit=${limit}`);
}
