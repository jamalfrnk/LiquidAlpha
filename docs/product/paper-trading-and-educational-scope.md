# Paper Trading & Educational Scope (DISCLOSURE-001, issue #40)

This is the single source of truth for what LiquidAlpha is, what it is
not, and the exact copy used across the product's disclosure surfaces
(`client/src/components/Disclosure.tsx`) and its methodology page
(`client/src/routes/MethodologyPage.tsx`). If either of those drifts from
this document, this document wins -- update the code to match it, not the
other way around.

## What this product is

An educational paper-trading simulator for Hyperliquid perpetuals. Every
price is real (sourced live from Hyperliquid, with an explicitly-labeled
CoinGecko fallback -- see `docs/architecture/market-data.md`). Every trade,
fill, fee, funding charge, and backtest result is simulated. **No real
money, no real orders, no real exchange, ever** -- this is a structural
property of the codebase (see `hyperliquid-real.ts`: it fetches public
market data only and never initializes a signed execution client), not
just a policy.

## What this product is not

- Not financial advice.
- Not a signal service claiming any indicator combination predicts
  future price movement.
- Not a broker, exchange, or custodian.
- Not a guarantee, projection, or promise of any trading outcome.

## Banned phrases

None of the following (or close paraphrases) may appear in user-facing
copy anywhere in the client: **guaranteed, safe profit, high-confidence
winner, best trade, cannot lose, proven return, buy now, sell now.**
Enforced by a repo-wide grep audit (`docs/product/paper-trading-and-educational-scope.md`'s
own banned-phrase list, checked in CI-adjacent review, not automated lint
today).

Preferred vocabulary instead:
- "Signal strength" (a heuristic agreement score), never "confidence" or
  "probability of winning" -- see `docs/product/signal-strength.md`.
- "Simulated fill" / "paper fill", never "executed" or "filled on
  Hyperliquid."
- "Backtest result" / "historical simulation," never "proven" or
  "verified profitable."
- Imperative trade language ("Buy now", "Sell now") is replaced with
  descriptive/neutral phrasing ("Submit a LONG order", "This signal
  suggests a SHORT setup") -- the product never tells a user what to do.

## Disclosure component

`<Disclosure variant="compact" | "detailed" context="primary" | "signals" | "backtesting" | "paper-fills" />`.

- **`compact`** -- a single line plus an icon (never color alone, per the
  mission's accessibility requirement), used as a persistent, low-visual-
  weight reminder. Appears in the app shell sidebar (visible on every
  authenticated page) and on the guest/wallet sign-in screen.
- **`detailed`** -- a fuller explanation with its own bordered card,
  placed near the specific surface it's contextualizing (the Signals page,
  the order ticket) rather than duplicated as one giant warning block
  repeated everywhere.

### Copy: `primary`

- Compact: "Paper trading only -- simulated fills, real market data, no
  real money."
- Detailed: "LiquidAlpha is an educational paper-trading simulator. Prices
  are sourced live from Hyperliquid; every trade, fill, and result is
  simulated. Nothing here is financial advice, and no path in this
  product can place a real order on any exchange."

### Copy: `signals`

- Compact: "Signal strength reflects indicator agreement, not a
  probability of winning."
- Detailed: "Signals are generated from real technical indicators
  (EMA, MACD, RSI, ADX, Fisher Transform, Keltner Channel), composed into
  a versioned, explainable 0-100 Signal strength score. This score
  measures how strongly the indicators agree with each other -- it is not
  a calibrated probability, a win-rate estimate, or investment advice.
  Past indicator agreement does not predict future price movement."

### Copy: `backtesting`

- Compact: "Backtest results are historical simulations, not a guarantee
  of future performance."
- Detailed: "Backtests replay historical Hyperliquid candles through this
  platform's real signal-generation logic, with documented, conservative
  assumptions about entry timing, slippage, fees, and funding (see
  `docs/product/backtesting-methodology.md`). A strategy's historical
  simulated performance is not a guarantee, promise, or reliable predictor
  of how it would perform going forward -- markets change, and this
  engine cannot account for conditions it hasn't seen."

### Copy: `paper-fills`

- Compact: "Simulated fill -- not a real exchange execution."
- Detailed: "Every paper fill is priced from a real Hyperliquid reference
  price, with documented simulated slippage and fees applied on top (see
  `docs/architecture/paper-execution.md`). No real order is ever sent to
  Hyperliquid or any other exchange."

## Methodology page

`client/src/routes/MethodologyPage.tsx`, linked from every `Disclosure`
component's "Learn more" link and from the app shell sidebar. Covers, in
order:

1. **Data sources** -- Hyperliquid primary, CoinGecko explicitly-labeled
   fallback; what "live" vs "degraded" vs "fallback" vs "unavailable"
   mean (`docs/architecture/market-data.md`).
2. **Signal calculation** -- which indicators, the trend+momentum gate,
   what `ruleAlignmentScore` and `RULE_VERSION` mean
   (`technical-analysis.ts`).
3. **Signal strength meaning** -- the six weighted components, why it's
   not a probability (`docs/product/signal-strength.md`).
4. **Backtesting assumptions** -- no-lookahead guarantee, entry/exit
   assumptions, sample-adequacy tiers (`docs/product/backtesting-methodology.md`).
5. **Paper-fill assumptions** -- fees, slippage, funding, liquidation
   estimate (`docs/architecture/paper-execution.md`).
6. **Limitations** -- perp-only (no spot), no reduce-only orders, no
   cross-margin portfolio simulation, single flat maintenance-margin
   assumption, single flat fee assumption.
7. **Data freshness behavior** -- the `live | degraded | fallback | unavailable`
   modes and what a user should expect to see in each.
8. **Versioning** -- `RULE_VERSION` (signal engine), `SCORE_MODEL_VERSION`
   (signal strength), `FILL_MODEL_VERSION` (paper fills),
   `BACKTEST_ENGINE_VERSION` (backtesting) -- every number the product
   shows is traceable to the exact model version that produced it.

## Placement checklist (acceptance criteria)

| Surface | Variant | Context |
|---|---|---|
| Guest onboarding / wallet sign-in (`ConnectScreen`) | detailed | primary |
| App shell sidebar (every authenticated page) | compact | primary |
| Signals page | detailed | signals |
| Order ticket (`OrderTicket`) | detailed | paper-fills |
| Positions, Analytics, Settings, Overview | compact | primary (via app shell; no per-page duplicate) |
| Backtesting results UI | detailed | backtesting |
| Exported reports | -- |

**Backtesting results UI and exported reports do not exist as client
surfaces yet** (`BACKTEST-001` explicitly scoped its results UI out, per
its own Accessibility Review section; no export/report feature exists
anywhere in this codebase). The `backtesting` disclosure copy is written
and ready in `Disclosure.tsx` for whichever issue builds that UI to wire
in -- there is nowhere to place it today without inventing UI beyond this
issue's scope.
