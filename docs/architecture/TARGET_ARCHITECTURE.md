# Target Architecture

> **Historical record, dated 2026-07-28** — this is the *target* shape written before
> the migration began, not a description of what has actually been built since. 16 PRs
> have landed against this target; some details here (e.g. exact state-machine field
> names) may have evolved during implementation. For what's actually implemented today,
> see [`docs/architecture/current-state.md`](current-state.md) — read this file as the
> original design rationale, not current fact.

This adapts the assignment's proposed structure to what the audits actually found — it is not a mechanical copy of a generic template. Rationale for each deviation is called out inline.

## Domain pipeline

```text
Market Data (CoinGecko + Hyperliquid)
    ↓
Normalized Market Events (single shape, tagged with a data-quality status — Replit C-4 showed why this matters: never let synthetic/fallback data look identical to real data)
    ↓
Indicator and Feature Engine (pure functions — GitHub's indicators.ts is the right starting shape; extend with Fisher Transform/ADX/Keltron concepts salvaged from Replit's dead technical-analysis.ts)
    ↓
Signal Decision Engine (produces a documented "rule alignment score", never called "confidence"/"probability" unless it's actually calibrated — GH F-5 / Replit H-3)
    ↓
Risk Validation (server-side authority for leverage/position/exposure limits — currently only exists client-side in Replit, nowhere in GitHub — Replit H-2)
    ↓
Signal Publication (evidence-preserving: snapshot the indicator values, entry/stop/target, timeframe at generation time — GH F-6)
    ↓
Optional User-Authorized Execution (paper by default; real execution gated behind auth + risk + idempotency — Replit H-1)
    ↓
Order, Fill, Position, and Performance Tracking (owned per-user, auditable, no fabricated metrics — Replit C-5)
```

## Repository layout

```text
client/
  app/              # app shell, providers (ONE QueryClient — Replit ran two simultaneously, H-4/Duplication)
  components/       # presentation-only, kept small; large 500-800 line components in Replit (risk-management-tools.tsx etc.) are the anti-pattern to avoid
  features/         # the unit of organization — see below
  hooks/
  layouts/
  lib/              # api client, formatting, one auth-token strategy (not two, per Replit's dual queryClient bug)
  routes/            # wouter only — Replit mounted both wouter and react-router-dom simultaneously; pick one
  styles/

server/
  api/              # thin route handlers only: validate input, call a service, shape output. No two files may register the same Express app (Replit C-1 is the cautionary tale)
  auth/             # nonce issuance/verification, session issuance, cookie handling — built from Replit's auth-system.ts pattern (refactored: nonce TTL, domain binding, single JWT-secret source with fail-closed startup validation)
  config/           # environment loading + validation, fails fast on missing required vars (GH F-2 / Replit C-3)
  database/         # Drizzle schema, migrations (regenerated from a real baseline — Replit C-6), repositories
  execution/        # adapters behind an interface (sim / paper / hyperliquid), auth + risk-gated regardless of adapter (Replit H-1)
  market-data/       # ingestion, normalization, data-quality tagging, caching
  notifications/    # real adapters behind an interface; Replit's version was 100% mock, nothing to inherit
  observability/    # structured logging, health checks, request IDs
  risk/             # server-side limits, kill switches — net-new, doesn't exist meaningfully in either source repo
  signals/          # indicator engine, decision engine, evidence snapshotting
  websocket/        # subscription model (symbol/channel/user-private) — net-new; neither source repo has one

shared/
  contracts/        # request/response shapes shared by client+server
  schemas/          # Zod schemas for runtime validation at every API boundary
  types/
  constants/
```

## Frontend feature areas
Following Replit's better-patterned `features/trade`/`features/markets` (React-Query-hook-per-endpoint), not its older flat `hooks/`+`components/` pile:
```text
features/
  authentication/
  markets/
  signals/
  portfolio/
  positions/
  execution/
  analytics/
  activity/
  settings/
```

## Why this deviates from a generic template
- **`risk/` is its own top-level server domain**, not folded into `signals/` or `execution/`, because both audits found risk enforcement completely absent server-side (client-only in Replit, missing entirely in GitHub) — it needs to be a hard boundary every signal and every order passes through, not a helper function either domain calls optionally.
- **`websocket/` is a first-class domain, not a thin wrapper**, because both repos' WS layers turned out to be the least-developed part of the system (global broadcast, no subscriptions; in Replit's case, actively decorative — H-4). This needs real design, not a quick port.
- **No dependency-injection framework** — the assignment explicitly warns against ceremonial layers, and nothing found in either repo justifies one. Plain constructor-passed adapters (as `hyperliquid-real.ts` already does reasonably well) are sufficient.
- **One Express app, one router tree** — non-negotiable given Replit C-1. The target's `server/api/` must have a single entry point that mounts every route exactly once.

## State machines (from the assignment, informed by findings)

**Signals** — replacing the generic reused `status` text column found in all three lifecycle tables in Replit (`signals`, `activities`, `positions` — Replit schema inventory):
```text
DRAFT → PUBLISHED → ACTIVE → TRIGGERED → EXPIRED
                          ↘ CANCELLED
                          ↘ INVALIDATED
```

**Orders** (net new — no real order lifecycle exists in either source repo today):
```text
PENDING_CONFIRMATION → SUBMITTED → ACKNOWLEDGED → PARTIALLY_FILLED → FILLED
                                              ↘ CANCEL_PENDING → CANCELLED
                                              ↘ REJECTED
                                              ↘ FAILED
```
Each as a Postgres enum with a `CHECK`-constrained transition table validated in the risk/execution service layer, not left as a free-text column.

## `builderCode` as primary key — resolved
Both repos conflate three concerns in `builderCode`: user identity, referral attribution, and per-user trading configuration. The target schema separates these explicitly:
- `users.id` (uuid) — identity, from wallet-address auth.
- `users.builder_code` (unique, nullable) — a referral/attribution label only, never used as a join key for ownership.
- `user_signal_preferences` / `risk_limits` tables — keyed by `user_id`, not `builder_code`.

This directly fixes the ownership ambiguity the assignment asked to investigate: today, anything keyed by `builderCode` (Replit's `configurations`, `positions`, `signals` all carry a `builderCode` column) has no guaranteed 1:1 relationship to a specific authenticated user, which is part of why the position endpoints in Replit have no real ownership check to enforce (Replit C-2) — there's no unambiguous foreign key to check against.
