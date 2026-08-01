# Observability Strategy

Added 2026-07-31 (migration plan step 16, issue [#20](https://github.com/jamalfrnk/LiquidAlpha/issues/20)).
Before this, the only diagnostic surfaces were `/api/market-data/health` and
`/api/websocket/metrics` -- narrow endpoints built as side effects of other PRs, not a
deliberate layer. This is "Observability Level Zero": the minimum needed to diagnose an
incident without reading raw console output, not a full APM integration.

## What this is not

- **Not an external APM/vendor integration.** No Datadog/Sentry/New Relic client is
  installed. Everything here is plain JSON logs and in-memory counters -- vendor-neutral
  by design, so a real exporter (Prometheus, OpenTelemetry) could be added later without
  changing any call site.
- **Not SLOs or alerting thresholds.** Defining "what counts as too slow" or "who gets
  paged" needs product/business input this pass didn't have -- see the "Needs a decision"
  section below rather than an invented threshold.
- **Not persistent.** Metrics (`server/src/observability/metrics.ts`) are in-memory and
  reset on every process restart. Acceptable for a first pass; revisit if
  restart-survivable metrics become necessary.

## Components

| Component | File | What it does |
|---|---|---|
| Structured logger | `server/src/observability/logger.ts` | One JSON line per call: `{ level, timestamp, message, ...fields }`. Callers pass only explicit named fields -- never a raw request/response/error object -- which is the actual mechanism that keeps secrets/tokens/PII out of logs (see "Security" below), not a scrubbing filter. |
| Request ID | `server/src/observability/requestContext.ts` | Reuses an incoming `X-Request-Id` header if present, otherwise generates one (`crypto.randomUUID()`). Attached to `req.requestId`, echoed back as a response header. |
| HTTP request logging | `server/src/observability/httpLogger.ts` | One log line per request, emitted on `res.on('finish')` (after the real status/duration are known): method, route, status, durationMs, category, requestId. |
| Error taxonomy | `server/src/observability/errorCategory.ts` | `categorizeStatus(status)` maps an HTTP status to `success \| validation \| auth \| not_found \| rate_limited \| internal` -- one shared mapping instead of each call site inventing its own label. |
| Metrics | `server/src/observability/metrics.ts` | Plain in-memory counters: API request counts by method/route/status, average duration per route, and named counters (`order_rejected`, `provider_retry_exhausted`) incremented from `execution/paperEngine.ts` and `hyperliquid-real.ts` at their real decision points. |
| Readiness | `server/src/observability/readiness.ts` | `checkReadiness()` -- database reachability (`select 1`) + market-data feed health (reuses the existing `getIngestionHealth()` from `feat/market-data-ingestion`, PR #9). Deliberately its own module, not inlined in `server.ts`, so it's unit-testable without importing `server.ts` (which connects to a real database and starts background intervals as an import-time side effect). |

## Endpoints

- `GET /api/health` -- liveness. Dependency-free; returns 200 as long as the process is
  running, even if Postgres or market data is down (that's exactly what `/api/ready`
  exists to catch separately).
- `GET /api/ready` -- readiness. 200 if both the database and market-data feed are
  healthy, 503 otherwise, with which check failed in the body.
- `GET /api/observability/metrics` -- the counters above, plus the pre-existing
  `wsServer.getMetrics()` (connections, subscriptions) and `getIngestionHealth()`. Does
  **not** replace `/api/market-data/health` or `/api/websocket/metrics` -- kept in case
  anything already depends on their narrower shape.

## Client

- `client/src/features/realtime/ConnectionStatus.tsx` -- visible WS connection-state
  indicator (icon + text, not color alone) in the app header, backed by
  `useMarketDataSocket()` now returning its live status instead of `void`.
- `client/src/app/ErrorBoundary.tsx` -- wraps route content in `AppShell.tsx` so one
  failing screen doesn't blank the whole app.
- `client/src/lib/api.ts`'s `ApiError` now carries the server's `X-Request-Id` (requires
  `exposedHeaders` in the server's CORS config, since client and server run on different
  origins and a custom response header is otherwise invisible to `fetch()` cross-origin)
  -- surfaced today in the two existing error-display sites (`OrderTicket.tsx`,
  `RiskLimitsForm.tsx`) as `(ref: <id>)`, so a user can quote a stable reference that
  cross-references the server's own logs for that exact request.

## Security

Logs contain only explicit, named fields the caller passes -- method, route, status,
duration, requestId, and a handful of narrow error fields (e.g. `error.message`, never a
full error/request object). Spot-checked: no route logs a cookie, JWT, wallet signature,
or full request/response body. See `docs/security/SECURITY_BASELINE.md`'s "Logging/
monitoring failures" row, now addressed by this pass.

## Needs a decision (not invented here)

- SLO targets (acceptable API latency, acceptable market-data staleness before it's a
  paging event) -- product/business input required.
- Whether/when to add a real metrics exporter (Prometheus, OpenTelemetry) once there's an
  operator to consume it.
- Metrics persistence across restarts, if incident post-mortems need historical data the
  in-memory counters can't provide.
