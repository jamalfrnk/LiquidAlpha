import { z } from 'zod';

/**
 * Shared pagination query params. `limit` is capped at 100 regardless of
 * what's requested -- an endpoint should never be able to be asked for an
 * unbounded result set, which is exactly the gap GET /api/signals had
 * (no limit at all, so it returned every signal ever generated).
 */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
