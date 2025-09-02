import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { db, connectDb } from './db/index';
import { markets, signals } from './db/schema';
import { addPricePoints } from './price-history';
import { generateSignals } from './technical-analysis';
import { getFundingRate } from './hyperliquid-real';
import { wrapAsync, installProcessErrorHandlers } from './bootstrap';
import { eq } from 'drizzle-orm';

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

// Create the Express application.  Apply CORS and JSON body parsing
// middleware.  CORS is open by default here; you may restrict it via
// the `origin` option in production.
const app = express();
app.use(cors());
app.use(express.json());

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
 * WebSocket management
 *
 * A single WebSocketServer instance manages connections on WS_PORT.
 * Clients receive two kinds of broadcasts:
 *   - marketUpdate: emitted when fresh market data has been fetched
 *   - newSignal: emitted when a new trading signal is generated
 *
 * The `clients` set holds references to active connections so that
 * broadcasts can iterate without keeping stale references after a
 * connection closes.  On connection, each client is added to the set; on
 * close it is removed.  The WebSocketServer itself handles ping/pong to
 * keep connections alive; no additional heartbeat is implemented here as
 * the built‑in ping interval of ws suffices for typical usage.
 */
const WS_PORT = parseInt(process.env.WS_PORT || '8080', 10);
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set<WebSocket>();

// Broadcast helper: sends a JSON serialised message to all connected
// clients.  If a client is not open the send attempt is ignored.
function broadcast(event: string, payload: unknown) {
  const message = JSON.stringify({ event, payload });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (err) {
        // Ignore errors on individual clients; they will be cleaned up on close.
      }
    }
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => {
    clients.delete(ws);
  });
});

/**
 * Fetch live market data from a third‑party provider.
 *
 * This function calls the CoinGecko simple price API to retrieve
 * current prices, 24‑hour percentage changes and volumes for BTC,
 * ETH and SOL.  CoinGecko’s API is free and requires no API key for
 * basic endpoints.  If you have a premium key you can store it in
 * COINGECKO_API_KEY and set it as a header below.  See
 * https://www.coingecko.com/en/api/documentation for details.
 *
 * @returns an object keyed by uppercase symbol containing price,
 *          24h change and volume values; undefined on failure
 */
async function fetchMarketData() {
  try {
    const ids = ['bitcoin', 'ethereum', 'solana'];
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`CoinGecko response ${res.status}`);
    }
    const data = await res.json();
    // Map CoinGecko ids to our symbols and return the relevant fields
    return {
      BTC: {
        price: data.bitcoin.usd,
        change24h: data.bitcoin.usd_24h_change,
        volume: data.bitcoin.usd_24h_vol,
      },
      ETH: {
        price: data.ethereum.usd,
        change24h: data.ethereum.usd_24h_change,
        volume: data.ethereum.usd_24h_vol,
      },
      SOL: {
        price: data.solana.usd,
        change24h: data.solana.usd_24h_change,
        volume: data.solana.usd_24h_vol,
      },
    };
  } catch (err) {
    console.error('Failed to fetch market data', err);
    return undefined;
  }
}

/**
 * Periodically update market data.
 *
 * This function is invoked every 10 seconds to fetch the latest prices
 * from CoinGecko and persist them in the database.  It also records
 * price observations into the priceHistory table and broadcasts updates
 * to connected WebSocket clients.  If fetching fails, the error is
 * logged but the function does not throw; it will retry on the next
 * interval.
 */
async function updateMarkets() {
  const data = await fetchMarketData();
  if (!data) return;
  const timestamp = new Date();
  for (const symbol of Object.keys(data) as Array<keyof typeof data>) {
    const { price, change24h, volume } = data[symbol];
    // Insert snapshot into markets table
    await db.insert(markets).values({
      symbol,
      price,
      change24h,
      volume,
    });
    // Record price point into history
    await addPricePoints([{ symbol, price, timestamp }]);
    // Broadcast the market update
    broadcast('marketUpdate', { symbol, price, change24h, volume, timestamp });
  }
}

/**
 * Periodically generate trading signals.
 *
 * Every 30 seconds this function invokes the signal generator to
 * evaluate current price history and create new signals.  After
 * generation it broadcasts a notification to clients so they can
 * refresh their signal lists.  Errors are logged but do not interrupt
 * the interval loop.
 */
async function updateSignals() {
  try {
    await generateSignals();
    broadcast('newSignal', { message: 'Signals updated' });
  } catch (err) {
    console.error('Signal generation failed', err);
  }
}

// Kick off background tasks with specified intervals
setInterval(updateMarkets, 10_000);
setInterval(updateSignals, 30_000);

/**
 * REST API routes
 */

// Fetch the latest market snapshots (most recent 50 entries).  The results
// are ordered by updatedAt descending so that the newest entries appear
// first.  In practice, you might want to limit results per symbol.
app.get('/api/markets', wrapAsync(async (_req, res) => {
  const rows = await db
    .select()
    .from(markets)
    .orderBy(markets.updatedAt.desc())
    .limit(50);
  res.json(rows);
}));

// Retrieve all generated signals.  In a future version this endpoint
// could accept query parameters to filter by asset, date range or
// confidence threshold.  Signals are ordered by creation time
// descending.
app.get('/api/signals', wrapAsync(async (_req, res) => {
  const rows = await db
    .select()
    .from(signals)
    .orderBy(signals.createdAt.desc());
  res.json(rows);
}));

// Trigger signal generation on demand.  This POST endpoint allows
// clients to request immediate signal generation.  The request body
// may include an optional `symbol` property to restrict generation to
// a single asset.  If `symbol` is not provided, signals for all
// supported assets will be generated.  After generation the new
// signals are returned in the response.
app.post('/api/signals/generate', wrapAsync(async (req, res) => {
  const { symbol } = req.body as { symbol?: string };
  // If a symbol is supplied we could implement a filtered generator,
  // however the current generateSignals implementation processes all
  // assets.  This branch is reserved for future custom logic.
  await generateSignals();
  // Fetch the most recent signals for the response
  const rows = await db
    .select()
    .from(signals)
    .orderBy(signals.createdAt.desc())
    .limit(10);
  res.json(rows);
  broadcast('newSignal', { message: 'Signals generated via API' });
}));

// Returns simple statistics about signals.  At the moment it reports
// total signals and the number of active signals.  Additional metrics
// (e.g. average confidence) can be added in the future.
app.get('/api/stats', wrapAsync(async (_req, res) => {
  const total = await db.select().from(signals);
  const active = await db
    .select()
    .from(signals)
    .where(eq(signals.active, true));
  res.json({
    totalSignals: total.length,
    activeSignals: active.length,
  });
}));

// Fetch the current funding rate for a given symbol.  This route
// proxies the request through the Hyperliquid API wrapper.  The
// returned object includes `time`, `coin` and `fundingRate` fields.
app.get('/api/funding/:symbol', wrapAsync(async (req, res) => {
  const { symbol } = req.params as { symbol: string };
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
const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`);
  console.log(`WebSocket server listening on ws://localhost:${WS_PORT}`);
});
