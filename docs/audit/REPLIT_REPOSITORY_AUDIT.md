# Replit Reference App Audit — `LiquidAlphaBot`

**Scope:** Full application extracted from Replit (`LiquidAlphaBot.zip`) — `client/` (162 files), `server/` (41 files + subfolders), `shared/schema.ts`, `migrations/`. 989 files total excluding `node_modules`/`.git`/`dist`.
**Method:** Automated deep-search agent (grep/read across the full tree) followed by manual verification of the single highest-impact claim (route shadowing, below) by directly reading `server/index.ts`, `server/app.ts`, `server/routes.ts`. Everything under "Critical" and "High" has direct file:line evidence; nothing here is a guess about intent.
**Role of this app in the migration:** Reference implementation only, per your instructions. It is **not** touched, committed, or pushed anywhere — it stays local. This document exists to decide, feature by feature, what's worth porting into the GitHub repo and what should be left behind.
**Headline finding:** This app runs two competing Express route registrars where the first one silently wins, which means several of its "real" endpoints — including the revenue/commission stats logic referenced in your own `LiquidAlpha Monetization.txt` — are dead code today, invisibly shadowed by mock/less-complete duplicates. Combined with unauthenticated position endpoints and a fake-data fallback in the price feed, the live app is currently both insecure and, in places, silently fabricating what it shows users.

---

## Critical Findings

### C-1 — Two competing route registrars; the less complete one wins silently
**Confirmed** (verified directly, not just by the research pass)

`server/index.ts` does this, in order:
```ts
import app from './app';                 // (A) app.ts's top-level code runs NOW, at import time
import { setupApiRoutes } from './routes';
...
await setupApiRoutes(app);                // (B) routes.ts registers its routes AFTER
```
Because `app.ts` is imported before `setupApiRoutes(app)` is ever called, every route `app.ts` defines at module scope is registered on the Express app **before** the same-path routes `routes.ts` registers inside `setupApiRoutes`. Express dispatches to the *first* matching handler; none of the `app.ts` handlers below call `next()` on success, so they fully own these paths and `routes.ts`'s versions never run:

| Path | `app.ts` (live, wins) | `routes.ts` (dead, shadowed) |
|---|---|---|
| `GET /api/stats` | `server/app.ts:249-272` — returns a **hardcoded all-zero `mockStats` object** (comment: *"Stats endpoint with mock data until getStats is implemented"*) | `server/routes.ts:510-542` — a real implementation that computes `todaySignals`, `successRate` from actual closed signals, and **the exact 10%-commission revenue calculation described in your own `LiquidAlpha Monetization.txt`** (`totalRevenue = closedSignals.reduce((sum, s) => sum + Math.max(0, parseFloat(s.profit ?? '0') * 0.1), 0)`, `routes.ts:529-532`) |
| `GET /api/positions` | `server/app.ts:289-301` — calls `storage.getOpenPositions()` with **no arguments at all** (returns every open position for every user, no filter option) | `server/routes.ts:545-553` — accepts an optional `builderCode` query filter (still no auth, see C-2, but at least has a filtering mechanism) |
| `GET /api/activities` | `server/app.ts:275-286` | `server/routes.ts:324+` |
| `GET /api/markets` | `server/app.ts:161-174` | `server/routes.ts:71+` |
| `GET /api/signals` | `server/app.ts:175-188` | `server/routes.ts:84+` |
| `GET /api/auth/me`, `POST /api/auth/logout` | `server/app.ts:135-160` (has `requireAuth`) | n/a — not redefined in routes.ts |

