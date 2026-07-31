# Baseline Verification — 2026-07-31

All commands run from a clean `feat/positions-ux` checkout (== `origin/main` content,
PR #17 merged), against existing `node_modules` (not a from-clean-clone install).

Environment: Node `v22.22.2`, npm `10.4.0`, Windows 11 (bash via Git Bash).

## Server (`server/`)

| Check | Command | Result |
|---|---|---|
| Build / typecheck | `npm run build` (`tsc`) | **Pass**, clean, no output |
| Tests | `npm test` (`vitest run`) | **Pass** — 14 files, 96 tests, 5.15s |
| Dependency audit | `npm audit --audit-level=high` | 4 moderate — all from `drizzle-kit`'s dev-only `esbuild` transitive dep (GHSA-67mh-4wv8-2f99). Dev-time-only exposure (CI marks this `continue-on-error`/informational already). No fix without a `drizzle-kit` downgrade (`0.18.1`, breaking). Not a runtime/production risk. |
| Lint | — | No `lint` script configured (CI already warns and skips this step — pre-existing gap, not introduced by this session). |

## Client (`client/`)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **Pass**, clean |
| Build | `npm run build` (`tsc --noEmit && vite build`) | **Pass**, 1m3s. One pre-existing warning: main JS chunk is 574.61 kB (195.5 kB gzip) — Vite's default 500 kB chunk-size-warning threshold. Not a build failure; a performance note (candidate backlog item under Phase 11's performance epic, not a blocker). |
| Tests | — | No test framework/script configured yet (CI already warns and skips — pre-existing gap, matches migration-plan step 15/16/17 not yet started). |
| Dependency audit | `npm audit --audit-level=high` | **0 vulnerabilities.** |

## Overall

No failing gate. Everything the existing CI workflow checks (server build+test,
client typecheck+build, both `npm audit`s) passes locally exactly as it would in
Actions, with two long-standing, already-documented gaps (no lint config in either
package, no client test framework) that predate this session and are already visible
in the CI workflow's own warning messages — not newly discovered defects.

## Explicitly not run in this pass

- **Integration/E2E against a live Postgres** — no database instance available in this
  environment; server tests are unit-level (mocked/in-memory per `vitest` output) and do
  not exercise real migrations or connection-pool behavior. This is the same gap PR #17's
  own test plan flagged as unverified.
- **Accessibility automation** (e.g. axe) — no such tooling is configured in the repo yet.
- **`npm ci` from a clean clone** — reproducibility was not re-verified from zero;
  `node_modules` for both packages pre-existed in the working tree.
- **GitHub Actions run logs for PR 17 / current `main`** — not fetched this pass (see
  `repository-audit.md`'s "known limitations").
