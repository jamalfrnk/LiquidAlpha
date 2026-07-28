# GitHub Repository Audit — `jamalfrnk/LiquidAlpha`

**Scope:** `server/` (the entire repository — there is no client). 17 files, all inspected directly (no sampling).
**Method:** Full manual read of every source file, `package.json`, `.env.example`, `tsconfig.json`, `drizzle.config.ts`, `.gitignore`, and `README.md`. No code executed.
**Status of this repo:** A minimal, honestly-documented skeleton. The README explicitly states the client doesn't exist yet and cites the platform overview PDF as its spec. This is **not** a smaller version of the Replit app — it is an independent, much-earlier-stage rewrite that only implements a slice of backend functionality, and part of what it does implement is broken or disconnected.

---

## Inventory

| File | Purpose | Status |
|---|---|---|
| `server/src/server.ts` | Express app, WS server, REST routes, 10s/30s background intervals | Working, minimal |
| `server/src/db/schema.ts` | Drizzle schema: `markets`, `signals`, `priceHistory`, `users`, `performance` | Working, no FKs/indexes |
| `server/src/db/index.ts` | DB client + `connectDb()` | Working |
| `server/src/db/seed.ts` | Inserts zero-value seed rows into `markets` | Working, standalone script |
| `server/src/auth.ts` | `register`/`login` via email+password, bcrypt, JWT | **Broken — see F-1** |
| `server/src/indicators.ts` | `ema`, `macd`, `rsi`, `atr` | Working, reasonable quality |
| `server/src/technical-analysis.ts` | `generateSignals()` — EMA/MACD/RSI confluence scoring | Working but produces a mislabeled "confidence" |
| `server/src/hyperliquid-real.ts` | Hyperliquid `/info` wrapper with Zod validation, retry/backoff, timeout | Working, best-quality file in the repo |
| `server/src/price-history.ts` | Insert/query `priceHistory`, defines `HISTORY_LIMIT = 256` | Working, but limit is never enforced (see F-7) |
| `server/src/performance.ts` | PnL record insert/query/aggregate | Working, unused by server.ts |
| `server/src/bootstrap.ts` | `wrapAsync`, global process error handlers | Working, good pattern |
| `server/package.json`, `tsconfig.json`, `drizzle.config.ts`, `.env.example` | Config | See F-8, F-9 |

No `client/`, `shared/`, `migrations/` (drizzle output directory), `tests/`, or CI config exist in this repo.

---

## Findings

### F-1 — Auth module references columns that don't exist in the schema; not wired into the server at all
**Severity:** Critical
**Confirmed**

`server/src/auth.ts` defines `register`/`login` around an `email`/`password` user model:
```ts
export interface User { id: string; email: string; password: string; createdAt: Date; }
...
const existing = await db.select().from(users).where(eq(users.email, email));
await db.insert(users).values({ email, password: hashed });
```
But `server/src/db/schema.ts` defines `users` as:
```ts
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  address: varchar('address', { length: 64 }).notNull(),
  builderCode: varchar('builder_code', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```
