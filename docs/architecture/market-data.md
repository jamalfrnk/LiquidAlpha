# Market Data Architecture (DATA-HL-001, issue #34)

## Status: partially implemented

**Implemented:** Hyperliquid REST ingestion (mid price + 24h change/volume via
`metaAndAssetCtxs`, funding-rate history, OHLCV candles), CoinGecko demoted to an
explicit, clearly-labeled fallback, per-row source attribution, decimal-safe
external boundaries.

**Deferred:** a live Hyperliquid WebSocket connection (this issue's REST-only cadence
is 10s for prices / 60s for candles -- adequate for the mission's "near real-time ·
refreshed every N seconds" mode, but not the shared-WS "live" mode the mission
describes), reconnect/backoff/stale-fallback hardening, and a `MarketHealthService`
surfacing per-symbol freshness beyond the existing `getIngestionHealth()`. All three
are `DATA-RECOVERY-001`'s explicit scope, layered on top of the provider this issue
delivers.

## Why Hyperliquid direct-integration, not a maintained SDK

Evaluated `@nktkas/hyperliquid` (the most actively maintained TypeScript SDK,
Node 22+, updated within the last two months as of this decision) against direct
REST/WS integration with Zod validation.

**Chose direct integration.** Reasoning:

- The read-only surface this app actually needs (`allMids`, `meta`, `metaAndAssetCtxs`,
  `candleSnapshot`, `fundingHistory`) is four simple, unauthenticated `POST /info`
  calls with tiny JSON bodies -- there is no meaningful implementation complexity an
  SDK would save here. `server/src/hyperliquid-real.ts` already had a working
  `postJSON` helper (retry/backoff/timeout, `HttpStatusError` handling) from the
  pre-existing funding-rate integration; the new functions in this issue reuse it
  rather than duplicating an SDK's own HTTP layer.
- A general-purpose Hyperliquid SDK's surface area includes order construction and
  signing (even if unused by this app), which is exactly the kind of "dormant
  transaction-signing code" the mission explicitly says not to introduce, even
  latently via a dependency. Direct integration means the only Hyperliquid-related
  code in this repository is the read-only subset this product actually needs --
  auditable in one file, not obscured behind a third-party package's full
  live-trading-capable API surface.
- Zod validation at the boundary (this issue's contracts) is required regardless of
  whether an SDK is used, since the mission calls for runtime validation of every
  external response -- an SDK's own TypeScript types are a compile-time contract, not
  a runtime one, so adopting it wouldn't have removed the need for this schema layer.

This is a "smallest blast radius" choice for the current paper-only, non-signing
product, not a claim that SDKs are never appropriate -- worth revisiting if a future,
separately-authorized live-trading product needs order construction/signing, at
which point evaluating a maintained SDK's *execution* client (not just its info
client) becomes the relevant comparison.

## Data flow

```
Hyperliquid POST /info (metaAndAssetCtxs, candleSnapshot, fundingHistory)
    -> hyperliquid-real.ts (Zod validation, HttpStatusError-aware retry/backoff)
    -> market-data/ingestion.ts
         - runIngestionCycle (10s): price/change/volume -> markets table (upsert)
         - runCandleBackfillCycle (60s): OHLCV -> candles table (upsert)
    -> WS fan-out (websocket/server.ts, publishMarketUpdate) + REST (/api/markets, /api/markets/:symbol/candles)
```

CoinGecko (`market-data/coingecko.ts`, unchanged from before this issue) is called
**only** when a `runIngestionCycle` pass finds Hyperliquid didn't cover any of the
three tracked symbols (`BTC`/`ETH`/`SOL`) -- not as a per-symbol fallback, and not on
every cycle. Every `markets` row carries `source: 'hyperliquid' | 'coingecko'`
(new column) so no consumer has to guess which provider produced a given price. See
`market-data/ingestion.ts`'s `selectMarketRows` (pure, unit-tested) for the exact
selection logic.

## Contracts (`server/src/schemas/marketData.ts`)

