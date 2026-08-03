# Backtesting Methodology (BACKTEST-001, issue #38)

## What it is

A deterministic engine that replays the exact same signal-generation logic
production uses (`technical-analysis.ts`'s `evaluateSignal()`, unmodified)
against historical Hyperliquid candles, simulating what would have happened
if every fired signal had been traded with a fixed, documented set of
assumptions. Given the same candle data and config, it always produces the
same trades and the same summary -- verified directly against live
Hyperliquid data during implementation (two independent runs over the same
30-day BTC/1h range produced byte-identical summaries).

## What it is not

This is **not** a claim that the strategy is profitable, nor a prediction
of future performance. It answers one narrow question: "had these exact
rules been applied to this exact historical data, with these exact cost
assumptions, what would the trade-by-trade outcome have been?" Nothing here
is walk-forward optimized, and nothing here searches for the
best-performing parameters against the tested range -- doing so would make
the result meaningless (fit to noise, not signal). See `SIGNAL-SCORE-001`
for why "Signal strength" is never called a probability, either -- the same
discipline applies here to backtest results.

## The no-lookahead guarantee

This is the single most important correctness property of the engine, and
the one most backtesting engines get subtly wrong.

At the point the engine considers whether a signal fires at historical
candle index `i`, it calls `evaluateSignal()` with **only** the closes from
candle `0` through candle `i` -- exactly what would have been known the
moment candle `i` closed, and nothing from candle `i+1` onward. If a signal
fires, the resulting trade enters at candle `i+1`'s **open**, never at
candle `i`'s own close: you cannot know how a candle closed until it has
actually closed, and by the time you know that, the earliest a real order
could have been placed is against the next candle.

`server/src/backtest/engine.test.ts`'s `describe('no-lookahead guarantee', ...)`
proves this by construction, not just by inspection: two datasets are
built to be byte-identical up through a shared prefix and then diverge
wildly afterward (one moons, one crashes). The engine's entry decision
(whether a trade opens, its side, its entry time and price) is asserted
identical between the two runs, even though the trades' eventual
*resolution* legitimately differs -- proving the entry decision genuinely
depends only on the past, never the future.

## Documented assumptions

- **Entry fill**: the next candle's open after the signal fires, with
  configured slippage applied (`execution/slippage.ts`'s `applySlippage`,
  the same function paper trading uses).
- **At most one open position per symbol at a time.** Once a trade opens,
  no new signal is evaluated until it resolves -- mirroring
  `execution/paperEngine.ts`'s real behavior (a new opposite-direction
  order is rejected while a position is open), not a limitation invented
  just for backtesting.
- **Stop-loss / take-profit levels** are taken from `evaluateSignal`'s own
  ATR-based risk distance (computed at the signal candle) but re-anchored
  to the actual fill price -- the risk/reward *distance* is a property of
  volatility at signal time, but the price it protects is the price the
  trade actually entered at, not the signal candle's close.
- **Same-candle stop/target collision**: if a single candle's high/low
  range contains both levels, it resolves as the **stop-loss** -- the
  conservative assumption, since OHLC data alone cannot reveal which level
  price touched first intra-candle, and assuming the better outcome would
  introduce an optimistic bias.
- **Time-based exit**: a position still open after `maxHoldingCandles`
  closes at that final candle's close price.
- **A trade still open when the dataset itself runs out** (not enough
  remaining data to know whether the holding window would have elapsed, or
  whether stop/target would have hit first) is **excluded** from the
  results and counted in `skippedSignalCount` -- resolving it anyway would
  mean reporting an outcome the data doesn't actually support.
- **Fees**: a single round-trip charge (`feeBps` of notional), not charged
  separately at entry and exit.
- **Funding**: only applied when explicitly enabled, using Hyperliquid's
  real `fundingHistory` for the exact symbol and range; standard perp
  convention (positive funding rate paid by longs to shorts). Missing
  funding data for a given window is treated as zero cost, not an error.