There is no `email` or `password` column. `auth.ts` would fail to compile against the real schema (Drizzle's typed query builder has no `users.email`/`users.password` fields) and is never imported by `server.ts` — no `/api/register` or `/api/login` route exists anywhere. It's dead, non-compiling code.

This also means the platform's documented **signature-based wallet authentication** is not implemented anywhere in this repo — the only auth code present is an unwired, broken password scheme that contradicts the wallet-first model implied by the `users.address`/`builderCode` columns actually in the schema.

**Impact:** No working authentication exists. Any endpoint that should be user-scoped currently has no way to identify a user at all.
**Fix:** Discard `auth.ts` as currently written. Design auth around the schema that's actually there (wallet address + signature), following the nonce/signature/JWT-cookie flow described in the assignment. This is new work, not a repair.
**Scope:** Large (new subsystem).
**Depends on:** Shared schemas/contracts work, session/cookie design.

### F-2 — JWT secret silently falls back to a hardcoded value
**Severity:** High
**Confirmed**

`server/src/auth.ts:12`:
```ts
const JWT_SECRET: string = process.env.JWT_SECRET || 'dev-secret';
```
If `JWT_SECRET` is unset, the server signs tokens with the public string `'dev-secret'` instead of refusing to start. Since this module isn't currently wired in, it isn't exploitable today, but the pattern must not carry into the rewrite.
**Impact:** If ever wired up unchanged, any deployment without `JWT_SECRET` set would sign forgeable tokens.
**Fix:** Validate required env vars at startup and exit non-zero if missing (the assignment's "fail safely when required secrets are absent" requirement). No default secret, ever.
**Scope:** Small.
**Depends on:** Environment validation module (part of migration step 3).

### F-3 — CORS is fully open
**Severity:** Medium
**Confirmed**

`server/src/server.ts:30`: `app.use(cors());` with no options — reflects any origin, credentials-friendly by default in recent `cors` versions if combined with credentials. There is no allowlist.
**Impact:** Any origin can call the API. Combined with cookie-based sessions (planned), this becomes a CSRF/data-exfiltration vector.
**Fix:** Explicit origin allowlist per environment (`CORS_ORIGIN` env var), `credentials: true` only paired with an allowlist, never `*`.
**Scope:** Small.
**Depends on:** Environment/config module.

### F-4 — WebSocket broadcasts to every connected client with no auth, subscriptions, or validation
**Severity:** Medium (High once execution/private data are added)
**Confirmed**

`server/src/server.ts:64-86`:
```ts
const clients = new Set<WebSocket>();
function broadcast(event: string, payload: unknown) {
  const message = JSON.stringify({ event, payload });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) { try { ws.send(message); } catch {} }
  }
}
wss.on('connection', (ws) => { clients.add(ws); ws.on('close', () => clients.delete(ws)); });
```
Every client receives every `marketUpdate` and `newSignal` event unconditionally. There's no connection auth, no per-symbol/per-user channel, no message-size limit, no heartbeat/sequence numbering beyond the `ws` library default.
**Impact:** Fine at 3 symbols and no private data. Becomes a real problem the moment per-user data (positions, private signals, execution status) needs to go over this same socket — there is currently no mechanism to keep it private.
**Fix:** Build the subscription/channel model called for in the assignment (symbol channels, private user channels gated by authenticated session) before adding any private payload to this socket.
**Scope:** Medium.
**Depends on:** Auth (F-1 fix) must exist first.

### F-5 — "Confidence" is an arbitrary heuristic score, not a calibrated probability
**Severity:** Medium
**Confirmed**

`server/src/technical-analysis.ts:70-75`:
```ts
let confidence = 60;
if ((bullish || bearish) && Math.abs(latestMacdHist) > 0) confidence += 10;
if (Math.abs(latestEma50 - latestEma200) / latestEma200 > 0.005) confidence += 10;
if (rsiBullish === bullish) confidence += 10;
if (confidence > 100) confidence = 100;
```
This is a base of 60 plus up to three +10 bumps for indicator agreement — functionally identical in spirit to the "six confirmations = 85%" pattern flagged in the assignment, just with different numbers. It is stored in the `signals.confidence` column and returned to clients as `confidence`, with no label distinguishing it from a real statistical probability.
**Impact:** Anything downstream (UI, docs, users) that reads `confidence` as "probability this trade wins" is being misled by construction — the number has no backtested relationship to actual win rate.
**Fix:** Rename the field/concept to something like `ruleAlignmentScore`, document it as a heuristic in the schema/API contract, and treat "calibrated probability" as a separate, currently-nonexistent metric that would require real backtesting to produce.
**Scope:** Small (rename + docs) now; large if calibration is ever attempted.
**Depends on:** Shared contracts/schema work.

### F-6 — Signal records don't preserve generation-time evidence
**Severity:** Medium
**Confirmed**

`signals` table (`schema.ts:20-27`) stores only `asset`, `signalType`, `confidence`, `active`, `createdAt`. None of the indicator values that produced the signal (EMA50/200, MACD histogram, RSI), no entry price, stop loss, take profit, timeframe, or data-quality flag are persisted.
**Impact:** A signal's reasoning can't be reconstructed later except by re-running current market data through the code — which the assignment explicitly warns against ("do not recompute old signal reasoning from current market data") since indicators would then reflect *today's* prices, not the prices that actually triggered the signal.
**Fix:** Extend the schema with an evidence payload (indicator values, entry/stop/target, timeframe, rule/model version) captured at insert time.
**Scope:** Medium.
**Depends on:** Signal engine rework (already needed for F-5).

### F-7 — Unbounded table growth; `HISTORY_LIMIT` is documented but never enforced
**Severity:** Low-Medium
**Confirmed**

`server/src/price-history.ts:11` defines `HISTORY_LIMIT = 256` and the comment on `addPricePoints` (`price-history.ts:27-28`) even says *"Older rows are not automatically purged; you can create a cron job..."* — i.e., the gap is self-documented but not implemented. `markets` gets a new row every 10 seconds forever (`server.ts:151-156`) with no retention policy either.
**Impact:** Both tables grow without bound. `getPriceHistory`/`getMarkets` queries do have a `.limit()`, so read paths aren't currently broken, but storage grows forever and full-table scans (e.g. the stats endpoint below) get slower over time.
**Fix:** Either a scheduled retention job or move to a proper time-series-oriented model (the assignment's `market_snapshots` entity) with retention built in from the start.
**Scope:** Small.
**Depends on:** None.

### F-8 — `/api/stats` loads entire tables into memory to compute a count
**Severity:** Low
**Confirmed**

`server/src/server.ts:239-249`:
```ts
const total = await db.select().from(signals);
const active = await db.select().from(signals).where(eq(signals.active, true));
res.json({ totalSignals: total.length, activeSignals: active.length });
```
Two full table scans transferred into Node just to count rows, on every request, with no cache.
**Impact:** Negligible today at near-zero row counts; becomes a real cost/latency issue as the table grows, since it re-fetches everything on every hit.
**Fix:** Use `count()`/`sql\`count(*)\`` aggregate queries; consider caching for a few seconds given this is a polling endpoint.
**Scope:** Small.
**Depends on:** None.

### F-9 — No tests, lint, or typecheck scripts; no CI
**Severity:** Medium
**Confirmed**

`server/package.json` scripts: `dev`, `build`, `start`, `migrate`, `generate`. No `test`, `lint`, or `typecheck` script exists, and there is no `.github/workflows/` directory anywhere in the repo.
**Impact:** Nothing currently prevents a regression from being merged to `main` — there's no automated gate at all.
**Fix:** This is exactly what `chore/ci-foundation` (the second planned branch) exists to fix.
**Scope:** Medium.
**Depends on:** None — can start immediately.

### F-10 — No foreign keys, no indexes anywhere in the schema
**Severity:** Medium
**Confirmed**

None of `signals.confidence`/`performance.userId`/`performance.signalId`/`priceHistory.symbol` etc. have `.references()` or explicit indexes in `schema.ts`. `performance.userId` and `performance.signalId` are plain `uuid('...').notNull()` with no FK to `users.id`/`signals.id`.
**Impact:** Orphaned performance/signal rows are possible with no DB-level protection; every `WHERE symbol = ...` / `WHERE user_id = ...` query (which is most of the read paths in this file) is a sequential scan once tables grow.
**Fix:** Add FKs with intentional `onDelete` behavior and indexes on the columns actually filtered on (`priceHistory.symbol`+`timestamp`, `performance.userId`, `signals.active`+`createdAt`).
**Scope:** Small-Medium.
**Depends on:** None — good candidate for an early schema-hardening PR.

### F-11 — Risk management is documented but not implemented; `atr()` exists and is never called
**Severity:** Low (accuracy-of-documentation issue, not a runtime bug)
**Confirmed**

The repo's own `README.md` claims: *"Risk management – attaches stop-loss and take-profit levels based on a simple ATR approximation and enforces a minimum 1:2 risk-reward ratio."* `indicators.ts` does implement `atr()` correctly, but `technical-analysis.ts`'s `generateSignals()` never imports or calls it, and no stop-loss/take-profit fields exist on the `signals` table to store the result even if it were called.
**Impact:** Anyone reading the README believes risk management exists; it doesn't yet.
**Fix:** Either wire ATR into signal generation and extend the schema (tie to F-6), or correct the README to describe the actual current state until it's built.
**Scope:** Medium.
**Depends on:** F-6 (schema needs stop-loss/take-profit columns first).

### F-12 — `drizzle-kit` pinned to a legacy major version with old CLI syntax
**Severity:** Low
**Confirmed**

`package.json`: `"drizzle-kit": "^0.13.3"`, scripts use `drizzle-kit push:pg` / `generate:pg` — this is the pre-1.0 command syntax. No `migrations/` or `drizzle/` output directory currently exists in the repo, meaning no migration has actually been generated yet despite the schema being defined.
**Impact:** Low today (nothing depends on it yet), but the CLI syntax will need to change if/when the dependency is upgraded, and there's currently no migration history to review or roll back.
**Fix:** Decide the target `drizzle-kit`/`drizzle-orm` version once during the CI-foundation step rather than drifting into it accidentally; generate the first real migration once schema changes from the audit land.
**Scope:** Small.
**Depends on:** Schema-hardening work (F-10, F-6).

---

## Not Yet Evaluated Here (depends on Replit-side findings)
- Whether `hyperliquid-real.ts`'s `{ type: 'fundingRate', coin }` request shape matches Hyperliquid's actual current `/info` API — **inferred, not confirmed**; needs verification against current Hyperliquid API docs before reuse, since Hyperliquid's public `info` endpoint types are `metaAndAssetCtxs`, `fundingHistory`, etc. rather than a literal `fundingRate` type as far as could be verified from this repo alone. Flagging as a correctness risk to check before porting this file as-is.
- Comparison against Replit's parallel implementations of the same concerns (auth, indicators, WS) — see `REPOSITORY_COMPARISON.md` once the Replit audit completes.

## What's Actually Good Here (worth keeping)
- `hyperliquid-real.ts`: real Zod validation on both request and response, exponential backoff with a retry cap, `AbortController` timeout. This is a better pattern than typical Replit-generated code and is a strong candidate to port near-as-is (pending the endpoint-shape check above).
- `bootstrap.ts`'s `wrapAsync` + global process error handlers: small, correct, worth keeping as the base pattern for the rewrite.
- `indicators.ts`: RSI uses correct Wilder smoothing. EMA's warm-up seeds from the first sample rather than an initial SMA of the first `period` values, which is a simplification worth revisiting for numerical accuracy, but not wrong for long lookbacks (210+ bars) — a low-priority accuracy note, not a defect worth blocking reuse.