Verified directly against Hyperliquid's own docs
(hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api) and against the live
mainnet API during implementation (not merely inferred from documentation text) --
`allMids`, `meta`, `metaAndAssetCtxs`, `candleSnapshot`, and `fundingHistory` request/
response shapes all confirmed to match real responses before this issue was
considered done.

- `NormalizedCandle` -- this app's own candle shape (venue, symbol, marketType,
  interval, openTime, closeTime, sourceTimestamp, receivedAt, OHLCV, closed),
  independent of Hyperliquid's single-letter wire field names (`t`/`T`/`s`/`i`/`o`/
  `c`/`h`/`l`/`v`/`n`). Sequence/ordering info is **not** provided by this API and is
  deliberately omitted rather than fabricated.
- `HyperliquidAssetSnapshot` -- `meta`'s per-asset metadata (`szDecimals`,
  `maxLeverage`) zipped with `metaAndAssetCtxs`'s live context (price, 24h-change
  basis, volume) by array position (`zipMetaAndAssetCtxs`, pure and unit-tested).
- `MarketSnapshotSource` -- `'hyperliquid' | 'coingecko'`, the same enum used for
  `markets.source` (Postgres enum, not a free-text column).

## Decimal precision

Every price/size field is parsed as a **string** at the Hyperliquid boundary
(`decimalString` in `schemas/marketData.ts`, tolerant of Hyperliquid's real-world
REST-vs-WS wire-format inconsistency: REST returns strings, the WS `candle` channel's
own docs show numbers -- this schema accepts either and normalizes to string) and
stored as Postgres `numeric` (arbitrary-precision, not `float`/`double`) in both
`markets` and the new `candles` table. `changePercent24h` in
`HyperliquidAssetSnapshot` is computed as a plain JS number from those strings --
acceptable here because it is a **display-only** derived percentage, not a
P&L/fee/risk-sensitive calculation (those calculations, wherever they exist
elsewhere in this codebase, are out of this issue's scope to re-verify).

## Schema changes

- `markets`: added `source` (new `market_snapshot_source` enum, defaults
  `'hyperliquid'`), `szDecimals`, `maxLeverage` (both nullable integers, populated
  from Hyperliquid's `meta`, absent on CoinGecko-fallback rows).
- `candles` (new table): one row per `(symbol, interval, openTime)` (unique index --
  the same unbounded-growth mistake `markets`/`price_history` each needed a
  since-fixed upsert pattern for is avoided here from the start), OHLCV as `numeric`,
  `closed` boolean, `venue`/`marketType` for future non-perp/non-Hyperliquid
  extension.

## New endpoint

`GET /api/markets/:symbol/candles?interval=1m&limit=100` -- `limit` capped at 500
(Zod-validated), most-recent-first. Backfilled every 60s by
`runCandleBackfillCycle` for `BTC`/`ETH`/`SOL` at `1m` (a 5-minute rolling window per
cycle, comfortably overlapping the previous cycle's coverage). Not yet consumed by
any client UI -- that's `CHART-001`.

## Known limitations (this issue)

- **No live WebSocket feed yet.** Prices refresh every 10s via REST polling, candles
  every 60s -- matches the mission's "near real-time, refreshed every N seconds"
  degraded/free-tier mode, not its "live" shared-WS mode. `DATA-RECOVERY-001` adds
  the WS client this depends on.
- **No reconnect/backoff/stale-execution-gating.** A sustained Hyperliquid outage
  falls back to CoinGecko for display (correctly labeled) but nothing in this issue
  prevents a new paper order from using either source's price -- that gating is
  `PAPER-REALISM-001`'s `PaperPricingService`, layered on top.
- **Perpetuals only.** No spot-market ingestion (the mission only requires spot
  context "where the product explicitly simulates spot" -- it currently doesn't).
- **`getFundingRate`'s existing `type: 'fundingRate'` endpoint was left untouched.**
  Current research against Hyperliquid's own docs found no such endpoint documented
  (only `fundingHistory`, which this issue's `fetchFundingHistory` implements) --
  flagged here as a real discrepancy worth a future look, not fixed in this issue
  since that function has its own pre-existing passing tests and re-verifying it
  wasn't this issue's scope.
