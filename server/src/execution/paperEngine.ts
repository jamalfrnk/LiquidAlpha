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
import { FILL_MODEL_VERSION, computeFee, computeFundingCost, estimateLiquidationPrice } from './fillModel';
import { isOrderTerminal, type OrderStatus } from './stateMachine';
import { getMarketSnapshot, countOpenPositions, getOpenPosition } from './queries';
import { NotFoundError, ForbiddenError, ExecutionModeNotSupportedError, isUniqueViolation } from './errors';
import { incrementCounter } from '../observability/metrics';
import { fetchFundingHistory } from '../hyperliquid-real';
import type { SubmitOrderRequest } from '../schemas/execution';

type MarketSnapshot = NonNullable<Awaited<ReturnType<typeof getMarketSnapshot>>>;

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
 * Records a fill (with full PAPER-REALISM-001 provenance -- price source,
 * source timestamp, fill-model version, reference price, slippage, fee)
 * and updates (or creates) the resulting position. Position netting is
 * intentionally simple here: same-direction fills increase the position
 * at a quantity-weighted average entry price (leverage is
 * quantity-weighted-averaged the same way, feeding a recomputed
 * liquidation-price estimate); opposite-direction fills against an
 * existing position are rejected before this is ever reached (see
 * processNewOrder) -- full flip/netting logic is deferred, not silently
 * approximated.
 */
