# LiquidAlpha

LiquidAlpha is a real-time, **paper-trading** signal dashboard and API for the
Hyperliquid blockchain ecosystem: wallet-signature auth, live market data, technical-
indicator-driven signals, a server-enforced risk engine, and a simulated execution
workflow, all fronted by a React client.

> This repository is being rebuilt from a Replit-era reference app onto a clean GitHub
> foundation, tracked in [`docs/migration/REPLIT_TO_GITHUB_PLAN.md`](docs/migration/REPLIT_TO_GITHUB_PLAN.md).
> See [`docs/architecture/current-state.md`](docs/architecture/current-state.md) for the
> authoritative description of what's actually implemented, verified by reading the code
> directly rather than inferred from this file or older docs.

## Repository structure

Two independently built/tested npm packages, no root workspace:

```
LiquidAlpha/
├── server/    Node 22 + Express 4 + ws, PostgreSQL via Drizzle ORM, Zod validation, vitest
│   └── src/
│       ├── auth/            wallet-signature auth (nonce/verify/session)
│       ├── risk/             risk limits, kill switch, trade evaluation
│       ├── execution/        paper-trading orders/positions
│       ├── market-data/      CoinGecko ingestion, staleness tracking
│       ├── websocket/        per-channel/per-symbol subscriptions
│       ├── observability/    structured logging, request IDs, metrics, readiness
│       ├── middleware/       auth guard, rate limiting, request validation
│       ├── schemas/          shared Zod request/response contracts
│       └── db/               Drizzle schema + migrations
└── client/    Vite 6 + React 18, TanStack Query, Radix/shadcn-style UI, Tailwind, wouter
    └── src/
        ├── app/               auth-gated shell, wallet connect, error boundary
        ├── routes/            Overview / Signals / Positions / Settings
        └── features/          auth, markets, signals, positions, execution, risk,
                                 settings, realtime -- one directory per domain
```

`docs/` contains the fuller picture: `docs/architecture/` (current state + original target
architecture), `docs/audit/` (point-in-time audits from before the migration started --
see the historical-record note at the top of each), `docs/security/`, `docs/observability/`,
`docs/operations/`, and `docs/migration/REPLIT_TO_GITHUB_PLAN.md` (the sequenced backlog
this rebuild follows).

## Running it locally

Both packages need `npm install` and are started separately.

```bash
# Server
cd server
cp .env.example .env    # fill in DATABASE_URL and JWT_SECRET at minimum
npm install
npm run dev              # tsx watch src/server.ts -- http://localhost:3001, ws://localhost:8080

# Client (separate terminal)
cd client
npm install
npm run dev               # vite -- http://localhost:5173
```

The server needs a real PostgreSQL instance (`DATABASE_URL`) and a `JWT_SECRET` of at
least 32 characters -- both fail startup with a clear error if missing rather than
falling back to a default. See `server/.env.example` for the full list of environment
variables and their defaults.

### Scripts

| Package | Script | What it does |
|---|---|---|
| `server` | `npm run dev` | `tsx watch src/server.ts` |
| `server` | `npm run build` | `tsc` (typecheck + compile to `dist/`) |
| `server` | `npm start` | Runs the compiled server from `dist/` |
| `server` | `npm test` | `vitest run` |
| `server` | `npm run generate` / `npm run migrate` | Drizzle-kit migration generate/push |
| `client` | `npm run dev` | `vite` |
| `client` | `npm run build` | `tsc --noEmit && vite build` |
| `client` | `npm run typecheck` | `tsc --noEmit` |
| `client` | `npm run preview` | `vite preview` |

Neither package has a `lint` script configured yet (see "Known gaps" below) --
`.github/workflows/quality-gate.yml` already detects this and skips the step with a
warning rather than failing.

## API overview

