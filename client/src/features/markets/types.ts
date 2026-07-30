export interface MarketDataHealth {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  consecutiveFailures: number;
  healthy: boolean;
}