**Impact:** The stats endpoint every user actually hits returns fabricated all-zero numbers, permanently, regardless of real trading activity — this is not a hypothetical "unsupported claim," it is currently shipping fabricated data in place of real numbers that the code to compute correctly already exists and was written. The `/api/positions` path users actually hit is *more* dangerously permissive (no filter argument at all) than its shadowed sibling. Anyone auditing only `routes.ts` (the larger, more complete-looking file) would draw wrong conclusions about what the app actually does — including previous automated analyses like the monetization document, which describes the commission logic as live when it is not reachable.
**Fix:** This is not a "pick one" refactor decision — it's a bug. Before any porting decision, decide which file was meant to be canonical (`routes.ts` looks like the intended one given its completeness) and delete the other's duplicate registrations. In the rewrite, there should be exactly one route registrar per resource, enforced by having only one file import `express()` and construct the app.
**Scope:** Small to fix as a bug (delete the shadowing handlers); the underlying lesson (one router per resource) shapes the whole target architecture.
**Depends on:** None — this alone is worth calling out to you regardless of the migration, since it means the "10% commission" revenue model your own analysis described as implemented is currently inert in the running app.

### C-2 — Position endpoints have no authentication or ownership checks (IDOR + mass assignment)
**Confirmed**

Whichever handler is actually live (see C-1), neither version of these routes has any auth middleware or ownership check:
- `GET /api/positions` (`app.ts:289` and shadowed `routes.ts:545`) — returns positions with no `requireAuth`, no user-id filter; `routes.ts`'s version accepts an optional `builderCode` but doesn't require it or validate the caller owns that code.
- `GET /api/positions/:id` (`routes.ts:565-578`) — fetches any position by ID, no ownership check, no auth.
- `PATCH /api/positions/:id` (`routes.ts:580-594`) — takes `req.body` and passes it **directly** to `storage.updatePosition(id, updates)` with no field allowlist and no auth. Any caller who can guess/enumerate a position UUID can rewrite its price, PnL, or status fields.
- `POST /api/positions/:id/close` (`routes.ts:596+`) — accepts attacker-supplied `exitPrice`/`realizedPnl` in the body and closes any position by ID with those attacker-chosen values, no auth.
**Impact:** Full IDOR across all users' trading positions — read, write, and "close with a PnL you choose" are all possible today with an unauthenticated HTTP request and a guessable/enumerable UUID.
**Fix:** Every position route needs `requireAuth` plus a server-side ownership check (`position.userId === req.user.id`, not a client-suppliable `builderCode`), and `PATCH` must go through a narrow schema (e.g. only `stopLoss`/`takeProfit` client-editable fields), never raw `req.body`.
**Scope:** Medium.
**Depends on:** Working auth (F-1 equivalent from the GitHub audit) must exist first in the target architecture.

### C-3 — Hardcoded JWT secret fallbacks across four separate implementations
**Confirmed**

Four different files each hardcode a different default JWT secret literal if the env var is unset:
- `server/auth-system.ts:12` — `"dev_only_change_me"` (this is the **live**, mounted auth router)
- `server/auth.ts:12` — `'DEV_ONLY_REPLACE_ME'` (dead)
- `server/middleware/requireAuth.ts` — same pattern (live, used to gate protected routes)
- `server/replitAuth.ts:11` — `"dev_only_liquidalpha_secret_change_in_production"` (dead)
**Impact:** If `JWT_SECRET` is ever unset in a deployed environment, session tokens are signed with a string visible in source control — anyone can forge a valid session for any user. This is the live auth path, not a dead-code concern.
**Fix:** Fail startup if `JWT_SECRET` (or equivalent) is absent — never a literal fallback, anywhere, in any file. One secret validated once at boot.
**Scope:** Small.
**Depends on:** Environment validation module.

### C-4 — Silent fallback to fabricated market data, indistinguishable from real data
**Confirmed**

`server/coingecko.ts` — on any fetch failure, `generateRealisticMockData()` (lines 113-152) synthesizes prices with `Math.random()` and writes them into the same `markets` table used for real CoinGecko data, with no flag distinguishing real from synthetic rows.
**Impact:** Users, the signal engine, and anything reading from `markets` cannot tell a real price from a fabricated one during a CoinGecko outage. A trading signal generated during an outage would be based on fake prices with no indication of that fact.
**Fix:** On fetch failure, mark the data as stale/unavailable explicitly (a `dataQuality` field) rather than substituting synthetic values; surface a "data feed degraded" state to the UI instead of silently continuing.
**Scope:** Medium.
**Depends on:** Market-data ingestion rework (assignment step 7).

