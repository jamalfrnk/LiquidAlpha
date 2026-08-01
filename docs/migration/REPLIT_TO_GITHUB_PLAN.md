# Replit → GitHub Migration Plan

Prioritized backlog, ordered per the assignment's implementation sequence, informed by what the audits actually found. Each item lists: what it is, why it's at this position, source material (if any), and rough scope. Each becomes its own small PR — never one large migration PR.

> **Status reconciliation (2026-07-31):** [`docs/engineering/repository-audit.md`](../engineering/repository-audit.md) cross-references every step below against actual merged PRs in one table. Steps 1–14, 16, and 17 are done. Step 15 (analytics integrity) is blocked pending a product decision (see its entry below and issue [#19](https://github.com/jamalfrnk/LiquidAlpha/issues/19)) -- not fabricated as done to make this list look complete. Step 18 (this one) is done as of this PR (`docs/reconciliation-pass`).

## Sequence

### 1. Repository audits — `audit/repository-assessment` (this PR)
`GITHUB_REPOSITORY_AUDIT.md`, `REPLIT_REPOSITORY_AUDIT.md`, `REPOSITORY_COMPARISON.md`, `TARGET_ARCHITECTURE.md`, this file, `SECURITY_BASELINE.md`. Done as of this PR.

### 2. TypeScript/lint/test stabilization + CI foundation — `chore/ci-foundation`
Neither repo has lint config, test framework, or CI. Set up: ESLint, Prettier, Vitest (or Jest), GitHub Actions (`ci.yml`, `codeql.yml`, `dependabot.yml`), branch protection recommendations doc. This is pure scaffolding — no product code depends on it, so it can land immediately after the audit PR with no blocking dependency. **Scope: Medium.**

### 3. Environment and configuration validation — `chore/env-validation`
Fixes GH F-2 and Replit C-3 (hardcoded JWT secret fallbacks in 4 files) in one stroke: a single config-loading module that validates all required env vars at boot and exits non-zero if any are missing. No default secrets anywhere, ever. **Scope: Small. Depends on: CI foundation (so the check can run in CI too).**

### 4. Shared schemas and API contracts — `feat/shared-contracts`
Zod schemas for every request/response shape, shared between client and server (`shared/schemas/`, `shared/contracts/`). This is what makes runtime validation possible everywhere the assignment asks for it (route bodies, WS messages). Start from GitHub's `hyperliquid-real.ts` Zod pattern — it's the best example already in either repo. **Scope: Medium. Depends on: nothing blocking, but should land before auth/DB work below since those will want to use these schemas.**

### 5. Authentication and authorization corrections — `security/auth-hardening`
Rebuild wallet auth starting from Replit's `auth-system.ts` (refactor, not port): add nonce TTL + expiry check (currently missing — single-use deletion exists but no timestamp check, per Replit's security findings), add SIWE-style domain binding to the signed message, centralize the JWT secret through the env-validation module from step 3, add `requireAuth` + real ownership checks to every private route (directly fixes Replit C-2's unauthenticated position endpoints and H-1's unauthenticated order endpoints). **Scope: Large. Depends on: steps 3 and 4.**

### 6. Database ownership and lifecycle corrections — `refactor/schema-hardening`
- Resolve the `builderCode`-as-identity conflation (see `TARGET_ARCHITECTURE.md`): split into `users.id` (identity), `users.builder_code` (attribution label only), user-scoped preference/limit tables.
- Replace the three generic `status` text columns (Replit's `signals`, `activities`, `positions`) with proper Postgres enums + constrained transitions per the state machines in `TARGET_ARCHITECTURE.md`.
- Add the missing FKs and indexes flagged in both audits (GH F-10; Replit's schema has FKs on `positions.signalId` already but is missing others).
- Regenerate a clean migration baseline — the current Replit migration files don't reproduce the live schema and contain a real column-name bug (`createdAt` vs `created_at`, Replit C-6). Don't build on top of that drift; snapshot the real current schema and start migration history over, documented as a deliberate reset with the old files kept for historical reference only.
**Scope: Large. Depends on: step 4 (contracts should reflect the new schema).**

### 7. Market-data ingestion and normalization — `feat/market-data-ingestion`
Build from GitHub's simpler CoinGecko polling loop (no fake-data fallback to inherit, unlike Replit's `coingecko.ts` — C-4) plus GitHub's `hyperliquid-real.ts` pattern for the exchange side. Add the data-quality/staleness tagging neither repo has today. Verify the Hyperliquid `/info` request shapes (e.g. the `fundingRate` type used in GitHub's wrapper) against current Hyperliquid API docs before relying on them — flagged as unverified in the GitHub audit. **Scope: Medium. Depends on: step 4.**

### 8. API and token-efficiency improvements — `perf/api-efficiency`
Pagination, field selection, request timeouts/aborts, retry+backoff (GitHub's `hyperliquid-real.ts` already has a good pattern to generalize), per-user/IP rate limits (missing everywhere in both repos), idempotency keys on mutating endpoints (missing everywhere — flagged in Replit H-2). Fix the `/api/stats` full-table-scan-to-count pattern (GH F-8) as a concrete example while building the general pattern. **Scope: Medium. Depends on: step 5 (rate limits need to know who the caller is).**

### 9. WebSocket subscription architecture — `feat/websocket-subscriptions`
Greenfield — neither repo has a real subscription model (GH F-4, Replit H-4). Design symbol/channel/user-private subscriptions, auth-before-private-subscribe, heartbeats, sequence numbers, reconnection/resubscription. Explicitly do not repeat Replit's pattern of a WS channel that's pushed but never consumed into application state — wire messages directly into the query cache or equivalent client-side store. **Scope: Large. Depends on: step 5 (private channels need auth).**

### 10. Signal-engine correctness — `refactor/signal-engine`
Port GitHub's clean indicator base (`ema`/`macd`/`rsi`/`atr`), selectively add the Fisher Transform/ADX/Keltner math from Replit's dead `technical-analysis.ts` (math only — not its flat-85 confidence assignment). Rebuild confidence as an explicitly-labeled, versioned "rule alignment score" per `TARGET_ARCHITECTURE.md` — never call it "confidence" or "probability" without calibration evidence (GH F-5, Replit H-3). Add evidence snapshotting to signal records at generation time (GH F-6). **Scope: Large. Depends on: steps 4, 6.**

### 11. Risk-engine separation — `feat/risk-engine`
Entirely new — real server-side leverage/position/exposure limits and a kill switch don't exist in either repo (Replit's limits are client-side only, `trade-validation.ts`, unenforced server-side — H-2). Build as its own domain (`server/risk/`), called by both the signal-publication path and the execution path, never bypassable by a direct API call. **Scope: Large. Depends on: step 6.**

### 12. Paper-trading execution workflow — `feat/paper-trading`
Base on Replit's `simAdapter-new.ts` (better fidelity — has slippage + limit-order fills, unlike its sibling `sim-adapter.ts`), but rebuilt behind auth + the new risk engine + idempotency keys, none of which gate it today. Explicit paper/testnet/production mode switch, defaulting to paper (assignment's non-negotiable guardrail) — nothing in either repo currently prevents live trading from being one uncommented line away (Replit H-1: `wallet-signing.ts` has the real calls commented out, not gated by config). **Scope: Large. Depends on: steps 5, 11.**

