# LiquidAlpha Quality Gate Report

## Decision

**FAIL**

Two Critical dependency/schema defects mean the `server` package cannot currently be
installed or built at all, and a third Critical defect (`auth.ts` referencing schema
columns that don't exist) means the authentication code is non-functional even once
installed. Four High findings compound this (missing lockfile, no wired-up
authentication despite it being documented, a hardcoded JWT fallback secret, zero
automated tests).

## Change Summary

This run reviews the state of `main` (commit `bfb55a5`) itself — there is no in-flight
feature diff to review yet in this repository beyond the quality-gate agent's own
onboarding change (tracked separately; see "Evidence"). Establishing this baseline is the
first quality-gate run for LiquidAlpha and doubles as the validation run requested when
creating the agent.

**Intended behavior** (per `README.md`): a Node/Express + PostgreSQL/Drizzle backend that
fetches live market data, generates technical-indicator-based trading signals with
risk-managed stop-loss/take-profit levels, exposes REST + WebSocket APIs, and supports
signature-based multi-wallet authentication (private keys never sent to the server).

**Actual implementation**: market data, signal generation, REST/WebSocket delivery, and
the Hyperliquid funding-rate wrapper all match the README. Authentication does **not**
match the README — `server/src/auth.ts` implements email/password + JWT auth (not
wallet-signature auth), is not wired into `server.ts` as routes, references database
columns that do not exist in the schema, and imports npm packages that are not declared
as dependencies. This is a direct discrepancy between stated and actual behavior (agent
Step 2).

## Branch and Base

- Reviewed ref: `main` @ `bfb55a5` (`origin/main`, up to date)
- This review was produced from branch `feature/quality-gate-agent`, created off `main`,
  which itself only *adds* the quality-gate agent, CI workflow, and documentation — it
  does not modify any file under `server/`. All findings below pre-exist on `main` and
  are not introduced by that branch.

## Risk Classification

**High.** The affected surface includes authentication and the dependency chain that
gates whether the project builds at all — both are foundational.

## Commands Executed

| Command | Exit status | Notes |
|---|---|---|
| `git status`, `git branch --show-current`, `git log --oneline --decorate -10` | 0 | Clean tree on `main` prior to branching; history reviewed |
| `git diff --stat main` (from `feature/quality-gate-agent`) | 0 | No changes to `server/` on this branch |
| `npm install` (in `server/`) | 1 | `ETARGET` — no version of `drizzle-kit` satisfies `^0.13.3`; install aborts before any package is fetched |
| `npm view drizzle-kit versions` | 0 | Confirms only `0.13.0` exists in the `0.13.x` line; `^0.13.3` therefore has zero satisfying versions on the registry |
| `npm view drizzle-orm versions` | 0 | `0.28.3` (the pinned version) exists and is installable |
| `grep` for `bcrypt`/`jsonwebtoken` in `server/package.json` | — | No matches — used in code, not declared |
| `grep` for `email`/`password` in `server/src/db/schema.ts` | — | No matches — `users` table has no such columns |
| `grep` for `register`/`login`/`auth` in `server/src/server.ts` | — | No matches — `auth.ts` exports are never imported or mounted |
| `npm run build` / `npm test` / `npm run lint` (in `server/`) | not run | Blocked by the install failure above; `build`/`test`/`lint` cannot execute without `node_modules`, and no `lint`/`test` script exists yet regardless |

## Validation Results

- **Install**: **FAIL** — `npm install` in `server/` exits 1 (`ETARGET` on `drizzle-kit@^0.13.3`).
- **Build/typecheck**: **BLOCKED** by the install failure (cannot run `tsc` without dependencies installed).
- **Lint**: **SKIPPED** — no `lint` script defined in `server/package.json`.
- **Tests**: **SKIPPED** — no `test` script and no test files exist in the repository.
- **Dependency audit**: **BLOCKED** by the install failure.
- **Secret scan**: **PASS** — no committed secret material found in tracked files; `.env.example` uses placeholder values only.
- **Migration check**: **N/A** — no `drizzle/` migration directory is checked in yet; schema and migrations cannot be compared.

## Critical Findings

```
ID: LA-QG-001
Severity: Critical
Category: CI Readiness / Broken Dependency Chain
File: server/package.json
Location: devDependencies.drizzle-kit
Evidence: `npm install` in server/ exits 1 with `ETARGET No matching version
  found for drizzle-kit@^0.13.3`. `npm view drizzle-kit versions` confirms
  only 0.13.0 exists in the 0.13.x line, which `^0.13.3` excludes.
Impact: The project cannot be installed, built, tested, or shipped through
  any CI pipeline in its current state. This blocks every other check.
Required correction: Pin drizzle-kit to an installable version compatible
  with drizzle-orm 0.28.x (e.g. update both drizzle-orm and drizzle-kit
  together to a current matched pair, or pin drizzle-kit to "0.13.0"), then
  verify `npm install` succeeds and commit the resulting lockfile.
Blocks gate: Yes
```

```
ID: LA-QG-002
Severity: Critical
Category: Incorrect Business Logic / Schema Mismatch
File: server/src/auth.ts (references server/src/db/schema.ts)
Location: register() and login(), all `users.email` / `users.password` accesses
Evidence: auth.ts queries `eq(users.email, email)` and inserts
  `{ email, password: hashed }`, but server/src/db/schema.ts's `users` table
  only defines `id`, `address`, `builderCode`, and `createdAt` — there is no
  `email` or `password` column anywhere in the schema.
Impact: register()/login() cannot function against the actual database
  schema; this is not a partially-working feature, it is non-functional
  code that would fail immediately if ever invoked or type-checked against
  a strict schema.
Required correction: Decide the actual auth model (README describes
  wallet-signature auth using `address`/`builderCode`, which is what the
  schema already supports) and either rewrite auth.ts to match the
  wallet-signature model, or add the missing columns/table if email+password
  auth is actually intended in addition to wallet auth. Add integration
  tests that exercise the chosen path against the real schema.
Blocks gate: Yes
```

```
ID: LA-QG-003
Severity: Critical
Category: Broken Functionality / Missing Dependencies
File: server/src/auth.ts, server/package.json
Location: `import bcrypt from 'bcrypt'`, `import jwt from 'jsonwebtoken'`
Evidence: Neither `bcrypt` nor `jsonwebtoken` (nor their @types packages)
  appear in server/package.json dependencies or devDependencies.
Impact: Even if LA-QG-001 and LA-QG-002 were fixed, `auth.ts` still could
  not compile or run — the modules it imports are not installed and are not
  declared anywhere, so consumers have no way to know they're required.
Required correction: Add `bcrypt`, `@types/bcrypt`, `jsonwebtoken`, and
  `@types/jsonwebtoken` to package.json if the email/password model is kept,
  or remove the imports entirely if auth.ts is rewritten around
  wallet-signature verification instead.
Blocks gate: Yes
```

## High Findings

```
ID: LA-QG-004
Severity: High
Category: Authentication / Weak Default Secret
File: server/src/auth.ts
Location: `const JWT_SECRET: string = process.env.JWT_SECRET || 'dev-secret';`
Evidence: A hardcoded fallback secret is used whenever JWT_SECRET is unset.
Impact: Any deployment that forgets to set JWT_SECRET silently issues and
  accepts tokens signed with a publicly-known value in this repository's
  source, allowing forged authentication tokens.
Required correction: Fail fast (throw at startup) if JWT_SECRET is unset in
  any non-local environment, rather than silently falling back to a known
  value. `server/.env.example` already documents JWT_SECRET as required —
  the code should enforce that, not just document it.
Blocks gate: Yes
```

```
ID: LA-QG-005
Severity: High
Category: CI Readiness / Reproducibility
File: server/ (missing package-lock.json)
Evidence: `server/` contains package.json but no lockfile. The quality-gate
  CI workflow added alongside this report (.github/workflows/quality-gate.yml)
  intentionally fails closed on a missing lockfile rather than silently
  resolving fresh versions in CI.
Impact: Installs are not reproducible between machines/CI runs, and (as of
  this run) CI cannot even get past the install step.
Required correction: Once LA-QG-001/003 are resolved and `npm install`
  succeeds locally, commit the generated server/package-lock.json.
Blocks gate: Yes
```

```
ID: LA-QG-006
Severity: High
Category: Documentation Drift / Dead Code
File: server/src/auth.ts, server/src/server.ts, README.md
Evidence: `register`/`login` are exported from auth.ts but never imported or
  mounted in server.ts (`grep` for register/login/auth in server.ts returns
  no matches). README.md states authentication is "signature-based;
  private keys are never sent to the server," describing a model auth.ts
  does not implement.
Impact: There is currently no working authentication of any kind reachable
  through the running server, contrary to what the README implies, and the
  unreachable code in auth.ts has never been exercised (compounds
  LA-QG-002/003 — nothing would have caught the schema/dependency mismatch
  because nothing calls this code).
Required correction: Either wire a corrected auth.ts into server.ts behind
  real routes with tests, or remove it until the wallet-signature auth model
  described in the README is actually implemented — don't leave
  contradictory, unreachable auth code in the tree.
Blocks gate: Yes
```

```
ID: LA-QG-007
Severity: High
Category: Test Coverage
File: server/ (repository-wide)
Evidence: No test files exist anywhere in the repository; server/package.json
  has no `test` script.
Impact: Signal-generation and risk logic (server/src/technical-analysis.ts,
  server/src/indicators.ts) — exactly the kind of deterministic,
  financially-consequential logic this gate requires regression tests for —
  has zero automated verification. Regressions in EMA/MACD/RSI math or the
  confidence-scoring formula would only be caught by manual inspection.
Required correction: Add a test runner (e.g. vitest or jest) and unit tests
  for indicators.ts (known input/output pairs) and technical-analysis.ts
  (trend/momentum agreement, confidence bounds, the 210-bar minimum-history
  gate), at minimum before any further signal-logic changes are merged.
Blocks gate: Yes
```

## Medium Findings

```
ID: LA-QG-008
Severity: Medium
Category: OWASP / Security Misconfiguration
File: server/src/server.ts
Location: `app.use(cors());`
Evidence: CORS is enabled with no options, i.e. an open allowlist; the
  in-code comment acknowledges this ("CORS is open by default here").
Impact: Acceptable for local-only development; becomes a cross-origin
  exposure risk the moment this server is reachable from a browser outside
  a trusted origin set.
Required correction: Before any non-local deployment, set an explicit
  `origin` allowlist sourced from configuration.
Blocks gate: No (currently local-dev only; must be fixed before deployment)
```

```
ID: LA-QG-009
Severity: Medium
Category: Reliability / Database
File: server/src/db/index.ts
Evidence: A single `pg.Client` (not a `Pool`) is created once at module load
  and reused for all queries; there is no reconnect/retry handling if the
  underlying connection drops.
Impact: A transient network blip or DB restart takes down all database
  access for the process until it's manually restarted, since nothing
  re-establishes the connection.
Required correction: Use `pg.Pool` (or Drizzle's pooled driver) with
  sensible pool sizing, and add reconnect-on-error handling.
Blocks gate: No
```

```
ID: LA-QG-010
Severity: Medium
Category: CI Readiness
File: server/package.json
Evidence: No `lint` or `test` script is defined.
Impact: Lint and test enforcement in the new CI workflow currently no-ops
  with a warning rather than actually checking anything.
Required correction: Add ESLint (or equivalent) and a test runner with
  matching npm scripts so quality-gate.yml's existing conditional steps
  start doing real work without further workflow changes.
Blocks gate: No (already surfaced as an explicit CI warning, not a silent gap)
```

```
ID: LA-QG-011
Severity: Medium
Category: Resource Growth
File: server/src/price-history.ts
Evidence: The module's own doc comment states "Older rows are not
  automatically purged," and no cleanup job exists in the repository.
Impact: `price_history` grows without bound over time; eventually affects
  query performance and storage cost.
Required correction: Add a scheduled cleanup (cron job or a bounded
  DELETE after each insert batch) enforcing HISTORY_LIMIT per symbol, as the
  comment already anticipates.
Blocks gate: No
```

## Low Findings

```
ID: LA-QG-012
Severity: Low
Category: Data Integrity
File: server/src/db/schema.ts
Evidence: `users.address` has no unique constraint.
Impact: Nothing at the database level currently prevents duplicate user rows
  for the same wallet address.
Required correction: Add a unique index on `users.address` once the auth
  model (LA-QG-002/006) is finalized.
Blocks gate: No
```

```
ID: LA-QG-013
Severity: Low
Category: Data Integrity
File: server/src/db/schema.ts
Evidence: `performance.userId` / `performance.signalId` are plain `uuid`
  columns with no foreign-key reference to `users.id` / `signals.id`.
Impact: Referential integrity is enforced only by application code, not the
  database.
Required correction: Add FK constraints once the write paths that populate
  `performance` are implemented and tested (currently `recordPerformance`
  is defined but not called from anywhere in the codebase).
Blocks gate: No
```

```
ID: LA-QG-014
Severity: Low
Category: Maintainability
File: server/package.json
Evidence: `drizzle-orm@^0.28.3`, `pg@^8.11.1`, `express@^4.18.2`, and other
  pins are dated relative to current majors in this ecosystem.
Impact: No immediate defect, but the gap widens the eventual upgrade effort
  and delays picking up security patches.
Required correction: Schedule a routine dependency refresh once LA-QG-001 is
  resolved and `npm audit` can actually run.
Blocks gate: No
```

## Functional Logic Review

Market data fetch → persistence → broadcast (`updateMarkets`) and signal generation
(`generateSignals`) both trace cleanly end-to-end and fail closed on provider errors
(logged, not thrown, so the interval loop survives). `technical-analysis.ts` correctly
requires ≥210 bars before generating a signal and skips symbols with conflicting
trend/momentum rather than forcing a direction — reasonable determinism and a real
minimum-data guard. No production trading/execution path exists yet, so the Step 4/9
requirements around risk-rules-before-order-construction, duplicate-order prevention,
and paper/live separation are **not yet applicable** — flagged as required design work
(see Recommended Follow-Up) before any execution code is added, not as a current defect.

Authentication's functional path is broken end-to-end — see Critical findings
LA-QG-001–003 and High finding LA-QG-006.

## Redundancy Review

No duplicate components, API clients, schemas, or indicator calculations were found in
the current (small) codebase. `wrapAsync` in `bootstrap.ts` is used consistently across
all routes in `server.ts` — good, single-source error handling. No consolidation action
needed at this size.

## Test Coverage Review

Zero automated tests exist (LA-QG-007). No unit tests for `indicators.ts` math, no
integration tests for any REST route, no tests for the WebSocket broadcast path, and
(once functional) no tests for `auth.ts`.

## OWASP Security Review

See LA-QG-004 (weak JWT fallback) and LA-QG-008 (open CORS). No SQL injection risk found —
all queries go through Drizzle's query builder. No endpoint currently returns or mutates
user-owned data with an authorization check to evaluate (auth doesn't exist end-to-end
yet), so IDOR review will need to happen once auth is wired up. No secrets found in
tracked files.

## Blockchain Security Review

There is no wallet-signature verification, transaction signing, or order-execution code
in the repository yet, despite the README describing wallet-based auth as a feature. Once
that is implemented, apply the full checklist in
`docs/security/SECURE_DEVELOPMENT_CHECKLIST.md` (nonce handling, replay protection,
server-side signature verification, paper/live trading boundary, risk-rules-before-order,
idempotent submission). Nothing in the current codebase is blocked at Critical severity
under this category only because no such code exists yet to violate the checklist —
this is a gap to close before execution logic is written, not a current pass.

## PII and Secret Review

No secrets, credentials, or PII found in tracked files. `server/.env.example` uses only
placeholder/template values. No further action required at this time.

## API and Resource Efficiency

`updateMarkets` runs every 10s and performs 3 sequential inserts + 3 `addPricePoints`
calls per tick (one per symbol) rather than a single batched insert — a Low-impact,
non-blocking optimization opportunity, not filed as a numbered finding given the current
scale (3 symbols). `broadcast()` sends every event to all connected WebSocket clients
globally (LA-QG-011 territory once user-scoped data is added, not currently a problem
since all data broadcast today is public market data).

## Database and Migration Review

No `drizzle/` migrations directory exists yet, so there is nothing to compare schema
against — `drizzle-kit generate` has apparently never been run for this schema. See
LA-QG-012/013 for integrity constraints. Financial values (`price`, `volume`, `pnl`, etc.)
correctly use Drizzle's `numeric` (arbitrary-precision decimal) column type rather than a
floating-point type — good practice already in place.

## UI/UX and Accessibility Review

Not applicable — no frontend/client exists in this repository yet (README explicitly
notes the client is planned separately). Apply Step 13 once a `client/` is added.

## CI Readiness

Prior to this change, no `.github/workflows/` existed at all. This change adds
`.github/workflows/quality-gate.yml` (least-privilege `permissions: contents: read`,
`npm ci` with fail-closed lockfile enforcement, conditional lint/test, `npm audit`,
Drizzle migration sanity check, and a separate Gitleaks secret-scan job). As configured,
this workflow would currently fail on push/PR at the install step, for the exact reasons
in LA-QG-001/003/005 — which is the correct behavior (fail closed), not a defect in the
workflow itself.

## Documentation Review

README's authentication section does not match the implementation (LA-QG-006). No other
drift found between documented and actual REST/WebSocket behavior. This report and the
four new `docs/` files introduced alongside it should be kept in sync as auth is
corrected.

## Required Fixes Before CI

1. LA-QG-001 — fix the unsatisfiable `drizzle-kit` version range.
2. LA-QG-002 — reconcile `auth.ts` with the actual `users` schema (or rewrite to the
   README's wallet-signature model).
3. LA-QG-003 — declare `bcrypt`/`jsonwebtoken` (or remove them).
4. LA-QG-004 — remove the hardcoded JWT fallback secret; fail fast instead.
5. LA-QG-005 — commit `server/package-lock.json` once install succeeds.
6. LA-QG-006 — wire up corrected auth routes or remove the dead code; align README.
7. LA-QG-007 — add a test runner and at least indicator/signal unit tests.

## Recommended Follow-Up Work

- LA-QG-008/009/010/011 (Medium) and LA-QG-012/013/014 (Low) — address opportunistically,
  none block CI.
- Before any trading-execution code is written: implement the full blockchain/trading
  safety checklist (paper/live boundary, risk-rules-before-order, idempotent submission,
  kill switch) referenced in `docs/security/SECURE_DEVELOPMENT_CHECKLIST.md` — there is
  no execution code yet, so this is proactive, not remedial.
- Add a `drizzle/` migrations directory and run `drizzle-kit generate` once the schema
  changes needed to fix LA-QG-002 are decided, so schema and migrations stay in sync from
  the start.

## Evidence

- `npm install` (server/) → exit 1, `ETARGET No matching version found for
  drizzle-kit@^0.13.3`.
- `npm view drizzle-kit versions` → only `0.13.0` published in the `0.13.x` line.
- `grep -n "email\|password" server/src/db/schema.ts` → no matches.
- `grep -n "bcrypt\|jsonwebtoken" server/package.json` → no matches.
- `grep -rn "register\|login\|auth" server/src/server.ts` → no matches.
- `git log --oneline --decorate -10` on `main` reviewed for commit-message intent; no
  discrepancy found between commit messages and their diffs beyond the auth gap already
  documented above.
- Full fixture-based capability validation (duplicate logic / missing authorization /
  hardcoded secret / failing test / live-trading safety violation) recorded separately in
  `docs/development/QUALITY_GATE_AGENT_DEMO.md`.