### C-5 — Fabricated risk/performance metrics presented as real analytics
**Confirmed**

`server/routes.ts:435-436` (inside a route that, per C-1, may itself be shadowed — but the pattern matters regardless of which file wins):
```ts
maxDrawdown: Math.round(Math.random() * 15 * 10) / 10, // Mock drawdown
sharpeRatio: Math.round((Math.random() * 2 + 0.5) * 100) / 100, // Mock Sharpe ratio
```
Plus `server/routes.ts:1276-1296` — `/api/hyperliquid/order` unconditionally returns a hardcoded `mockOrder`, comment: *"Currently returns a mock response for safety."*
**Impact:** This is precisely the category of thing your assignment guardrails forbid — a Sharpe ratio and max drawdown with **zero relationship to real trade data**, generated fresh on every request via `Math.random()`. If this were ever seen by a user, it would be a fabricated performance claim.
**Fix:** Remove entirely; return "insufficient data" until a real, evidence-backed calculation exists (which requires actual closed-trade history — not present yet in any meaningful volume).
**Scope:** Small (delete) now; large if real backtested/live performance metrics are built later.
**Depends on:** Real position/fill history at volume — likely not worth building until paper-trading has run for a while.

### C-6 — Migration history is out of sync with the live schema, including a real column-name bug
**Confirmed**

- The tracked Drizzle journal (`migrations/meta/_journal.json`) only knows about 2 migrations. Two more `.sql` files exist outside that journal (`20250814_add_chain_to_users.sql`, `20250814_add_createdAt_to_positions.sql`), written in a manual `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` style, not drizzle-generated.
- **Concrete bug:** `migrations/20250814_add_createdAt_to_positions.sql` adds a quoted camelCase column `"createdAt"`, but `shared/schema.ts:91` maps the Drizzle field to snake_case `created_at` — **two different physical Postgres columns**. Whichever one the manual migration created is never read by the ORM.
- `migrations/meta/0001_snapshot.json` (last tracked schema state) is missing columns that `shared/schema.ts` defines and `server/storage.ts`/`routes.ts` actively read/write today (e.g. `users.address`/`chain`/`builderCode`, and ~12 fields on `configurations` including `walletAddress`/`ownerUserId`/`visibility`).
**Impact:** Running `drizzle-kit migrate` from the committed migration files today would **not** reproduce the schema the app actually depends on. The real schema was evolved via `drizzle-kit push` directly against the database, bypassing migration files — meaning there is no reliable, reproducible schema history, and at least one column exists twice under different names with only one half actually wired up.
**Fix:** Generate a fresh baseline migration from the *actual* current schema (introspect the real DB, not the stale migration files) before any further schema changes; adopt migration-file-based changes going forward, never raw `db:push` against anything beyond local dev.
**Scope:** Medium.
**Depends on:** None — should happen early, before any new schema work in the target repo.

---

## High Findings

### H-1 — Unauthenticated Hyperliquid order-placement endpoints, safe today only by accident
**Confirmed**

`server/routes.ts:794-931` (`POST /api/hyperliquid/orders/place`, `/orders/cancel`, `/orders/market`, `/leverage`) have **no `requireAuth`** and pass user-supplied order fields straight to `realHyperliquidService.placeOrder(...)`. It's not exploitable today only because `RealHyperliquidService`'s `this.sdk` is initialized to `null` and never assigned a real client anywhere in the codebase (`hyperliquid-real.ts:177,631`) — the code even documents *why* (`hyperliquid-real.ts:215-217`: "We never initialize SDK with private keys for security... All trading operations must be signed client-side via wallet"). That's a real design intent, but it isn't enforced by the route itself — the safety is incidental to an uninitialized variable, not a deliberate gate on the endpoint.
**Impact:** If a future change instantiates a real signed Hyperliquid client inside `initialize()` (exactly the kind of change someone "finishing a TODO" would make), these four endpoints become live, unauthenticated order placement/cancellation/leverage-change with no further review of the routes themselves required.
**Fix:** Add `requireAuth` and full risk-check gating to these routes regardless of current SDK state — never rely on an accidental null-check as a safety boundary. This is exactly the "execution adapter confirms the correct environment" + "authorization chain" requirement in the assignment.
**Scope:** Medium.
**Depends on:** Real execution architecture (assignment steps 11-12).

