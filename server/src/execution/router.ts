import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index';
import { orders, positions } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';
import { validate } from '../middleware/validate';
import { wrapAsync } from '../bootstrap';
import { SubmitOrderRequestSchema, type SubmitOrderRequest } from '../schemas/execution';
import { PaginationQuerySchema, type PaginationQuery } from '../schemas/pagination';
import { submitOrder, cancelOrder, closePosition } from './paperEngine';
import { NotFoundError, ForbiddenError, ExecutionModeNotSupportedError } from './errors';

export const executionRouter = Router();

/**
 * Ownership is always derived from req.user (the authenticated session),
 * never from a client-supplied id -- the exact gap that made the Replit
 * reference app's position endpoints an open IDOR (audit finding C-2:
 * read/write/close any user's position with a guessable UUID, no auth at
 * all).
 */

executionRouter.post(
  '/orders',
  requireAuth,
  validate('body', SubmitOrderRequestSchema),
  wrapAsync(async (req, res) => {
    const request = req.body as SubmitOrderRequest;
    try {
      const result = await submitOrder(req.user!.id, request);
      res.json(result);
    } catch (err) {
      if (err instanceof ExecutionModeNotSupportedError) {
        res.status(503).json({ error: err.message });
        return;
      }
      throw err;
    }
  }),
);

executionRouter.get(
  '/orders',
  requireAuth,
  validate('query', PaginationQuerySchema),
  wrapAsync(async (req, res) => {
    const { limit, offset } = req.query as unknown as PaginationQuery;
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, req.user!.id))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(rows);
  }),
);

executionRouter.post(
  '/orders/:id/cancel',
  requireAuth,
  wrapAsync(async (req, res) => {
    try {
      const updated = await cancelOrder(req.user!.id, req.params.id);
      res.json(updated);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
      } else if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message });
      } else if (err instanceof ExecutionModeNotSupportedError) {
        res.status(503).json({ error: err.message });
      } else {
        throw err;
      }
    }
  }),
);

executionRouter.get(
  '/positions',
  requireAuth,
  validate('query', PaginationQuerySchema),
  wrapAsync(async (req, res) => {
    const { limit, offset } = req.query as unknown as PaginationQuery;
    const rows = await db
      .select()
      .from(positions)
      .where(and(eq(positions.userId, req.user!.id), eq(positions.status, 'OPEN')))
      .orderBy(desc(positions.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(rows);
  }),
);

executionRouter.post(
  '/positions/:id/close',
  requireAuth,
  wrapAsync(async (req, res) => {
    try {
      const updated = await closePosition(req.user!.id, req.params.id);
      res.json(updated);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
      } else if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message });
      } else if (err instanceof ExecutionModeNotSupportedError) {
        res.status(503).json({ error: err.message });
      } else {
        throw err;
      }
    }
  }),
);
