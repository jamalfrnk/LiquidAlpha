import { z } from 'zod';

/** Params for GET /api/funding/:symbol. */
export const FundingRateParamsSchema = z.object({
  symbol: z.string().trim().min(1).max(10).toUpperCase(),
});

export type FundingRateParams = z.infer<typeof FundingRateParamsSchema>;