### H-2 — No server-side leverage/position-size caps, no kill switch, no idempotency
**Confirmed**

- `client/src/lib/trade-validation.ts:5-26` defines real leverage/size/tick limits (`MAX_LEVERAGE` per asset, `MIN_NOTIONAL`, etc.) but they're **only enforced client-side** (`validatePreTrade()`).
- `server/routes/execution.ts:11-19`'s Zod schema only checks `leverage: z.number().positive().optional()` — no upper bound — so a direct API call bypassing the UI can submit any leverage value.
- No kill switch, daily-loss limit, or circuit breaker exists anywhere in `server/` (confirmed via targeted search).
- No idempotency key or duplicate-submission guard on any order endpoint — a client retry after a timeout would create a second order in the sim ledger with no dedupe.
**Impact:** All the safety limits described in your platform overview exist only as client-side UX guardrails today, meaning they're purely cosmetic against anyone calling the API directly.
**Fix:** Re-implement every limit server-side as the actual authority; client-side copies are UX only. Add idempotency keys to all mutating trade endpoints.
**Scope:** Medium-Large.
**Depends on:** Risk-validation module (assignment step 11), which doesn't exist as a separate concern yet — validation is currently scattered client-side only.

### H-3 — The "confirmations = flat confidence" pattern named in your assignment is real, just in dead code
**Confirmed**

`server/technical-analysis.ts:432-448` (**not currently imported/executed anywhere** — see Duplication section):
```ts
if (longCondition) {
  signalType = 'LONG';
  confidence = 85; // High confidence due to multiple confirmations
  ...
}
```
`longCondition`/`shortCondition` AND together 8 separate boolean confirmations (trend, MACD, volume, candlestick pattern, RSI-neutral, Fisher Transform, ADX, Keltner breakout) — but however many of the 8 actually align, confidence is a flat, hardcoded `85`, not a function of how many conditions matched.

The engine that's actually live, `server/technical-analysis-simple.ts:125-178`, is better but still a heuristic, not a calibrated probability: additive score (base `40` + `20` + `15`, capped at `75`) with a `confidence < 55` cutoff.
**Impact:** The exact pattern your assignment flagged as a risk exists verbatim in the codebase — it's just not the code path currently running. If anyone "upgrades" the live simple engine by pulling in the more sophisticated-looking dead file (candlestick patterns, Fisher Transform, ADX are legitimately more advanced techniques), they'd also inherit the flat-85 mislabeling bug unless it's fixed first.
**Fix:** Neither file should be ported as-is. The advanced-indicator ideas in the dead file (Fisher Transform, ADX, Keltner) are worth reusing; the flat-85 confidence assignment is not. Rebuild confidence as a documented, additive "rule alignment score" (not "confidence"/"probability") regardless of which indicator set is used.
**Scope:** Medium.
**Depends on:** Signal engine rework.

### H-4 — WebSocket channel is functionally decorative; real-time is actually done via redundant polling
**Confirmed**