- **Historical signals are always scored as "fresh."** Data staleness is a
  live-operational concern (is the feed lagging *right now*?) that has no
  meaning applied retroactively to a fixed historical dataset.
- **Missing-data (candle gap) handling**: a gap in the candle sequence
  within a trade's holding window doesn't exclude that trade -- it's
  flagged in `missingDataAffectedTradeCount` instead, since the available
  data (even with a gap) is still the best information there is, and
  dropping it arbitrarily would corrupt the aggregate statistics more than
  reporting the gap does.

## Config record

Every run stores exactly what it was run with: symbols, market type,
interval, date range, the signal-engine and score-model versions active at
run time, entry-fill assumption, slippage/fee/funding/leverage/risk-per-trade
settings, max holding duration, data source, and a `datasetVersion` hash
(a SHA-256 of every symbol's ordered `(openTime, close)` pairs) -- so a
run's exact input can always be distinguished from a superficially similar
one over the same nominal date range whose underlying data was later
revised.

## Sample-adequacy tiers (reused from DATA-015, not reinvented)

Identical thresholds to `analytics/metrics.ts`'s performance-metrics
tiering:

- **Insufficient** (< 10 trades): only `tradeCount` and the two
  run-diagnostic counters (`skippedSignalCount`,
  `missingDataAffectedTradeCount`) are reported. No performance claim at
  all below this line.
- **Preliminary** (10-29 trades): win rate, net P&L, average trade return,
  and average holding time are shown, explicitly labeled preliminary.
  Profit factor, max drawdown, expectancy, and every breakdown
  (long/short, by-asset, by-signal-strength) are withheld -- the same class
  of sample-size-sensitive figures DATA-015 withholds below its own
  30-trade line.
- **Full** (30+ trades): everything is reported.

"Expectancy" is computed directly as `netPnl / tradeCount` -- mathematically
identical to the textbook `winRate * avgWin - lossRate * avgLoss`
formulation, computed the more direct way so there is exactly one source of
truth for it. "Profit factor" is `grossProfit / grossLoss`, reported as
`null` (never `Infinity`) when there are zero losing trades.

## Resource bounds

Independent of whatever `SEC-HARDEN-001` layers on top as user-facing
rate/size limits, this engine enforces its own hard caps so it is not
unbounded-by-design: at most 3 symbols per run, and at most 10,000 candles
per symbol (`MAX_BACKTEST_SYMBOLS`, `MAX_BACKTEST_CANDLES_PER_SYMBOL` in
`schemas/backtest.ts`). A request that would exceed the candle cap is
rejected outright rather than silently truncated.

## Dependency on SIGNAL-SCORE-001

At the time this was implemented, `SIGNAL-SCORE-001` (the "Signal strength"
score model) was available, so every backtest run is graded by it --
`bySignalStrengthRange` in the summary buckets trades into `0-24`, `25-49`,
`50-74`, `75-100` strength ranges. `ruleAlignmentScore` (the older,
raw indicator-agreement count) is still recorded on every trade regardless,
since it's a cheaper, always-available metric independent of the score
model's own availability.

## What's out of scope for this issue

- **Results UI.** The engine, its API (`POST /api/backtests`,
  `GET /api/backtests`, `GET /api/backtests/:id`), and persistence are
  implemented and tested; a dedicated results-browsing UI is deliberately
  scoped separately (per this issue's own Accessibility Review section),
  to keep this change reviewable and focused on the correctness-critical
  simulation core.
- **Live-parameter optimization / walk-forward automation.** Explicitly a
  non-goal -- this engine answers "what would have happened," not "what
  parameters would have performed best," which would risk overfitting to
  the tested range.
- **Multi-strategy portfolio backtesting.** Each run simulates one set of
  rules across up to 3 symbols independently; no cross-symbol capital
  allocation or portfolio-level risk modeling exists yet.
- **Regime-based breakdowns.** Not implemented -- `bySignalStrengthRange`
  and `byAsset` are the only breakdowns beyond long/short.
