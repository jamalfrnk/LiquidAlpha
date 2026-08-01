# Signal Strength (SIGNAL-SCORE-001, issue #37)

## What it is

Every generated trading signal now carries a **Signal strength** score: a
deterministic, versioned 0-100 number, a direction (`LONG`/`SHORT`/`NEUTRAL`),
and a full breakdown of the evidence behind it. It is computed by
`server/src/signals/signalScore.ts`'s `computeSignalScore()` from the same
indicators `technical-analysis.ts` already computes (EMA50/200, MACD, RSI,
ADX, Fisher Transform, Keltner Channel, ATR) -- it does not introduce any new
indicator.

## What it is not

**"Signal strength" is not a probability, a confidence level, or an expected
return.** It is an agreement-based heuristic: how strongly the available
technical indicators agree with each other and with the direction of the
underlying trend. Nothing in this repository has ever backtested a
relationship between this score and actual trade outcomes -- see
`BACKTEST-001` for the (separate, not-yet-implemented) empirical evidence
that would be needed to make any calibration claim. This is the same
reasoning that renamed `confidence` to `ruleAlignmentScore` in the underlying
signal engine (`GITHUB_REPOSITORY_AUDIT.md` finding F-5); this score model
follows the identical rule. **Never label it "confidence", "probability", or
"expected return" anywhere in the UI or API.**

## The six components and their weights

| Component | Weight | What it measures |
|---|---|---|
| Trend agreement | 25 | Magnitude of the EMA50/EMA200 separation -- the primary directional thesis every other component either confirms or undermines. |
| Momentum agreement | 20 | Magnitude of the MACD histogram (as a % of price), only scored when its sign agrees with the trend. |
| Trend-strength confirmation | 15 | ADX relative to the existing 25-point trend-strength threshold. |
| Volatility suitability | 15 | How far price has broken out of its Keltner Channel in the signal's direction. |
| Data freshness | 15 | How old the underlying price data is, relative to the 30s staleness threshold the rest of the platform already uses. |
| Indicator availability | 10 | What fraction of the nine tracked indicator values were actually available (not still warming up) this cycle. |

Weights sum to exactly 100, so full agreement across every component yields
a total of exactly 100.

**Why these weights, in this order:** trend and momentum are weighted
highest because they are the two gates `evaluateSignal()` itself already
requires to agree before any signal fires at all -- everything else is a
secondary confirmation of trade quality. Trend-strength and volatility
suitability are weighted equally since neither is more fundamental than the
other. Data freshness is weighted on par with them deliberately: a
mathematically perfect score computed from stale data is operationally
worthless, so freshness is not treated as a minor footnote. Indicator
availability is weighted lowest because a single missing minor indicator
shouldn't crater an otherwise well-supported score, but should still
meaningfully reduce it.

Every price-relative component (trend agreement, momentum agreement,
volatility suitability) is normalized against the same 0.5% reference band
`technical-analysis.ts` already uses as its own "strong enough to count as a
confirmation" threshold (`EMA_SEPARATION_THRESHOLD`) -- one shared,
already-justified constant, not a separate arbitrary number invented per
component.

## Conflict and invalidation handling

- **Conflict** -- EMA trend and MACD momentum disagree (or the trend can't
  be determined because EMA data is unavailable): direction is `NEUTRAL` and
  the total score is forced to exactly **0**. There is no coherent
  directional thesis to score the strength of, mirroring `evaluateSignal()`'s
  own choice to return no signal at all in this case.
- **Invalidation** -- a secondary warning sign on an otherwise-coherent
  directional read: RSI or Fisher Transform pointing the opposite way, or
  price already breaking through the Keltner band against the thesis.
  Unlike a conflict, the directional call itself hasn't reversed -- only
  weakened -- so the score is capped at **15** rather than zeroed, and every
  triggered condition is listed in plain language.

## What's exposed

`totalScore`, `direction`, `componentScores` (the six above),
`indicatorsUsed`/`indicatorsMissing`, `freshnessStatus` (`fresh`/`stale`),
`conflictingConditions`, `invalidationConditions`,
`signalEngineVersion` (mirrors `technical-analysis.ts`'s `RULE_VERSION`),
`scoreModelVersion` (this model's own `SCORE_MODEL_VERSION`), `candleInterval`
(always `null` -- this dataset is tick-level price history, not fixed-interval
candles, matching `technical-analysis.ts`'s own honest `dataQuality`/
`barCount` naming rather than fabricating a "1h" label the data doesn't have),
`sourceDataFrom`/`sourceDataTo`, and a plain-language `explanation`.

The contract lives in `server/src/schemas/signalScore.ts` (Zod, server-side
source of truth) and is mirrored on the client in
`client/src/features/signals/types.ts`, following the same
manually-mirrored-interface convention already used for every other
server/client shared shape in this repo (no shared package exists between
them).

## UI

`client/src/features/signals/SignalStrength.tsx` renders the score on every
`SignalCard`: a "Strong"/"Moderate"/"Weak"/"None" label alongside the numeric
score and a progress bar -- the text label exists specifically so the score
is never communicated by color alone (an explicit mission accessibility
requirement for score displays). A native `<details>`/`<summary>` disclosure
holds the full component breakdown, missing-indicator list, and explanation
text, without adding a new tooltip dependency to the project.

## Versioning and stability

`computeSignalScore()` is a pure, DB-free function (no `Date.now()` or other
hidden state) -- identical input always produces an identical result,
verified by `server/src/signals/signalScore.test.ts`'s dedicated
version-stability test. Changing the weighting, the normalization band, or
the conflict/invalidation rules in the future must bump
`SCORE_MODEL_VERSION`, exactly as `technical-analysis.ts`'s `RULE_VERSION`
already works for the underlying rule engine -- so a historical signal's
score can always be traced back to the exact model that produced it.

## Historical data

`signals.signal_score` is a nullable jsonb column. Signals generated before
this feature shipped genuinely never had a score computed for them --
backfilling a synthetic value for those rows would be fabricating evidence
that was never actually produced, so they are left `null` rather than
retroactively scored. Every signal generated from this point forward always
gets a real one.
