import { and, eq } from 'drizzle-orm';
import { db } from '../db/index';
import { orders, fills, positions } from '../db/schema';
import { env } from '../config/env';
import { STALE_AFTER_MS } from '../market-data/ingestion';
import { isGloballyHalted, isUserHalted } from '../risk/killSwitch';
import { evaluateTrade } from '../risk/evaluate';
import { checkTrustworthySource } from '../risk/limits';
import { getOrCreateRiskLimits } from '../risk/userLimits';
import { applySlippage } from './slippage';
import { isMarketable } from './marketability';
import { calculateUnrealizedPnl, weightedAverageEntryPrice } from './pnl';
import { isOrderTerminal, type OrderStatus } from './stateMachine';
import { getMarketSnapshot, countOpenPositions, getOpenPosition } from './queries';
import { NotFoundError, ForbiddenError, ExecutionModeNotSupportedError, isUniqueViolation } from './errors';
import { incrementCounter } from '../observability/metrics';
import type { SubmitOrderRequest } from '../schemas/execution';

/** Price deviation and staleness bounds applied to every order, on top of the caller's own risk_limits. */
const MAX_PRICE_DEVIATION_PERCENT = 1;

export interface OrderResult {
  order: typeof orders.$inferSelect;
  fills: (typeof fills.$inferSelect)[];
}

function assertPaperMode(): void {
  if (env.EXECUTION_MODE !== 'paper') {
    throw new ExecutionModeNotSupportedError(env.EXECUTION_MODE);
  }
}

async function setOrderStatus(orderId: string, status: OrderStatus, rejectionReason?: string) {
  const [updated] = await db
    .update(orders)
    .set({ status, rejectionReason, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();
  return updated;
}

async function rejectOrder(orderId: string, reason: string): Promise<OrderResult> {
  incrementCounter('order_rejected');
  const order = await setOrderStatus(orderId, 'REJECTED', reason);
  return { order, fills: [] };
}

/**
 * Records a fill and updates (or creates) the resulting position.
 * Position netting is intentionally simple here: same-direction fills
 * increase the position at a quantity-weighted average entry price;
 * opposite-direction fills against an existing position are rejected
 * before this is ever reached (see processNewOrder) -- full flip/netting
 * logic is deferred, not silently approximated.
 */
async function fillOrder(order: typeof orders.$inferSelect, fillPrice: number) {
  await db.insert(fills).values({ orderId: order.id, price: fillPrice.toString(), quantity: order.quantity });
  const filledOrder = await setOrderStatus(order.id, 'FILLED');

  const existing = await getOpenPosition(order.userId, order.asset);
  const fillQuantity = parseFloat(order.quantity);
  if (existing) {
    const newQuantity = parseFloat(existing.quantity) + fillQuantity;
    const newEntryPrice = weightedAverageEntryPrice(
      parseFloat(existing.quantity),
      parseFloat(existing.entryPrice),
      fillQuantity,
      fillPrice,
    );
    await db
      .update(positions)
      .set({ quantity: newQuantity.toString(), entryPrice: newEntryPrice.toString(), updatedAt: new Date() })
      .where(eq(positions.id, existing.id));
  } else {
    await db.insert(positions).values({
      userId: order.userId,
      asset: order.asset,
      side: order.side,
      quantity: order.quantity,
      entryPrice: fillPrice.toString(),
      environment: 'paper',
    });
  }

  const orderFills = await db.select().from(fills).where(eq(fills.orderId, order.id));
  return { order: filledOrder, fills: orderFills };
}

async function processNewOrder(order: typeof orders.$inferSelect): Promise<OrderResult> {
  if (isGloballyHalted()) {
    return rejectOrder(order.id, 'Trading is currently halted platform-wide');
  }
  if (await isUserHalted(order.userId)) {
    return rejectOrder(order.id, 'Your account has trading halted (personal kill switch is enabled)');
  }

  const market = await getMarketSnapshot(order.asset);
  if (!market) {
    return rejectOrder(order.id, `No market data available for ${order.asset}`);
  }
  const marketPrice = parseFloat(market.price);
  const dataAgeMs = Date.now() - market.updatedAt.getTime();

  const requestedPrice = order.orderType === 'LIMIT' ? parseFloat(order.limitPrice!) : marketPrice;
  const notionalSize = parseFloat(order.quantity) * requestedPrice;
  const limits = await getOrCreateRiskLimits(order.userId);
  const openCount = await countOpenPositions(order.userId);

  const riskResult = evaluateTrade(
    {
      notionalSize,
      leverage: parseFloat(order.leverage),
      currentOpenPositions: openCount,
      requestedPrice,
      currentMarketPrice: marketPrice,
      marketDataAgeMs: dataAgeMs,
      marketDataSource: market.source,
    },
    {
      maxPositionSize: parseFloat(limits.maxPositionSize),
      maxLeverage: parseFloat(limits.maxLeverage),
      maxOpenPositions: limits.maxOpenPositions,
      maxPriceDeviationPercent: MAX_PRICE_DEVIATION_PERCENT,
      maxDataAgeMs: STALE_AFTER_MS,
    },
  );
  if (!riskResult.passed) {
    return rejectOrder(order.id, riskResult.failures.join('; '));
  }

  const existingPosition = await getOpenPosition(order.userId, order.asset);
  if (existingPosition && existingPosition.side !== order.side) {
    return rejectOrder(
      order.id,
      `An open ${existingPosition.side} position already exists for ${order.asset} -- close it before opening the opposite direction`,
    );
  }

  const marketable = isMarketable(
    order.orderType,
    order.side,
    order.orderType === 'LIMIT' ? parseFloat(order.limitPrice!) : null,
    marketPrice,
  );
  if (!marketable) {
    const acknowledged = await setOrderStatus(order.id, 'ACKNOWLEDGED');
    return { order: acknowledged, fills: [] };
  }

  const fillPrice = order.orderType === 'MARKET' ? applySlippage(marketPrice, order.side) : parseFloat(order.limitPrice!);
  return fillOrder(order, fillPrice);
}

/**
 * Submits a new order. Idempotency is enforced by the database, not an
 * application-level check-then-insert (which a race between two
 * near-simultaneous identical requests could slip past): the insert is
 * attempted directly, and a unique-constraint violation on
 * (user_id, idempotency_key) means this exact request was already
 * submitted, so the existing order is returned instead of erroring or
 * creating a duplicate.
 */
export async function submitOrder(userId: string, request: SubmitOrderRequest): Promise<OrderResult> {
  assertPaperMode();

  try {
    const [order] = await db
      .insert(orders)
      .values({
        userId,
        asset: request.asset,
        side: request.side,
        orderType: request.orderType,
        quantity: request.quantity.toString(),
        limitPrice: request.limitPrice?.toString(),
        leverage: request.leverage.toString(),
        environment: 'paper',
        idempotencyKey: request.idempotencyKey,
      })
      .returning();
    return await processNewOrder(order);
  } catch (err) {
    if (isUniqueViolation(err)) {
      const [existing] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, request.idempotencyKey)))
        .limit(1);
      if (existing) {
        const existingFills = await db.select().from(fills).where(eq(fills.orderId, existing.id));
        return { order: existing, fills: existingFills };
      }
    }
    throw err;
  }
}

