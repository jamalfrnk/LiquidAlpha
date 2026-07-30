import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { riskLimits } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';
import { validate } from '../middleware/validate';
import { wrapAsync } from '../bootstrap';
import { UpdateRiskLimitsSchema, type UpdateRiskLimitsRequest } from '../schemas/risk';
import { getOrCreateRiskLimits } from './userLimits';

export const riskRouter = Router();

riskRouter.get(
  '/limits',
  requireAuth,
  wrapAsync(async (req, res) => {
    const limits = await getOrCreateRiskLimits(req.user!.id);
    res.json(limits);
  }),
);

riskRouter.put(
  '/limits',
  requireAuth,
  validate('body', UpdateRiskLimitsSchema),
  wrapAsync(async (req, res) => {
    // Ensures a row exists before updating -- a user's very first PUT
    // shouldn't fail just because they never issued a GET first.
    await getOrCreateRiskLimits(req.user!.id);

    const updates = req.body as UpdateRiskLimitsRequest;
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.maxPositionSize !== undefined) values.maxPositionSize = updates.maxPositionSize.toString();
    if (updates.maxLeverage !== undefined) values.maxLeverage = updates.maxLeverage.toString();
    if (updates.maxOpenPositions !== undefined) values.maxOpenPositions = updates.maxOpenPositions;
    if (updates.maxDailyLossPercent !== undefined) values.maxDailyLossPercent = updates.maxDailyLossPercent.toString();
    if (updates.killSwitchEnabled !== undefined) values.killSwitchEnabled = updates.killSwitchEnabled;

    const [updated] = await db
      .update(riskLimits)
      .set(values)
      .where(eq(riskLimits.userId, req.user!.id))
      .returning();
    res.json(updated);
  }),
);
