import { env } from './config/env';
import http from 'node:http';
import path from 'node:path';
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
import { executionRouter } from './execution/router';
import { analyticsRouter } from './analytics/router';
import { sweepLimitOrders } from './execution/paperEngine';
import { apiLimiter } from './middleware/rateLimit';
import { runIngestionCycle, getIngestionHealth, STALE_AFTER_MS } from './market-data/ingestion';
import { requestContext, RESPONSE_REQUEST_ID_HEADER } from './observability/requestContext';
import { httpLogger } from './observability/httpLogger';
import { log } from './observability/logger';
import { metricsSnapshot } from './observability/metrics';
import { checkReadiness } from './observability/readiness';

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

// Single-origin production serving (DEPLOY-001): the built client and the
// API/WS server share one process/port, so a browser refresh on a client
// route, a WS upgrade, and an API call are all same-origin -- no separate
// client host to configure CORS/cookies for in production. Local dev is
// unchanged: Vite still serves the client on 5173 and the WS server still
// binds its own WS_PORT, matching how `npm run dev` in both packages has
// always worked.
const isProduction = process.env.NODE_ENV === 'production';
const clientDistPath = path.resolve(__dirname, '../../client/dist');
// `exposedHeaders` is required for browser JS to read a custom response
// header cross-origin at all -- without it, `X-Request-Id` is set on the
// wire but invisible to `fetch()`'s `res.headers.get(...)` in the client,
// silently defeating the whole point of sending it back.
app.use(cors({ origin: corsOrigins, credentials: true, exposedHeaders: [RESPONSE_REQUEST_ID_HEADER] }));
// Assign/propagate a request ID and emit one structured log line per
// request before anything else runs, so every request -- including ones
// that get rate-limited or fail body parsing -- is covered.
app.use(requestContext);
app.use(httpLogger);
app.use(express.json());
app.use(cookieParser());

if (isProduction) {
  // `index: false` -- index.html is served explicitly by the SPA-fallback
  // route below (registered after /api routes), not by static's own
  // directory-index behavior, so it can get the no-cache header below
  // instead of static's default caching.
  app.use(
    express.static(clientDistPath, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          // Vite fingerprints these filenames by content hash, so a cached
          // copy is never stale -- a new deploy just ships new filenames.
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
}

app.use('/api', apiLimiter);
app.use('/api/auth', authRouter);
app.use('/api/risk', riskRouter);
app.use('/api/execution', executionRouter);
app.use('/api/analytics', analyticsRouter);

// Install global error handlers for unhandled rejections and uncaught
// exceptions.  Without this, asynchronous errors may cause the Node.js
// process to terminate silently.
installProcessErrorHandlers();

// Start the database connection before handling any requests.  If the
// connection fails the promise will reject and the server will not start.
connectDb().then(() => {
  log('info', 'database_connected');
}).catch((err) => {
  log('error', 'database_connection_failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

// The shared HTTP server both Express and the WebSocket upgrade attach to
// in production. `app.listen(...)` (used in dev below) does this same
// `http.createServer(app)` internally -- doing it explicitly here is what
// lets the WS server share the port instead of opening its own.
const httpServer = http.createServer(app);

/**
 * WebSocket server with real per-channel/per-symbol subscriptions --
 * replacing the previous global broadcast-to-every-client, which had no
 * concept of client interest at all (GH F-4, Replit H-4). See
 * websocket/server.ts for the subscription/auth/heartbeat mechanics.
 *
 * Production shares the single public HTTP server/port (DEPLOY-001); local
 * dev keeps the existing separate WS_PORT, unchanged.
 */
const wsServer = createMarketDataWsServer(isProduction ? httpServer : env.WS_PORT);

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
    log('error', 'signal_generation_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

// Kick off background tasks with specified intervals
setInterval(() => runIngestionCycle((symbol, event, payload) => wsServer.publishMarketUpdate(symbol, event, payload)), 10_000);
setInterval(updateSignals, 30_000);
setInterval(() => {
  sweepLimitOrders().catch((err) =>
    log('error', 'limit_order_sweep_failed', { error: err instanceof Error ? err.message : String(err) }),
  );
}, 10_000);

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
    log('error', 'funding_rate_fetch_failed', { requestId: req.requestId, symbol, error: err.message });
    res.status(500).json({ error: err.message || 'Funding rate fetch failed' });
  }
}));

// Liveness: is the process up at all. Deliberately dependency-free -- this
// must return 200 even if Postgres or the market-data feed is down, since
// those are exactly the conditions /api/ready exists to surface separately.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

// Readiness: are this process's actual dependencies (database, market-data
// feed) usable right now. See observability/readiness.ts for why this is a
// separate, independently unit-tested module rather than inlined here.
app.get('/api/ready', wrapAsync(async (_req, res) => {
  const readiness = await checkReadiness();
  res.status(readiness.ready ? 200 : 503).json(readiness);
}));

// Consolidated view of the counters/metrics this pass adds -- API request
// counts/durations, order rejections, provider retry exhaustion -- plus the
// pre-existing WS and market-data health signals, in one place. Does not
// replace /api/market-data/health or /api/websocket/metrics (kept for
// backward compatibility with anything already depending on their shape).
app.get('/api/observability/metrics', (_req, res) => {
  res.json({
    ...metricsSnapshot(),
    websocket: wsServer.getMetrics(),
    marketData: getIngestionHealth(),
  });
});

// SPA fallback -- registered after every /api route (so an unmatched API
// path still 404s as JSON via Express's default, not as this HTML page)
// and after static (so a real built asset is served from disk, not this
// fallback). Anything else GET-able falls back to index.html so a browser
// refresh on a client-side route like /analytics finds the SPA shell
// instead of a 404.
if (isProduction) {
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Global error handler.  If any wrapped route throws an error it will
// arrive here.  Avoid exposing stack traces to clients in production.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log('error', 'unhandled_route_error', { requestId: req.requestId, route: req.path, error: err?.message ?? String(err) });
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start the HTTP server. In production this is the single public port
// serving the API, the built client, and WebSocket upgrades together
// (DEPLOY-001); in dev it's the API/WS split that `npm run dev` in both
// packages has always assumed. Binds 0.0.0.0 so it's reachable from
// outside localhost when deployed (Replit, containers, etc.).
const PORT = env.PORT;
httpServer.listen(PORT, '0.0.0.0', () => {
  log('info', 'server_started', {
    httpPort: PORT,
    wsPort: isProduction ? PORT : env.WS_PORT,
    mode: isProduction ? 'production-single-origin' : 'development-split-origin',
  });
});
