export interface MarketDataHealth {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  consecutiveFailures: number;
  healthy: boolean;
}

export interface MarketSnapshot {
  id: string;
  symbol: string;
  price: string;
  volume: string;
  change24h: string;
  updatedAt: string;
  stale: boolean;
}
