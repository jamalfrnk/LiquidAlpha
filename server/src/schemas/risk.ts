import { z } from 'zod';

export const UpdateRiskLimitsSchema = z.object({
  maxPositionSize: z.coerce.number().positive().optional(),
  maxLeverage: z.coerce.number().positive().max(125).optional(),
  maxOpenPositions: z.coerce.number().int().positive().max(50).optional(),
  maxDailyLossPercent: z.coerce.number().positive().max(100).optional(),
  killSwitchEnabled: z.coerce.boolean().optional(),
});
export type UpdateRiskLimitsRequest = z.infer<typeof UpdateRiskLimitsSchema>;
