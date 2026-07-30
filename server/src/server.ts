import { env } from './config/env';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createMarketDataWsServer } from './websocket/server';
import { db, connectDb } from './db/index';
import { markets, signals } from './db/schema';
import { generateSignals } from './technical-analysis';
import { getFundingRate } from './hyperliquid-real';
import { wrapAsync, installProcessErrorHandlers } from './bootstrap';
import { count, desc, eq } from 'drizzle-orm';
import { validate } from './middleware/validate';
import { GenerateSignalsRequestSchema, type GenerateSignalsRequest } from './schemas/signals';
import { FundingRateParamsSchema, type FundingRateParams } from './schemas/markets';
import { PaginationQuerySchema, type PaginationQuery } from './schemas/pagination';
import { authRouter } from './auth/router';
import { riskRouter } from './risk/router';
import { apiLimiter } from './middleware/rateLimit';
import { runIngestionCycle, getIngestionHealth, STALE_AFTER_MS } from './market-data/ingestion';

/**
 * Main server module for LiquidAlpha.
 *
 * This file sets up an Express application to expose REST endpoints and
 * configures a WebSocket server for pushing real‑time market data and
 * trading signals to connected clients.  It also orchestrates periodic
 * background tasks such as fetching market prices and generating signals.
 *
 * The implementation follows the guidelines described in the LiquidAlpha
 * specification document.  HTTP routes use the wrapAsync helper to
 * gracefully handle promise rejections.  WebSocket broadcasts are
 * type‑annotated strings to help clients distinguish message types.
 */

// Create the Express application. CORS must be an explicit allowlist, not
// wide open -- this now carries a cookie-based session, and an open
// `origin: true`/`*` policy combined with `credentials: true` would let any
// site read authenticated responses on a signed-in user's behalf. Configure
// real origins via CORS_ORIGIN (comma-separated) in non-local environments.
const corsOrigins = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];
const app = express();
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/api', apiLimiter);
app.use('/api/auth', authRouter);
app.use('/api/risk', riskRouter);

// Install global error handlers for unhandled rejections and uncaught
// exceptions.  Without this, asynchronous errors may cause the Node.js
// process to terminate silently.
installProcessErrorHandlers();

// Start the database connection before handling any requests.  If the
// connection fails the promise will reject and the server will not start.
connectDb().then(() => {
  console.log('Database connected');
}).catch((err) => {
  console.error('Failed to connect to database', err);
  process.exit(1);
});

/**
 * WebSocket server with real per-channel/per-symbol subscriptions --
 * replacing the previous global broadcast-to-every-client, which had no
 * concept of client interest at all (GH F-4, Replit H-4). See
 * websocket/server.ts for the subscription/auth/heartbeat mechanics.
 */
const wsServer = createMarketDataWsServer(env.WS_PORT);

/**
 * Periodically generate trading signals.
 *
 * Every 30 seconds this function invokes the signal generator to
 * evaluate current price history and create new signals.  After
 * generation it publishes a notification to clients subscribed to the
 * `signals` channel so they can refresh their signal lists.  Errors are
 * logged but do not interrupt the interval loop.
 */
async function updateSignals() {
  try {
    await generateSignals();
    wsServer.publishSignal('newSignal', { message: 'Signals updated' });
  } catch (err) {
    console.error('Signal generation failed', err);
  }
}

// Kick off background tasks with specified intervals
setInterval(() => runIngestionCycle((symbol, event, payload) => wsServer.publishMarketUpdate(symbol, event, payload)), 10_000);
setInterval(updateSignals, 30_000);

/**
 * REST API routes
 */

// Fetch the latest market snapshots (most recent 50 entries).  The results
// `markets` holds exactly one row per symbol (upserted by the ingestion
// cycle -- see market-data/ingestion.ts), so this is always small and
// needs no pagination.
//
// Each row carries a `stale` flag rather than leaving clients to guess
// whether a price is current -- true once updatedAt is older than
// STALE_AFTER_MS (three missed ingestion cycles), which is what happens
// when the feed degrades instead of a fabricated price silently taking
// its place.
app.get('/api/markets', wrapAsync(async (_req, res) => {
  const rows = await db.select().from(markets).orderBy(markets.symbol);
  const now = Date.now();
  res.json(
    rows.map((row) => ({
      ...row,
      stale: now - row.updatedAt.getTime() > STALE_AFTER_MS,
    })),
  );
}));