- `server/websocket.ts:55-63` broadcasts to **every connected client unconditionally** — no subscriptions.
- The intended "real" broadcast loop, `server/market-updates.ts`, is **never started** — `server/index.ts:8,32` have it commented out.
- What runs instead by default is `server/websocket-sim.ts` — broadcasts **randomized fake price ticks** (`Math.random()`-perturbed around hardcoded base prices) every 2-5 seconds to all clients, gated by a feature flag that defaults to **on** (`lib/feature-flags.ts`).
- The client's WS handler, `hooks/use-websocket.tsx:23-30`, receives these messages and only `console.log`s them — confirmed at the point of use in `pages/dashboard.tsx:50-53`, which does nothing with `lastMessage` except log it. **No cache invalidation, no state update.**
- Meanwhile, at least 12 separate components independently poll overlapping data via `useQuery({ refetchInterval: ... })` at intervals from 2s to 30s (`useCgMarkets.ts`, `use-hyperliquid.tsx`, `use-execution.tsx`, `useAccount.ts`, `useOrders.ts`, `usePositions.ts`, `data-service-status.tsx`, `live-price-ticker.tsx`, `orders-panel.tsx`, `positions-panel.tsx`, `trade-ticket.tsx`, `hyperliquid-connection.tsx`, `signal-execution.tsx`).
**Impact:** This is simultaneously three separate problems the assignment asked to find: (1) WS broadcasting to all clients with no subscription model, (2) polling that duplicates what a working WS connection would provide, running redundantly because the WS one is non-functional for state purposes, and (3) fake data (sim ticks) flowing through a channel that looks real. Net effect: the "live" market feel of the dashboard comes entirely from a dozen independent polling intervals, not from the WebSocket infrastructure that exists in the codebase.
**Fix:** Either wire the WS messages into the query cache (`queryClient.setQueryData`) and drop the redundant polling, or — better, given the target architecture — rebuild the subscription model per the assignment (symbol/channel/user-private subscriptions) and make polling explicitly fallback-only.
**Scope:** Large — this is core to objective #6 (WebSocket subscription architecture, assignment step 9).
**Depends on:** None to start; foundational for the market-data domain.

### H-5 — CSP is broad enough to be close to meaningless
**Confirmed**

`server/app.ts:28-49` hand-rolls a CSP header (the separate, unused `server/csp.ts` module is more conservative and dead):
- `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https:;` — the bare `https:` wildcard permits script loading from any HTTPS origin; `'unsafe-eval'` defeats a major XSS mitigation.
- `connect-src 'self' wss: ws: https: ...` — wildcard `https:`/`ws:`/`wss:` permits fetch/XHR/WebSocket to any host, which defeats CSP's main value against data exfiltration via injected scripts.
**Impact:** In the event of any XSS (even a minor one), this CSP would not meaningfully contain it — scripts can load from anywhere and exfiltrate to anywhere.
**Fix:** Build an explicit allowlist (Hyperliquid API host, WalletConnect/Reown relay hosts, your own API origin) instead of wildcards; drop `'unsafe-eval'` (check whether any dependency genuinely requires it — if so, it needs isolating, not CSP-wide exemption).
**Scope:** Small-Medium (mostly enumerating the real hosts needed).
**Depends on:** Full inventory of third-party hosts the client actually talks to.

### H-6 — Config endpoint mass-assignment + internal debug info leaked to clients
**Confirmed**

`server/routes.ts:230-297` (`PATCH /api/config/:address`) spreads raw `req.body` into `storage.updateConfiguration(...)` with no field allowlist — lets a caller overwrite `ownerUserId`/`visibility`/`walletAddress` via the same call meant only for trading preferences. The same handler's 403 responses (`routes.ts:188-197, 274-283`) include a `debug` object with `userId`, `configOwner`, `visibility`, `addressProvided`, `configAddress` in the response body sent to the client.
**Impact:** Ownership of a configuration record can potentially be reassigned by a caller who shouldn't be able to; internal state is disclosed in error responses that should be diagnosable server-side only.
**Fix:** Explicit Zod schema for the PATCH body limited to actually-user-editable fields; strip `debug` from any client-facing error response, log it server-side instead.
**Scope:** Small.
**Depends on:** None.

### H-7 — `routes/sim.ts` has no auth at all; identity is a spoofable header
**Confirmed**

`server/routes/sim.ts:9-12` derives the paper-trading "user" from `req.headers['x-forwarded-for']`, falling back to the literal string `'anon'` — trivially spoofable, and every unauthenticated caller who doesn't set the header shares one `'anon'` paper account. Contrast with the sibling `server/routes/execution.ts`, which does use `requireAuth`.
**Impact:** Two parallel simulated-trading systems exist (see Duplication) with inconsistent auth — one real, one effectively anonymous and shared.
**Fix:** Either delete this router in favor of `routes/execution.ts`, or bring it up to the same auth standard if its slippage/limit-fill logic (which is more sophisticated, see Duplication) is worth keeping.
**Scope:** Small (likely a deletion + logic-merge, not new auth work).
**Depends on:** Decision on which sim engine to keep (see Duplication section).

