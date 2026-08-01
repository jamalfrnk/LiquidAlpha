# Current-State Architecture — 2026-07-31

This documents what is actually implemented and wired together as of `origin/main`
(PR #17 merged), verified by reading route registration and directory structure directly
rather than inferring from `TARGET_ARCHITECTURE.md` (which is the *target*, written
2026-07-28 before most of the build-out below existed) or the README (stale — still says
"a client folder is not included in this repository").

## Runtime shape

Two independently deployed/built Node packages, no shared root workspace:

```
LiquidAlpha-github/
├── server/   Express 4 + ws, Drizzle ORM/PostgreSQL, Zod validation, vitest
└── client/   Vite 6 + React 18, TanStack Query, Radix/shadcn, Tailwind, wouter
```

## Deployment (`DEPLOY-001`, issue #30)

Two distinct modes, both driven by `server/src/server.ts`:

- **Development** (`npm run dev` in both packages, `NODE_ENV` unset): unchanged
  split-origin setup -- Vite serves the client on `:5173`, the API/WS server
  listens on `PORT` (default `3001`) for HTTP and a separate `WS_PORT`
  (default `8080`) for WebSocket upgrades. `CORS_ORIGIN` allows the client's
  dev origin to call the API cross-origin with credentials.
- **Production** (`NODE_ENV=production node dist/server.js`, after
  `npm run build` in both packages): single origin. The server serves
  `client/dist` as static files (hashed assets cached immutable, `index.html`
  no-cache), falls back unmatched non-`/api` GETs to `index.html` for SPA
  client-side routing, and the WebSocket server attaches to the same
  `http.Server` instance instead of opening its own port -- one public
  `PORT`, bound to `0.0.0.0`. Verified locally: root/API/SPA-fallback/404
  shapes, cache headers, and a real WS upgrade all confirmed working on the
  shared port; dev mode's split-origin behavior re-verified unaffected.

Replit-specific config/runbook is `REPLIT-READY-001`'s scope, built on top of
this.

## Server (`server/src/server.ts` entrypoint)

Middleware chain: CORS (explicit allow-list) → `express.json()` → `cookie-parser` →
`/api` rate limiter (`express-rate-limit`) → domain routers.

Mounted routers:
- `/api/auth` → `auth/router.ts` — wallet-signature auth (nonce issue/verify, session
  cookie, revocation), per migration step 5.
- `/api/risk` → `risk/` — limits and kill-switch domain (PR #13's own title says "not yet
  wired to execution" at the time it landed; **confirmed wired as of `origin/main`** —
  `execution/paperEngine.ts` calls `isGloballyHalted`/`isUserHalted` (kill switch),
  `getOrCreateRiskLimits`, and `evaluateTrade` before accepting an order, and rejects the
  order with the failure reason if the check fails. PR #14 completed the wiring PR #13
  left open.).
- `/api/execution` → `execution/` — paper-trading orders/positions with idempotency
  (`(user_id, idempotency_key)` unique constraint) and risk gating (PR #14).

Inline (not yet router-extracted) endpoints on `server.ts` directly:
- `GET /api/markets`, `GET /api/market-data/health` — market-data ingestion + staleness
  (`market-data/` module, PR #9).
- `GET /api/websocket/metrics` — connection/subscription observability for the WS layer
  (`websocket/` module, PR #11 — real per-channel/per-symbol subscriptions, not global
  broadcast).
- `GET /api/signals` (paginated, Zod-validated query), `POST /api/signals/generate`
  (Zod-validated body) — evidence-preserving signal engine (PR #12).
- `GET /api/stats`, `GET /api/funding/:symbol` (Zod-validated params).

Cross-cutting: `middleware/requireAuth.ts`, `middleware/rateLimit.ts`,
`config/env.ts` (boot-time env validation, PR #5), `schemas/` (shared Zod contracts,
PR #6), `db/schema.ts` (Drizzle schema, hardened FKs/indexes/enums, PR #8).

## Client (`client/src/`)

- `app/App.tsx`, `app/AppShell.tsx`, `app/ConnectScreen.tsx` — auth-gated shell and
  wallet-connect entry (PR #15). `AppShell` is responsive as of `UI-RESP-001`
  (issue #29): the sidebar renders inline at `lg:` (1024px) and above, and
  collapses into an off-canvas drawer (`app/MobileNavDrawer.tsx`, built on
  `@radix-ui/react-dialog` for focus-trap/Escape/focus-restoration) below it.
  Verified at 390/768/1024/1440px with no horizontal overflow.
- `routes/` — `OverviewPage`, `SignalsPage`, `PositionsPage`, `AnalyticsPage`,
  `SettingsPage` (+ `nav.ts` for route/nav config). `AnalyticsPage` (PR for
  `feat/analytics-integrity`, migration step 15) and `SettingsPage`'s risk-limits form
  (PR #25) were the two client surfaces still outstanding as of earlier revisions of
  this doc -- both now exist.
- `features/{auth,execution,markets,positions,realtime,risk,settings,signals}/` —
  feature-scoped hooks and logic (the pattern the migration plan explicitly modeled on
  Replit's `features/trade`/`features/markets` shape, minus the duplication issues
  found there).
- `features/realtime/` — WebSocket cache wiring into TanStack Query (PR #16), the
  mechanism by which live market/signal updates reach the UI without a second polling
  path.
- `components/ui/` — Radix + `class-variance-authority`/`tailwind-merge` design-system
  primitives (shadcn-style), reused across features rather than each feature owning its
  own controls.

## What is NOT yet true (do not assume otherwise)

**Update (2026-07-31):** the items originally listed here as gaps — observability, a
security test suite, and analytics integrity — were closed by PR #26 (`OBS-016`), PR #24
(`SEC-017`), and `feat/analytics-integrity` (`DATA-015`), each landed after this doc was
first written. Current gaps, re-verified as of this update:

- No client test framework — CI's client job explicitly skips a test step today.
- No lint configuration in either package — CI explicitly warns and skips.
- `server/src/performance.ts` is dead code, kept in place rather than deleted (nothing
  imports it; superseded by `server/src/analytics/`, which reads real closed trades from
  `positions` rather than the disconnected `performance` table this file used).

Now true (previously listed here as gaps, since resolved):
- Observability: structured logs, request IDs, `/api/health`/`/api/ready`,
  `/api/observability/metrics`, a WS connection-status indicator, and an error boundary
  all landed in PR #26 — see `docs/observability/strategy.md` and `signals.md`.
- Analytics integrity: `GET /api/analytics/performance` computes real, tiered metrics
  from closed paper trades only (never synthetic data) — see
  `server/src/schemas/analytics.ts` for the sample-size-tier contract, decided directly
  with the repo owner rather than invented.
- Security test suite: nonce replay/expiry, cross-user ownership (orders/positions), and
  rate-limit enforcement are regression-tested — see PR #24 and
  `docs/security/SECURITY_BASELINE.md`'s "Security Test Suite" section.
- (Risk-to-execution wiring was checked directly in `paperEngine.ts` and confirmed live
  — see above. Not a gap.)

## Diagram

```mermaid
flowchart LR
  subgraph Client [client/ - Vite/React]
    Shell[AppShell / ConnectScreen]
    Routes[Overview / Signals / Positions / Settings]
    RT[features/realtime - WS cache wiring]
    Shell --> Routes
    RT --> Routes
  end

  subgraph Server [server/ - Express]
    Auth[/api/auth/]
    Risk[/api/risk/]
    Exec[/api/execution/]
    Markets[/api/markets, /api/market-data/health/]
    Signals[/api/signals, /api/signals/generate/]
    WS[WebSocket - per-channel/per-symbol subs]
  end

  DB[(PostgreSQL via Drizzle)]
  HL[Hyperliquid API]
  CG[CoinGecko]

  Routes -- REST --> Auth
  Routes -- REST --> Risk
  Routes -- REST --> Exec
  Routes -- REST --> Markets
  Routes -- REST --> Signals
  RT -- WS --> WS

  Auth --> DB
  Risk --> DB
  Exec --> DB
  Signals --> DB
  Markets --> HL
  Markets --> CG
  WS --> Markets
  WS --> Signals
```

Plain-language: the client never talks to Postgres, Hyperliquid, or CoinGecko directly —
everything routes through the Express API or the WebSocket layer, which is itself fed by
the market-data and signals modules. Auth, risk, and execution are separate routers so
that authorization and risk gating happen server-side before any order write, not as a
client-side check.
