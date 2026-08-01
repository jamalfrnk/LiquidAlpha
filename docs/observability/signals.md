# Observability Signals Reference

What's instrumented, where it lives, and how to read it. Companion to
`docs/observability/strategy.md` (the why); this is the how.

## Log lines

All logs are one-line JSON via `server/src/observability/logger.ts`'s `log(level,
message, fields)`. Every log line has `level`, `timestamp`, `message`, plus whatever
`fields` the call site passed.

| `message` | Emitted from | Fields | Meaning |
|---|---|---|---|
| `http_request` | `observability/httpLogger.ts`, every request | `requestId, method, route, status, durationMs, category` | One line per completed HTTP request/response. |
| `database_connected` | `server.ts` boot | — | Startup succeeded. |
| `database_connection_failed` | `server.ts` boot | `error` | Startup failed; process exits (unchanged behavior, now logged structurally first). |
| `signal_generation_failed` | `server.ts`'s 30s signal-generation interval | `error` | The periodic signal generator threw; the interval keeps running on the next tick. |
| `limit_order_sweep_failed` | `server.ts`'s 10s limit-order sweep interval | `error` | Same pattern for the limit-order sweep. |
| `funding_rate_fetch_failed` | `GET /api/funding/:symbol` handler | `requestId, symbol, error` | Hyperliquid funding-rate fetch failed for this request. |
| `unhandled_route_error` | Global Express error handler | `requestId, route, error` | Any route that threw and fell through to the catch-all handler. |
| `unhandled_rejection` / `uncaught_exception` | `bootstrap.ts`'s process-level handlers | `reason`/`error, stack` | Process-level failures Node would otherwise report only to stderr in an unstructured form. |
| `server_started` | `server.ts` boot | `httpPort, wsPort` | Listener is up. |

## Counters (`GET /api/observability/metrics`)

```json
{
  "apiRequestsByRouteAndStatus": { "GET /api/markets 200": 42 },
  "apiRouteAvgDurationMs": { "GET /api/markets": 12.4 },
  "counters": { "order_rejected": 3, "provider_retry_exhausted": 1 },
  "websocket": { "connections": 2, "totalSubscriptions": 5, "totalConnectionsAccepted": 7 },
  "marketData": { "healthy": true, "consecutiveFailures": 0, "lastSuccessAt": "...", "lastAttemptAt": "..." }
}
```

- `apiRequestsByRouteAndStatus` / `apiRouteAvgDurationMs` -- from every request through
  `httpLogger`, keyed by `"METHOD route"` (and status, for the count map). The duration
  figure is a plain running average, not a true histogram (no percentiles) -- adequate
  for "is this route generally slow," not for tail-latency analysis.
- `counters.order_rejected` -- incremented in `execution/paperEngine.ts`'s `rejectOrder`,
  the single choke point every order rejection (risk-limit failure, marketability
  failure, etc.) already passes through.
- `counters.provider_retry_exhausted` -- incremented in `hyperliquid-real.ts`'s
  `postJSON` only when a *retryable* failure (5xx or 429) ran out of retry attempts, not
  for a plain non-retryable 400/404 that was never retried in the first place.
- `websocket` -- `connections`/`totalSubscriptions` are pre-existing signals
  (`wsServer.getMetrics()`), reused here rather than duplicated.
  `totalConnectionsAccepted` is new: a monotonic, never-decremented count of every
  connection accepted since process start. There's no pre-auth client identity to key a
  true per-client "reconnect" count off, so this is the honest server-side reconnection
  signal -- watched alongside the live `connections` gauge, a `totalConnectionsAccepted`
  that keeps climbing while `connections` stays flat around the expected number of open
  dashboards is what sustained reconnect churn looks like. Regression-tested in
  `server/src/websocket/server.test.ts`'s "increments totalConnectionsAccepted on a
  manual disconnect/reconnect" case.
- `marketData` -- pre-existing signal (`getIngestionHealth()`), reused here rather than
  duplicated.

## Readiness (`GET /api/ready`)

```json
{
  "ready": false,
  "checks": {
    "database": { "ok": false, "error": "connection refused" },
    "marketData": { "ok": true, "consecutiveFailures": 0 }
  }
}
```

`ready` is `database.ok && marketData.ok`. Each check is independent -- a database outage
doesn't mask (or fake) the market-data feed's own health, and vice versa. See
`server/src/observability/readiness.test.ts` for the three cases this is regression-tested
against: both healthy, database down, and market-data feed down.

## Client

- Connection indicator (`features/realtime/ConnectionStatus.tsx`): "Live" (green Wifi
  icon) when the WS is open, "Reconnecting…" (amber WifiOff icon) otherwise. Two states
  only -- see the comment on `ConnectionStatus` type in `useMarketDataSocket.ts` for why a
  third "gave up" state isn't modeled (nothing in the reconnect logic can produce it
  today).
- Error reference (`(ref: <requestId>)` in `OrderTicket.tsx`/`RiskLimitsForm.tsx`'s error
  messages): the same ID that appears in the server's `http_request` log line for that
  request -- grep server logs for it to find the exact request that failed.