---

## Duplication and Dead Code

This is the largest category by file count and the clearest evidence that "audit before rewrite" was the right call — a blind copy of this repo would have propagated all of it.

| Concern | Live | Dead | Notes |
|---|---|---|---|
| Hyperliquid client | `hyperliquid-real.ts`, `hyperliquid-simple.ts` | `hyperliquid.ts` (429 lines, zero imports) | `hyperliquid-real.ts` is the best-quality of the three but never actually connects a real SDK instance (H-1). |
| Signal engine | `technical-analysis-simple.ts` | `technical-analysis.ts` (575 lines, zero imports) | Dead file has more advanced indicators (Fisher Transform, ADX, Keltner) worth salvaging; live file's confidence math is more honest but still a heuristic (H-3). |
| Auth | `auth-system.ts` (mounted), `middleware/requireAuth.ts` (mounted) | `auth.ts`, `replitAuth.ts` (zero imports each) | 4 separate JWT secret literals across all four (C-3). |
| Sim trading engine | `execution/sim-adapter.ts` (used by `/api/execution`), `execution/simAdapter-new.ts` (used by `/api/sim`) | `execution/simAdapter.ts` (zero imports) | The two *live* ones materially diverge: `simAdapter-new.ts` has a slippage model and limit-order fills that `sim-adapter.ts` lacks entirely (limit orders never fill in the class-based engine). This is two genuinely different paper-trading fidelities running side by side, not just copy-paste. |
| CSP config | Hand-rolled block in `app.ts:28-49` (live, broader/riskier) | `csp.ts` (helmet-based, more conservative, zero imports) | The *better* version is the dead one (H-5). |
| Vite config | `vite.config.ts` | `vite.config.ts.backup`, `vite.config.ts.complex` (byte-identical to each other) | Safe to delete both. |
| Client wallet-connect UI | `header.tsx` → `ConnectWalletButton` → `usePhantomAuth.ts` | `wallet-connect.tsx`, `wallet-connect-modal.tsx`, `wallet-connect-new.tsx`, `mobile-wallet-connect.tsx`, `wallet-connect-debug.tsx` (5 files, zero imports each) | |
| Client auth hooks | (current hooks) | `use-wallet-auth-old.tsx`, `use-websocket-old.tsx`, `quick-actions-old.tsx` | Self-explanatory `-old` naming, confirmed unused. |
| Client query client | `utils/queryClient.ts` (mounted in `appkit.tsx:38` — staleTime 15s, retry 2, no auth header) **and** `lib/queryClient.ts` (supplies `apiRequest`/`getQueryFn` used by most feature hooks — staleTime 30s, retry 1, injects `Authorization: Bearer` from localStorage) | — both are **live simultaneously**, not one dead | This is worse than dead-code duplication: two independently configured caching/auth policies are active at once, which is a real inconsistency bug, not just clutter. |
| Client auth-utils | — | `lib/auth-utils.ts`, `lib/authUtils.ts` (both zero imports) | |
| Client routing | `wouter` (actually used for route definitions) | `react-router-dom`'s `BrowserRouter` wraps the app (`main.tsx:5`) and `ProtectedRoute.tsx` (zero imports) | Two routing libraries mounted at once; the one route *guard* component that exists is dead — confirms there is no active client-side route protection (`App.tsx:38` comment: *"Dashboard is the default homescreen - no wallet connection barrier"*). Server-side auth is the real boundary regardless, but this UX gap should be closed too. |
| Dependencies | — | `passport`, `passport-local`, `openid-client`, `express-session`, `connect-pg-simple`, `memorystore` — 6 packages, confirmed zero imports anywhere in `server/` | Pure leftover from an abandoned Replit-OIDC auth path; pure dependency-surface bloat, worth dropping regardless of migration. |