### 13. UI information architecture — `feat/client-shell`
New client from scratch (none exists in GitHub). Use Replit's `features/trade`/`features/markets` hook-per-endpoint pattern as the model to extend — not its older flat `hooks/`/`components/` structure, not its 5 dead wallet-connect variants, not its dual `QueryClient` setup (pick one config). Navigation: Overview / Signals / Positions / Analytics / Activity / Settings, per the assignment — only including sections with real implemented functionality behind them. **Scope: Large. Depends on: step 5 (auth) at minimum to build the shell around.**

### 14. Signal and execution UX — `feat/signal-execution-ux`
Signal cards distinguishing new/expired/triggered/cancelled/invalidated states (from the step-6 state machine), execution confirmation screen showing every field the assignment lists (market, direction, size, leverage, stop/target, fees, max loss, environment, auto-trade status). **Depends on: steps 10, 11, 12, 13.**
**Status (2026-07-31): done, 3 of 3 client PRs** (`feat/signals-ux` PR #16, `feat/positions-ux` PR #17, `feat/settings-risk-limits` PR #25 -- [#18](https://github.com/jamalfrnk/LiquidAlpha/issues/18) / `UI-014C`).

### 15. Analytics integrity — `feat/analytics-integrity`
Every metric shown must state its definition, source, date range, sample size, and whether it's backtest/paper/live (assignment requirement). This directly replaces Replit's `Math.random()`-generated Sharpe ratio/max drawdown (C-5) with "insufficient data" states until real closed-trade history exists in volume. **Depends on: step 12 generating real paper-trade history to eventually report on.**
**Status: not started.** Tracked as [#19](https://github.com/jamalfrnk/LiquidAlpha/issues/19) (`DATA-015`).

### 16. Observability — `feat/observability`
Structured logging, request IDs, health checks distinguishing process/DB/market-data/WS/execution-provider health (assignment requirement) — none of this exists in either repo today. **Depends on: most of the above being in place to have something worth observing.**
**Status (2026-07-31): done** — see `docs/observability/strategy.md` and `docs/observability/signals.md` for what's instrumented, `docs/operations/runbook.md` for how to use it. Tracked as [#20](https://github.com/jamalfrnk/LiquidAlpha/issues/20) (`OBS-016`).

### 17. Security tests — `test/security-suite`
Nonce replay, expired-nonce rejection, cross-user resource access (regression test for Replit C-2 specifically), CSRF, oversized WS payloads, rate-limit enforcement. **Depends on: steps 5, 9, 11.**
**Status (2026-07-31): done**, scoped down from the original CSRF/oversized-payload list per [#21](https://github.com/jamalfrnk/LiquidAlpha/issues/21) (`SEC-017`) — see `docs/security/SECURITY_BASELINE.md`'s "Security Test Suite" section for exactly what's covered and what was deliberately left out with rationale.

### 18. Documentation and cleanup
Final pass — update all docs to match what was actually built (not what was planned), known-limitations doc, remaining tech debt doc.
**Status (2026-07-31): done** — root `README.md` rewritten to describe the actual current repo; the four pre-migration audit/target docs got a historical-record note pointing to current-state docs (not rewritten or deleted); known tech debt documented in `README.md`'s "Known gaps" section. Tracked as [#22](https://github.com/jamalfrnk/LiquidAlpha/issues/22) (`DOC-018`).

## Reusable Replit components (summary — see `REPOSITORY_COMPARISON.md` for full detail)
`auth-system.ts`'s nonce/signature core, `hyperliquid-real.ts`'s validation/retry pattern, `simAdapter-new.ts`'s slippage/fill model, the dead `technical-analysis.ts`'s Fisher/ADX/Keltner math, `lib/cache.ts`'s TTL+single-flight pattern, the `features/trade`/`features/markets` hook shape.

## Replit code to reject outright
The two-registrar route-shadowing pattern (C-1), silent fake-data fallbacks (C-4), fabricated Sharpe/drawdown metrics (C-5), all dead auth/hyperliquid/technical-analysis/sim-adapter duplicates, the 6 unused Replit-OIDC dependencies, dual `QueryClient` configs, 5 dead wallet-connect component variants, generic `status` text columns for distinct lifecycles.
