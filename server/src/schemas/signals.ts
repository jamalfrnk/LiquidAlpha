import { z } from 'zod';

/**
 * Body for POST /api/signals/generate. `symbol` is optional -- the current
 * generator ignores it and always processes every supported asset -- but the
 * shape is validated now so the contract is correct once per-symbol
 * generation is implemented (see the TODO in technical-analysis.ts).
 */
export const GenerateSignalsRequestSchema = z.object({
  symbol: z.string().trim().min(1).max(10).toUpperCase().optional(),
});

export type GenerateSignalsRequest = z.infer<typeof GenerateSignalsRequestSchema>;