### Mock/TODO/hardcoded-fallback grep highlights
- `server/execution/hyperliquid-adapter.ts` — every method throws `'...not yet implemented'` (6 methods).
- `client/src/lib/hyperliquid.ts` — the entire file is an explicit mock (docstring says so).
- `client/src/lib/walletconnect.ts:121` — hardcoded demo address `0x742d35Cc6631C0532925a3b8D432B29dA2e8c3e5`.
- `server/routes/notifications.ts:6` — entirely hardcoded in-memory notification arrays, no DB.
- **Five different hardcoded fallback price sets** across `hyperliquid-real.ts`, `execution/sim-adapter.ts` (BTC 43000/ETH 2500/SOL 100), `websocket-sim.ts` (BTC 45000/ETH 2500/SOL 100), `routes/sim.ts` (BTC 45000...), `coingecko.ts` (BTC 120000/ETH 4500/SOL 200) — no single source of truth for "what's the current price if the feed is down."

---

## Frontend Quality Signals
- Largest components mixing fetch + business logic + rendering in one file: `risk-management-tools.tsx` (820 lines), `advanced-portfolio-analytics.tsx` (701), `notification-center.tsx` (689, also does its own WS handling), `onboarding-flow.tsx` (581), `mobile-trading-interface.tsx` (547, contains its own separate `Math.random()` fake price-change mock).
- No shared "real-time data" abstraction — a dozen components each reinvent their own `refetchInterval`.
- Two `QueryClient` configurations active simultaneously (see Duplication table) — a real correctness/consistency bug, not just mess.

## Money/Decimal Handling
`shared/schema.ts` correctly uses Drizzle `decimal(18,8)` for all price/PnL/quantity columns (**confirmed good**). The gap is one layer up: `server/execution/adapter-types.ts`/`types.ts` type `size`, `price`, `leverage`, `equity`, `marginUsed`, `unrealizedPnl` as plain `number`, and both sim adapters do PnL math in floating point. Acceptable for sim-only use today; would need to change before any real-money execution path.

## LLM Usage
**None found.** No AI SDK dependency, no calls to OpenAI/Anthropic/any LLM API anywhere in `server/` or `client/src/`. The stray `ERROR_ANALYSIS_GPT5.md` at repo root is a leftover filename from a prior Replit AI debugging session, not code. Nothing in this app is subject to the LLM-cost/caching requirements in the assignment — that's greenfield work if/when explanation-generation features are added.

## Dependencies and Scripts
- No test script or test framework dependency exists anywhere (`package.json` has no `test`, no `jest`/`vitest`/`mocha`/`@testing-library/*`).
- No lint script/config.
- `"check": "tsc"` is the only static check, typecheck-only.
- `db:push` (not migration files) is the actual schema-deployment method used, consistent with the C-6 migration-drift finding.
- Six unused Replit-OIDC-era dependencies (see Duplication table) — safe to drop.

---

## What's Actually Good Here (worth porting, with changes)
- `hyperliquid-real.ts`'s request/response validation pattern (Zod) and the demo-mode intent (never holding private keys server-side) — the *design intent* is right, it just needs the endpoint wired safely with auth from day one instead of relying on an uninitialized variable.
- `simAdapter-new.ts`'s slippage model and limit-order fill sweep — better simulation fidelity than its sibling, worth keeping over `sim-adapter.ts`.
- The dead `technical-analysis.ts`'s additional indicators (Fisher Transform, ADX, Keltner Channel) — legitimate techniques worth reintroducing, minus the flat-confidence bug.
- `auth-system.ts`'s core nonce/signature flow (crypto-random nonce, single-use deletion, ethers/tweetnacl verification, correct cookie flags) — solid foundation, needs a TTL added to nonces and SIWE-style domain binding, but is not a rewrite-from-scratch.
- `shared/schema.ts`'s consistent use of `decimal` for money columns.
- `lib/cache.ts` (TTL cache + single-flight dedupe) — a reasonable pattern worth keeping for the target's caching layer.
