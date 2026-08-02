# Paper Execution Realism (PAPER-REALISM-001, issue #39)

## What it is

`execution/paperEngine.ts` already enforced real risk limits (kill switch,
position/leverage/loss limits) before this issue -- what it lacked was a
documented, provenance-tracked fill-pricing model: simulated fees, funding,
a liquidation-price estimate, and a record of exactly what priced every
fill and how. This issue closes that gap without touching the risk-gating
logic itself (`checkTrustworthySource`, kill switches, position/leverage
limits are all unchanged).

## What it is not

**Every number here is simulated.** This platform has no path to a real
order, exchange, or wallet signature -- `fills.simulated` is `true` on
every row, recorded explicitly in the data itself, not just implied by
this being the only execution path that exists. UI copy describing these
numbers as "simulated using Hyperliquid market data and documented
paper-fill assumptions" is `DISCLOSURE-001`'s scope, not duplicated here.

## Instrument scope: perp only

This platform has no spot-market ingestion (`DATA-HL-001`'s scope
explicitly stopped at perp). `fills.marketType` and `positions`' implicit
market type are always `'perp'` today -- the field exists for
forward-compatibility, not because spot is actually modeled. "Reduce-only"
order behavior is not represented anywhere in this codebase's order model
(`schemas/execution.ts` has no such flag), so it is out of scope here too,
per the issue's own "where represented" qualifier.

## Fill provenance

Every fill now records:

- `priceSource` / `sourceTimestamp` -- which market snapshot priced it and
  when that snapshot was last updated (Hyperliquid or CoinGecko-fallback,
  matching `DATA-HL-001`/`DATA-RECOVERY-001`'s existing source labeling).
- `fillModelVersion` -- `execution/fillModel.ts`'s `FILL_MODEL_VERSION`,
  versioned the same way `technical-analysis.ts`'s `RULE_VERSION` and
  `signals/signalScore.ts`'s `SCORE_MODEL_VERSION` already are.
- `referencePrice` -- the market price before slippage.
- `slippageAmount` -- `|fillPrice - referencePrice|`, using the existing
  `applySlippage` function (unchanged).
- `feeAmount` -- see Fees below.
- `marketType`, `simulated` -- see above.

These six fields are **nullable**, not required: fills recorded before
this feature shipped never had this provenance computed, and backfilling
a synthetic value for them would fabricate evidence that doesn't exist --
the same reasoning `signals.signal_score` follows for `SIGNAL-SCORE-001`.
Every fill recorded from this point forward always populates all of them.

## Fees

A flat, documented taker-fee assumption (`DEFAULT_FEE_BPS`, 5bps of
notional), charged once at entry and once at exit -- not Hyperliquid's
real tiered, volume-dependent fee schedule. `positions.feesPaid` is a
running total (the entry fee at open, plus each fee from any subsequent
same-direction fill that adds to the position), settled into
`realizedPnl` when the position closes (including the exit fee, added at
that point).

## Funding

Real Hyperliquid funding rates, fetched via `fetchFundingHistory` (the
documented `fundingHistory` endpoint) -- **not** `getFundingRate`
(`type: 'fundingRate'`), which was verified directly against live
Hyperliquid mainnet during implementation to currently return a real
HTTP 422. That endpoint's brokenness had been flagged but left unfixed by
an earlier issue's audit as out of scope to re-verify; building this
issue's real, recurring cost calculation on top of it would have meant
funding silently never accruing in practice. `fetchFundingHistory` was
independently verified working (`fetchFundingHistory('BTC', ...)` returns
real, recent entries).

A periodic accrual (`accruePaperFunding`, run every 5 minutes from
`server.ts`) charges each open position the most recent real funding rate
for its asset, pro-rated by elapsed wall-clock time relative to
Hyperliquid's real hourly funding interval (`FUNDING_INTERVAL_MS`) -- not
a fixed per-cycle charge regardless of how long the position was actually
open. A position is never charged more than once within
`FUNDING_MIN_ACCRUAL_INTERVAL_MS` (5 minutes), and is simply skipped (not
charged a fabricated rate) if no funding entry is available in the lookback
window. `positions.fundingPaid` is a running total, settled into
`realizedPnl` at close, same as fees.

Standard perp convention: a positive funding rate is paid by longs to
shorts (`computeFundingCost` in `fillModel.ts`).

## Liquidation estimate

`estimateLiquidationPrice(entryPrice, leverage, side)`:

```
LONG:  entryPrice * (1 - 1/leverage + MAINTENANCE_MARGIN_RATIO)
SHORT: entryPrice * (1 + 1/leverage - MAINTENANCE_MARGIN_RATIO)
```

`MAINTENANCE_MARGIN_RATIO` (0.5%) is a single flat ratio applied uniformly
across every asset -- a deliberate simplification of Hyperliquid's real
per-asset, tiered maintenance-margin schedule. Named and stored as an
**estimate** for exactly this reason, and because it also ignores funding
accrued so far and any cross-margin balance, both of which a real
liquidation price depends on. Recomputed whenever a position's leverage or
entry price changes (a subsequent same-direction fill), using the same
quantity-weighted averaging `entryPrice` already uses.

## What's out of scope

- **Spot instrument modeling** -- no spot ingestion exists (`DATA-HL-001`).
- **Reduce-only orders** -- not represented anywhere in this codebase's
  order model.
- **Cross-margin portfolio simulation** -- explicitly a non-goal; each
  position's liquidation estimate and funding are computed independently.
- **A synthetic exit fill row on `closePosition`** -- closing a position
  updates the position directly (fee/funding subtracted into
  `realizedPnl`) without creating a new row in `fills`, matching this
  codebase's existing structural pattern (`closePosition` never created a
  fill before this issue either).
