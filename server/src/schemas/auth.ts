import { z } from 'zod';
import { CHAINS } from '../auth/chain';

export const NonceRequestSchema = z.object({
  address: z.string().trim().min(1).max(64),
  chain: z.enum(CHAINS),
});
export type NonceRequest = z.infer<typeof NonceRequestSchema>;

export const VerifyRequestSchema = z.object({
  address: z.string().trim().min(1).max(64),
  chain: z.enum(CHAINS),
  signature: z.string().min(1),
});
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;
