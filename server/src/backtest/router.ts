import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index';
import { backtestRuns, backtestTrades } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';
import { validate } from '../middleware/validate';
import { wrapAsync } from '../bootstrap';
import { CreateBacktestRequestSchema, type CreateBacktestRequest } from '../schemas/backtest';
import { PaginationQuerySchema, type PaginationQuery } from '../schemas/pagination';
import { NotFoundError, ForbiddenError } from '../execution/errors';
import { createAndRunBacktest } from './runner';

export const backtestRouter = Router();

/** Ownership is always derived from req.user, never a client-supplied id -- same IDOR-prevention discipline execution/router.ts already follows (audit finding C-2). */

backtestRouter.post(
  '/',
  requireAuth,
  validate('body', CreateBacktestRequestSchema),
  wrapAsync(async (req, res) => {
    const request = req.body as CreateBacktestRequest;
    const run = await createAndRunBacktest(req.user!.id, request);
    if (run.status === 'FAILED') {
      res.status(422).json(run);
      return;
    }
    res.json(run);
  }),
);

backtestRouter.get(
  '/',
  requireAuth,
  validate('query', PaginationQuerySchema),
  wrapAsync(async (req, res) => {
    const { limit, offset } = req.query as unknown as PaginationQuery;
    const rows = await db
      .select()
      .from(backtestRuns)
      .where(eq(backtestRuns.userId, req.user!.id))
      .orderBy(desc(backtestRuns.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(rows);
  }),
);

backtestRouter.get(
  '/:id',
  requireAuth,
  wrapAsync(async (req, res) => {
    try {
      const [run] = await db.select().from(backtestRuns).where(eq(backtestRuns.id, req.params.id)).limit(1);
      if (!run) throw new NotFoundError('Backtest run not found');
      if (run.userId !== req.user!.id) throw new ForbiddenError('You do not own this backtest run');

      const trades = await db
        .select()
        .from(backtestTrades)
        .where(and(eq(backtestTrades.runId, run.id)))
        .orderBy(backtestTrades.entryTime);
      res.json({ ...run, trades });
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
      } else if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message });
      } else {
        throw err;
      }
    }
  }),
);
