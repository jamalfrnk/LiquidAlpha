import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { wrapAsync } from '../bootstrap';
import { log } from '../observability/logger';
import { computePerformance } from './metrics';
import { getClosedPaperTrades } from './queries';

export const analyticsRouter = Router();

/**
 * Performance metrics for the authenticated user's own closed paper trades
 * only -- ownership derives from `req.user.id`, never a client-supplied ID,
 * same boundary every other user-owned-resource route in this codebase
 * enforces. Tiered by sample size (DATA-015): see
 * `server/src/schemas/analytics.ts` for the exact thresholds and what each
 * tier includes/withholds.
 */
analyticsRouter.get(
  '/performance',
  requireAuth,
  wrapAsync(async (req, res) => {
    const trades = await getClosedPaperTrades(req.user!.id);
    const result = computePerformance(trades);
    // Per issue #19's observability requirement: distinguish "this user
    // hasn't traded enough yet" from a generic request, so it's visible
    // (without any PII beyond a sample count) how often users land here --
    // informs whether the 10/30 thresholds need revisiting later.
    if (result.tier === 'insufficient') {
      log('info', 'analytics.insufficient_data', { requestId: req.requestId, sampleSize: result.sampleSize });
    }
    res.json(result);
  }),
);
