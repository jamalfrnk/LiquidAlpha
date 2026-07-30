import { z } from 'zod';

export const SubmitOrderRequestSchema = z
  .object({
    asset: z.string().trim().min(1).max(10).toUpperCase(),
    side: z.enum(['LONG', 'SHORT']),
    orderType: z.enum(['MARKET', 'LIMIT']),
    quantity: z.coerce.number().positive(),
    limitPrice: z.coerce.number().positive().optional(),
    leverage: z.coerce.number().positive(),
    // Client-generated, one per submission attempt -- retries of the same
    // attempt must reuse the same key so the server can recognize them as
    // the same request rather than a new one.
    idempotencyKey: z.string().trim().min(1).max(128),
  })
  .refine((data) => data.orderType !== 'LIMIT' || data.limitPrice !== undefined, {
    message: 'limitPrice is required for LIMIT orders',
    path: ['limitPrice'],
  });
export type SubmitOrderRequest = z.infer<typeof SubmitOrderRequestSchema>;
