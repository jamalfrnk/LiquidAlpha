export interface RiskLimits {
  id: string;
  userId: string;
  maxPositionSize: string;
  maxLeverage: string;
  maxOpenPositions: number;
  maxDailyLossPercent: string;
  killSwitchEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Mirrors the server's `UpdateRiskLimitsSchema` (server/src/schemas/risk.ts)
 * exactly -- every field optional, numeric bounds enforced server-side
 * (maxLeverage <= 125, maxOpenPositions <= 50, maxDailyLossPercent <= 100).
 * The client only re-states the bounds for UX (immediate feedback); the
 * server remains the sole authority and its rejection reason is always
 * shown verbatim on failure, never replaced with a client-invented message.
 */
export interface UpdateRiskLimitsRequest {
  maxPositionSize?: number;
  maxLeverage?: number;
  maxOpenPositions?: number;
  maxDailyLossPercent?: number;
  killSwitchEnabled?: boolean;
}
