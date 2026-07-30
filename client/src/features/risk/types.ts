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