All endpoints are namespaced under `/api`. Request bodies/params/queries are validated
with Zod at every boundary (`server/src/schemas/`); private routes require a valid
session (`requireAuth`) and derive ownership from the authenticated session, never a
client-supplied ID.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/nonce` | — | Issue a login nonce for a wallet address/chain |
| POST | `/api/auth/verify` | — | Verify a signed nonce, create a session |
| GET | `/api/auth/me` | ✓ | Current authenticated user |
| POST | `/api/auth/logout` | — | Revoke the current session |
| GET / PUT | `/api/risk/limits` | ✓ | Read/update the caller's risk limits (position size, leverage, open-position cap, daily-loss cap, personal kill switch) |
| POST | `/api/execution/orders` | ✓ | Submit a paper-trading order (idempotent via a client-generated key) |
| GET | `/api/execution/orders` | ✓ | Paginated order history |
| POST | `/api/execution/orders/:id/cancel` | ✓ | Cancel a cancellable order the caller owns |
| GET | `/api/execution/positions` | ✓ | Paginated open positions |
| POST | `/api/execution/positions/:id/close` | ✓ | Close a position the caller owns |
| GET | `/api/markets` | — | Current market snapshots, flagged `stale` past the ingestion staleness threshold |
| GET | `/api/signals` | — | Paginated generated signals |
| POST | `/api/signals/generate` | — | Trigger signal generation on demand |
| GET | `/api/stats` | — | Aggregate signal counts |
| GET | `/api/funding/:symbol` | — | Hyperliquid funding rate for a symbol |
| GET | `/api/health` | — | Liveness -- process is up |
| GET | `/api/ready` | — | Readiness -- database + market-data feed independently checked |
| GET | `/api/observability/metrics` | — | Request counts/durations, order-rejection and provider-retry counters, WS/market-data health |
| GET | `/api/market-data/health` | — | Narrower, pre-existing market-data health check (kept alongside `/api/ready`) |
| GET | `/api/websocket/metrics` | — | Narrower, pre-existing WS connection/subscription counts |

WebSocket (`ws://localhost:8080` by default): send `{ type: 'subscribe' | 'unsubscribe',
channel: 'markets' | 'signals' | 'user', symbol? }`. `markets`/`signals` are public;
`user` requires the session cookie sent at handshake time and always resolves to the
connecting user's own channel -- a client can never subscribe to another user's private
channel by supplying an ID, because the protocol doesn't accept one.

See `docs/observability/signals.md` and `docs/operations/runbook.md` for what to check
when something looks wrong, and `docs/security/SECURITY_BASELINE.md` /
`SECURE_DEVELOPMENT_CHECKLIST.md` for the security posture and checklist this repo holds
itself to.

## Known gaps (tracked, not hidden)

- **No lint configuration** in either package -- CI warns and skips rather than failing.
- **No client test framework** configured yet -- CI warns and skips.
- Client production bundle is a single ~586 kB chunk (~199 kB gzipped) -- past Vite's
  default 500 kB warning threshold; a candidate for code-splitting, not yet done.
- `npm audit` on `server/`: 4 moderate findings, all from `drizzle-kit`'s dev-only
  transitive `esbuild` dependency (no production/runtime exposure).
- Analytics/performance reporting (migration step 15) is not yet built -- no UI or API
  exists to audit here yet; see issue `DATA-015` (blocked pending a product decision on
  minimum-sample-size thresholds, not implemented speculatively).
- Metrics in `/api/observability/metrics` are in-memory and reset on every process
  restart; no external APM/exporter is wired up (deliberate scope decision, see
  `docs/observability/strategy.md`).

## Development guidelines

- **Type safety** -- both packages are strict TypeScript; shared request/response shapes
  are Zod schemas (`server/src/schemas/`), not hand-duplicated interfaces.
- **Ownership derives from the session, never the client** -- every route that reads or
  mutates user-owned data (risk limits, orders, positions) filters by `req.user.id` from
  the verified session, exactly the boundary that was an open access-control gap in the
  pre-migration reference app (see `docs/audit/REPLIT_REPOSITORY_AUDIT.md`, historical).
- **Paper trading only** -- `EXECUTION_MODE` defaults to `paper` and nothing in this
  codebase initializes a signed Hyperliquid SDK client; there is no path to a live trade.
- **Modularity** -- each server domain (`auth/`, `risk/`, `execution/`, `market-data/`,
  `websocket/`, `observability/`) owns its own logic; route handlers stay thin.
- Independent-review agent: `.claude/agents/liquidalpha-quality-gate.md` (invoke with
  `/quality-gate` in a Claude Code session) -- see `docs/development/QUALITY_GATE_AGENT.md`.