/** Cancels an order the caller owns, if it hasn't already reached a terminal state. */
export async function cancelOrder(userId: string, orderId: string) {
  assertPaperMode();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new NotFoundError('Order not found');
  if (order.userId !== userId) throw new ForbiddenError('You do not own this order');
  if (isOrderTerminal(order.status)) {
    throw new Error(`Cannot cancel an order in terminal state ${order.status}`);
  }
  return setOrderStatus(orderId, 'CANCELLED');
}

/** Closes an open position the caller owns at the current market price (with exit slippage applied). */
export async function closePosition(userId: string, positionId: string) {
  assertPaperMode();
  const [position] = await db.select().from(positions).where(eq(positions.id, positionId)).limit(1);
  if (!position) throw new NotFoundError('Position not found');
  if (position.userId !== userId) throw new ForbiddenError('You do not own this position');
  if (position.status !== 'OPEN') throw new Error(`Cannot close a position in status ${position.status}`);

  const market = await getMarketSnapshot(position.asset);
  if (!market) throw new Error(`No market data available for ${position.asset}`);

  // Closing means trading in the opposite direction of the position, so
  // the exit fill takes slippage in that opposite direction.
  const exitSide = position.side === 'LONG' ? 'SHORT' : 'LONG';
  const exitPrice = applySlippage(parseFloat(market.price), exitSide);
  const realizedPnl = calculateUnrealizedPnl(position.side, parseFloat(position.entryPrice), exitPrice, parseFloat(position.quantity));

  const [updated] = await db
    .update(positions)
    .set({ status: 'CLOSED', realizedPnl: realizedPnl.toString(), closedAt: new Date(), updatedAt: new Date() })
    .where(eq(positions.id, positionId))
    .returning();
  return updated;
}

/**
 * Periodic sweep for resting limit orders: checks every ACKNOWLEDGED
 * limit order against the current market price and fills any that have
 * become marketable. Intended to run on the same cadence as market-data
 * ingestion (see server.ts).
 */
export async function sweepLimitOrders(): Promise<void> {
  if (env.EXECUTION_MODE !== 'paper' || isGloballyHalted()) return;

  const resting = await db.select().from(orders).where(and(eq(orders.orderType, 'LIMIT'), eq(orders.status, 'ACKNOWLEDGED')));
  for (const order of resting) {
    const market = await getMarketSnapshot(order.asset);
    if (!market) continue;
    if (await isUserHalted(order.userId)) continue;

    const marketable = isMarketable('LIMIT', order.side, parseFloat(order.limitPrice!), parseFloat(market.price));
    if (!marketable) continue;
    // A resting limit order becoming marketable is still a *new* fill --
    // the same fallback-source gate the initial order-placement path
    // applies (see checkTrustworthySource) has to hold here too, or a
    // CoinGecko-fallback price could silently trigger fills this sweep
    // runs unattended, with no user in the loop to notice. Left resting
    // (not rejected/cancelled) since the order itself was accepted while
    // Hyperliquid was still up -- it should fill once a trustworthy price
    // is available again, not be punished for a feed outage after the fact.
    if (!checkTrustworthySource(market.source).passed) continue;

    const existingPosition = await getOpenPosition(order.userId, order.asset);
    if (existingPosition && existingPosition.side !== order.side) continue; // still blocked -- leave resting

    await fillOrder(order, parseFloat(order.limitPrice!));
  }
}