// Reports whether the market-data ingestion loop is currently healthy --
// i.e. whether CoinGecko fetches have been succeeding -- distinct from
// whether any individual market row happens to be stale.
app.get('/api/market-data/health', (_req, res) => {
  res.json(getIngestionHealth());
});

// Server-side fan-out visibility: how many connections and subscriptions
// the WebSocket server currently has, rather than that state being opaque.
app.get('/api/websocket/metrics', (_req, res) => {
  res.json(wsServer.getMetrics());
});

// Retrieve generated signals, paginated (default 50, max 100 per page --
// this had no limit at all before, so it returned every signal ever
// generated on every call). In a future version this endpoint could also
// accept filters by asset, date range, or confidence threshold. Signals
// are ordered by creation time descending.
app.get('/api/signals', validate('query', PaginationQuerySchema), wrapAsync(async (req, res) => {
  const { limit, offset } = req.query as unknown as PaginationQuery;
  const rows = await db
    .select()
    .from(signals)
    .orderBy(desc(signals.createdAt))
    .limit(limit)
    .offset(offset);
  res.json(rows);
}));

// Trigger signal generation on demand.  This POST endpoint allows
// clients to request immediate signal generation.  The request body
// may include an optional `symbol` property to restrict generation to
// a single asset.  If `symbol` is not provided, signals for all
// supported assets will be generated.  After generation the new
// signals are returned in the response.
app.post('/api/signals/generate', validate('body', GenerateSignalsRequestSchema), wrapAsync(async (req, res) => {
  const { symbol } = req.body as GenerateSignalsRequest;
  // If a symbol is supplied we could implement a filtered generator,
  // however the current generateSignals implementation processes all
  // assets.  This branch is reserved for future custom logic.
  await generateSignals();
  // Fetch the most recent signals for the response
  const rows = await db
    .select()
    .from(signals)
    .orderBy(desc(signals.createdAt))
    .limit(10);
  res.json(rows);
  wsServer.publishSignal('newSignal', { message: 'Signals generated via API' });
}));

// Returns simple statistics about signals.  At the moment it reports
// total signals and the number of active signals.  Additional metrics
// (e.g. average confidence) can be added in the future.
app.get('/api/stats', wrapAsync(async (_req, res) => {
  // Aggregate counts server-side instead of fetching every row just to
  // measure .length -- was a full-table transfer on every hit (GH F-8).
  const [{ total }] = await db.select({ total: count() }).from(signals);
  const [{ active }] = await db
    .select({ active: count() })
    .from(signals)
    .where(eq(signals.status, 'ACTIVE'));
  res.json({
    totalSignals: total,
    activeSignals: active,
  });
}));

// Fetch the current funding rate for a given symbol.  This route
// proxies the request through the Hyperliquid API wrapper.  The
// returned object includes `time`, `coin` and `fundingRate` fields.
app.get('/api/funding/:symbol', validate('params', FundingRateParamsSchema), wrapAsync(async (req, res) => {
  const { symbol } = req.params as unknown as FundingRateParams;
  try {
    const rate = await getFundingRate(symbol);
    res.json(rate);
  } catch (err: any) {
    console.error('Funding rate error', err);
    res.status(500).json({ error: err.message || 'Funding rate fetch failed' });
  }
}));

// Global error handler.  If any wrapped route throws an error it will
// arrive here.  Avoid exposing stack traces to clients in production.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled route error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start the HTTP server.  The port can be configured via the PORT
// environment variable.  A message is printed to the console on start.
const PORT = env.PORT;
app.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`);
  console.log(`WebSocket server listening on ws://localhost:${env.WS_PORT}`);
});
