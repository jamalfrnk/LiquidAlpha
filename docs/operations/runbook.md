# Operations Runbook

First pass, added alongside `docs/observability/` (migration step 16, issue #20). Covers
the scenarios that observability layer can actually detect today -- extend this as real
incidents happen rather than speculating further scenarios in advance.

## WS shows "Reconnecting…" for an extended period

**Signal**: `ConnectionStatus` in the client header shows amber "Reconnecting…" instead
of green "Live" for longer than a few reconnect cycles (`RECONNECT_DELAY_MS` = 3s per
attempt in `useMarketDataSocket.ts`).

**Check**:
1. `GET /api/observability/metrics` -- `websocket.connections`. If it's 0 across all
   clients, the WS server itself may be down, not just this one client's network.
2. Server logs for `server_started` (confirms the WS server bound to `env.WS_PORT` at
   boot) and for any uncaught exception around `websocket/server.ts`.
3. Confirm `env.WS_PORT` is reachable from the client's network (firewall, reverse proxy
   WS upgrade support).

**Known limitation**: the client retries indefinitely with a fixed 3s delay -- there is
no backoff cap or "give up" state, so a sustained outage will just show "Reconnecting…"
forever rather than surfacing as a distinct failure state. If this becomes a real
incident pattern, that's the point to add a genuine third connection state (see the
comment on `ConnectionStatus`'s type).

## Market data appears stale / `/api/markets` rows show `stale: true`

**Signal**: `GET /api/market-data/health` or `GET /api/ready`'s `checks.marketData`
report `consecutiveFailures >= 3` (`healthy: false`).

**Check**:
1. Server logs won't show a dedicated ingestion-failure line today (the ingestion loop
   in `market-data/ingestion.ts` records failures into `getIngestionHealth()`'s counters
   but doesn't itself call the structured logger) -- this is a known gap, not yet wired.
   Cross-check by watching whether `apiRequestsByRouteAndStatus` for
   `GET /api/markets` keeps advancing while prices stop changing.
2. Confirm the CoinGecko API is reachable and not rate-limiting this server's IP.
3. `getIngestionHealth().lastSuccessAt` age tells you how long the feed has actually been
   down, independent of any individual `markets` row's `updatedAt`.

## `/api/ready` returns 503

**Signal**: readiness probe fails; `/api/health` still returns 200 (process is up, just
not ready).

**Check**: read the response body -- `checks.database` and `checks.marketData` are
independent, so the body tells you which one is failing without guessing.
- `checks.database.ok: false` -- Postgres is unreachable. Check `DATABASE_URL`, network
  path to the database, and connection-pool exhaustion.
- `checks.marketData.ok: false` -- see "Market data appears stale" above.

## Elevated order rejections

**Signal**: `GET /api/observability/metrics`'s `counters.order_rejected` climbing faster
than expected relative to order volume.

**Check**: `rejectOrder` in `execution/paperEngine.ts` is the single path every rejection
goes through (risk-limit failure, marketability failure, price-deviation/staleness
check) -- the rejection reason itself is returned to the client and stored on the order
row (`orders.rejectionReason`), so query recent `REJECTED` orders directly for the actual
reasons rather than trying to infer them from the counter alone.

## Elevated `provider_retry_exhausted`

**Signal**: `counters.provider_retry_exhausted` climbing.

**Check**: this only increments when a Hyperliquid API call
(`hyperliquid-real.ts`'s `postJSON`) exhausted its retry budget on a 5xx/429 or a
network-level failure (timeout, connection error) -- not on a plain 4xx. Check
Hyperliquid's own status/API health first; this metric can't distinguish "their outage"
from "our network path to them," only that retries ran out.

## What's explicitly not covered yet

- No alerting/paging is wired to any of these signals -- this runbook assumes a human is
  watching `/api/ready` or the metrics endpoint, not that anything pages automatically.
  Defining alert thresholds needs product/business input (see
  `docs/observability/strategy.md`'s "Needs a decision").
- Ingestion-cycle failures aren't yet logged as structured `log()` calls (see the market-
  data section above) -- only exposed via the existing counter-based health check.