async function fillOrder(order: typeof orders.$inferSelect, fillPrice: number, market: MarketSnapshot) {
  const referencePrice = parseFloat(market.price);
  const slippageAmount = Math.abs(fillPrice - referencePrice);
  const fillQuantity = parseFloat(order.quantity);
  const feeAmount = computeFee(fillPrice * fillQuantity);

  await db.insert(fills).values({
    orderId: order.id,
    price: fillPrice.toString(),
    quantity: order.quantity,
    priceSource: market.source,
    sourceTimestamp: market.updatedAt,
    fillModelVersion: FILL_MODEL_VERSION,
    referencePrice: referencePrice.toString(),
    slippageAmount: slippageAmount.toString(),
    feeAmount: feeAmount.toString(),
  });
  const filledOrder = await setOrderStatus(order.id, 'FILLED');

  const orderLeverage = parseFloat(order.leverage);
  const existing = await getOpenPosition(order.userId, order.asset);
  if (existing) {
    const existingQuantity = parseFloat(existing.quantity);
    const newQuantity = existingQuantity + fillQuantity;
    const newEntryPrice = weightedAverageEntryPrice(existingQuantity, parseFloat(existing.entryPrice), fillQuantity, fillPrice);
    const newLeverage = weightedAverageEntryPrice(existingQuantity, parseFloat(existing.leverage), fillQuantity, orderLeverage);
    const newFeesPaid = parseFloat(existing.feesPaid) + feeAmount;
    const liquidationPriceEstimate = estimateLiquidationPrice(newEntryPrice, newLeverage, order.side);
    await db
      .update(positions)
      .set({
        quantity: newQuantity.toString(),
        entryPrice: newEntryPrice.toString(),
        leverage: newLeverage.toString(),
        liquidationPriceEstimate: liquidationPriceEstimate.toString(),
        feesPaid: newFeesPaid.toString(),
        updatedAt: new Date(),
      })
      .where(eq(positions.id, existing.id));
  } else {
    const liquidationPriceEstimate = estimateLiquidationPrice(fillPrice, orderLeverage, order.side);
    await db.insert(positions).values({
      userId: order.userId,
      asset: order.asset,
      side: order.side,
      quantity: order.quantity,
      entryPrice: fillPrice.toString(),
      leverage: orderLeverage.toString(),
      liquidationPriceEstimate: liquidationPriceEstimate.toString(),
      feesPaid: feeAmount.toString(),
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
  return fillOrder(order, fillPrice, market);
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
  const quantity = parseFloat(position.quantity);
  const grossPnl = calculateUnrealizedPnl(position.side, parseFloat(position.entryPrice), exitPrice, quantity);

  // Round-trip realism (PAPER-REALISM-001): the exit itself incurs a fee
  // just like entry did, and any funding accrued over the position's life
  // (see accruePaperFunding) is settled here too -- realizedPnl is the
  // trader's actual net outcome, not just the raw price move.
  const exitFee = computeFee(exitPrice * quantity);
  const totalFeesPaid = parseFloat(position.feesPaid) + exitFee;
  const realizedPnl = grossPnl - totalFeesPaid - parseFloat(position.fundingPaid);

  const [updated] = await db
    .update(positions)
    .set({
      status: 'CLOSED',
      realizedPnl: realizedPnl.toString(),
      feesPaid: totalFeesPaid.toString(),
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(positions.id, positionId))
    .returning();
  return updated;
}

/**
 * Periodic funding accrual for open paper positions (PAPER-REALISM-001).
 * Charges each open position the real Hyperliquid funding rate for its
 * asset, pro-rated by elapsed wall-clock time since it was last charged
 * (or since the position opened, if never charged) relative to
 * Hyperliquid's real hourly funding interval -- not a fixed per-cycle
 * charge regardless of how long the position was actually open for.
 *
 * Uses `fetchFundingHistory` (the documented `fundingHistory` endpoint,
 * also used by `BACKTEST-001`'s dataset fetching), not `getFundingRate` --
 * verified directly against live Hyperliquid mainnet during implementation
 * that `getFundingRate`'s endpoint (`type: 'fundingRate'`) currently
 * returns a real HTTP 422 (matching a discrepancy flagged but left
 * unfixed by an earlier issue's audit, since re-verifying that function
 * wasn't that issue's scope) -- building a real, recurring cost
 * calculation on a demonstrably broken endpoint would mean funding never
 * actually accrues in practice, silently.
 *
 * `now` is injectable for deterministic testing; real callers use the
 * default. A position isn't charged more often than
 * `FUNDING_MIN_ACCRUAL_INTERVAL_MS`, avoiding a stream of near-zero
 * charges if this runs on a short interval. If no funding entry is
 * available for an asset this cycle, that position is simply skipped --
 * never charged a fabricated rate.
 */
const FUNDING_MIN_ACCRUAL_INTERVAL_MS = 5 * 60_000;
/** How far back to look for the most recent funding entry -- Hyperliquid publishes these hourly, so a few hours of lookback comfortably covers any single missed cycle. */
const FUNDING_LOOKBACK_MS = 6 * 60 * 60_000;

export async function accruePaperFunding(now: Date = new Date()): Promise<void> {
  if (env.EXECUTION_MODE !== 'paper' || isGloballyHalted()) return;

  const openPositions = await db.select().from(positions).where(eq(positions.status, 'OPEN'));
  for (const position of openPositions) {
    const lastCharged = position.lastFundingChargedAt ?? position.createdAt;
    const elapsedMs = now.getTime() - lastCharged.getTime();
    if (elapsedMs < FUNDING_MIN_ACCRUAL_INTERVAL_MS) continue;

    let fundingRate: number;
    try {
      const history = await fetchFundingHistory(position.asset, now.getTime() - FUNDING_LOOKBACK_MS, now.getTime());
      const latest = history[history.length - 1];
      if (!latest) continue;
      fundingRate = parseFloat(latest.fundingRate);
    } catch {
      continue;
    }

    const notional = parseFloat(position.entryPrice) * parseFloat(position.quantity);
    const cost = computeFundingCost(notional, fundingRate, position.side, elapsedMs);

    await db
      .update(positions)
      .set({
        fundingPaid: (parseFloat(position.fundingPaid) + cost).toString(),
        lastFundingChargedAt: now,
        updatedAt: now,
      })
      .where(eq(positions.id, position.id));
  }
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

    await fillOrder(order, parseFloat(order.limitPrice!), market);
  }
}
