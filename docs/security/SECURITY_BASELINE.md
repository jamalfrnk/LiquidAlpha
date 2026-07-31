# Security Baseline

Consolidates the security-relevant findings from both audits into one checklist-style reference, plus the PII/secret scan results and the CI security-tooling plan. Individual finding IDs (`GH F-#`, `Replit C-#`/`H-#`) refer to `GITHUB_REPOSITORY_AUDIT.md` and `REPLIT_REPOSITORY_AUDIT.md`.

## PII and Secret Exposure Assessment

**Result: clean in both repos.** Specifically checked:
- `git log -p --all` across both repos for API-key patterns, private-key PEM headers, Postgres connection strings with embedded credentials, JWT secrets, and 64-hex-char strings (raw private keys) — **no matches** beyond placeholder/example values (`replace-with-your-secret`, `dev_only_change_me`, etc.).
- No `.env` file was ever committed to either repo's git history (confirmed via `git ls-files | grep env`).
- No `.env*` file exists on disk in the extracted Replit export at all — the export is clean of local secrets.
- Replit-specific dotfiles (`.replit`, `.config/npm`, `.local/`) inspected directly — no credentials; `.local/` turned out to be bundled Replit AI-agent tooling, unrelated to the application.
- One hardcoded **demo** wallet address (`0x742d35Cc6631C0532925a3b8D432B29dA2e8c3e5`, `client/src/lib/walletconnect.ts:121`, explicitly commented "Mock address for demo") — not a real user's address, but should be replaced with a neutral placeholder (`0x0000...0000`) per your convention when this file is ported or removed.
- No real user names, emails, phone numbers, or physical addresses found in fixtures, seed data, or comments in either repo.

**What is a genuine risk (not PII/secrets, but adjacent):** four hardcoded *default* JWT secret literals across Replit's auth files (`Replit C-3`) — these function as real secrets if the env var is ever unset in a deployment, which is why they're treated as Critical findings rather than filed here as merely "no leak found."

## OWASP Baseline — status per category

| Category | GitHub skeleton | Replit reference app | Target requirement |
|---|---|---|---|
| **Broken access control** | No auth on any route (nothing to break yet — GH F-1) | Confirmed IDOR on position endpoints, mass-assignment on position PATCH and config PATCH (Replit C-2, H-6) | Every private resource: `requireAuth` + server-side ownership check against `req.user.id`, never a client-suppliable identifier |
| **Authentication failures** | Auth code present but disconnected from schema, non-functional (GH F-1) | Working nonce/signature flow but no nonce TTL, no domain binding (Replit "what's good" + gaps noted in C-3 area) | Nonce TTL + single-use (already have single-use), SIWE-style domain binding, fail-closed JWT secret |
| **Cryptographic failures** | JWT secret hardcoded fallback (GH F-2) | Same pattern, 4x over (Replit C-3) | Env validation at boot, no default secrets anywhere |
| **Injection** | No raw SQL found; Drizzle query builder used throughout | No string-concatenated SQL found; `auth-system.ts` uses parameterized raw queries correctly, `storage.ts` uses Drizzle builder | Maintain — this is one area both repos already do correctly |
| **Security misconfiguration** | CORS fully open (`cors()` no options, GH F-3) | CSP uses `'unsafe-eval'` + wildcard `https:`/`ws:`/`wss:` (Replit H-5); no CORS allowlist configured on the live path | Explicit CORS allowlist per environment; CSP allowlisting real hosts only, no wildcards, no `unsafe-eval` without a proven need |
| **Vulnerable/outdated components** | Small, current dependency set, nothing flagged | 6 confirmed-unused Replit-OIDC packages (dependency-surface bloat, not a known CVE); nothing else flagged on version inspection alone | Drop unused deps; add `npm audit`/Dependabot to CI (see below) — neither repo has run this in an automated way |
| **Identification and auth failures** | N/A (auth doesn't function) | Nonce TTL gap, no domain binding (see above); session revocation/rotation mechanism not found in either repo | Add explicit logout-side revocation and a rotation strategy — currently a 7-day JWT with no revocation list in either repo |
| **Software/data integrity failures** | Migration tooling configured but never actually generates a migration (GH F-12) | Migration history diverged from live schema, includes a real column-name bug (Replit C-6) | Regenerate a clean migration baseline; migration-file-based changes only going forward |
| **Logging/monitoring failures** | `console.log`/`console.error` only, no structured logging | Same — no structured logging, no request IDs found anywhere | Net-new observability work (migration plan step 16) |
| **SSRF** | `hyperliquid-real.ts`'s HL API URL is env-configurable but not user-input-driven — low risk as-is | No route found that fetches an arbitrary user-supplied URL server-side — no SSRF vector identified in either repo | Keep external URLs config-driven, never accept a URL from request bodies without an allowlist |

## Blockchain/Wallet Security Checklist

| Control | Status (best of both repos) | Notes |
|---|---|---|
| Cryptographically secure nonce generation | ✅ Present (Replit `auth-system.ts`, `crypto.randomBytes(16)`) | Carry forward |
| Nonce expiration | ❌ Missing | Single-use deletion exists, but no TTL check before that — a captured, unused signed nonce is valid indefinitely until consumed |
| Single-use nonce consumption | ✅ Present (`DELETE FROM auth_nonces` post-verify) | Carry forward |
| Domain binding | ❌ Missing | Signed message has Chain/Address/Nonce/Issued-At but no SIWE-style `domain`/`uri` field — a phishing site presenting the same message text would validate |
| Chain binding | ✅ Present (`Chain:` field in signed message) | Carry forward |
| Wallet-address normalization | Not directly verified — flag for explicit check during auth rebuild | |
| Server-side signature verification | ✅ Present (`ethers.verifyMessage` for EVM, `tweetnacl`+`bs58` for Solana) | Carry forward, both are correct standard choices |
| No private keys/seed phrases held server-side | ✅ Confirmed by design and by scan — `hyperliquid-real.ts` explicitly documents never initializing the SDK with a private key | Carry forward as an explicit architectural invariant, not just an accident of an uninitialized variable (Replit H-1) |
| Explicit environment/network display | Not implemented in either repo (no client UI exists in GitHub; Replit doesn't clearly surface "which environment" in its execution confirmation) | New UI work, part of migration step 14 |
| Paper-trading/testnet default | Partially — Replit's real-order calls are commented out, but this is a manual code state, not a config flag (Replit H-1) | Must become an explicit, tested config switch defaulting to paper, not an accidental disabled code path |
| Position/leverage limits enforced server-side | ❌ Missing in both | Client-only in Replit (`trade-validation.ts`), absent entirely in GitHub — migration step 11 |
| Idempotent order submission | ❌ Missing in both | No idempotency key mechanism found anywhere — migration step 8/12 |
| Kill switch (global/per-user) | ❌ Missing in both | Net-new — migration step 11 |
| Reconciliation after ambiguous responses | ❌ Missing in both | Net-new — migration step 12 |

## Security Test Suite (migration step 17, issue #21)

Added 2026-07-31 (`test/security-suite` branch): regression tests proving the controls
below actually reject the traffic they're supposed to, not just that the code exists.
No live Postgres is available in this environment, so `server/src/auth/nonce.ts` and
`server/src/execution/paperEngine.ts` (both embed `db` calls directly) are tested
against a minimal Drizzle-chain mock (`server/src/test-utils/dbMock.ts`) rather than a
real database — this proves the branching logic, not Postgres's own atomicity
guarantees.

- **Nonce replay/expiry** (`server/src/auth/nonce.test.ts`): consuming the same nonce
  twice fails the second time; a nonce past its stored `expiresAt` is rejected even
  though a row existed. Closes the "Nonce expiration ❌ Missing" gap this table listed
  above — nonce TTL enforcement (`consumeNonce`'s expiry check) is now regression-tested,
  not just present in code.
- **Cross-user resource access** (`server/src/execution/paperEngine.test.ts`): user A
  cannot cancel user B's order or close user B's position (`ForbiddenError`), with a
  positive-control case proving the owning user still succeeds — directly regression-tests
  the "Broken access control" row above (the exact IDOR class flagged as Replit C-2).
- **Rate-limit enforcement** (`server/src/middleware/rateLimit.test.ts`): a real
  in-process Express server proves `authLimiter` (20/15min) and `apiLimiter` (300/15min)
  actually return 429 once exceeded, not just that the middleware is mounted.
- **WS private-channel authorization**: already covered by the pre-existing
  `server/src/websocket/server.test.ts` test ("rejects a subscribe to the private user
  channel without authentication") plus the protocol schema having no client-suppliable
  user-id field — not duplicated in this pass.
- **Out of scope for this pass**: CSRF (SameSite cookie configuration was not
  independently re-audited here) and oversized-WS-payload handling (already enforced by
  `ws`'s own `maxPayload` option — a library-level guarantee, not custom logic to
  regression-test).

## CI/CD Security Tooling Plan (`chore/ci-foundation`, PR #2)

- `.github/workflows/ci.yml`: install (lockfile-pinned) → format check → lint → typecheck → unit tests → integration tests → build.
- `.github/workflows/codeql.yml`: CodeQL static analysis on PRs and main pushes.
- `.github/dependabot.yml`: weekly dependency update PRs + security alerts.
- Secret scanning: enable GitHub's native secret scanning + push protection on the repo (recommend enabling in repo settings — see below); add Gitleaks as a CI step for defense in depth.
- `npm audit --audit-level=high` as a CI step (non-blocking initially, reviewed manually, tightened once the current dependency list is cleaned per the migration plan's dependency-drop items).
- No workflow will require production private keys, trading credentials, or live API secrets — all tests run against mocked adapters/fixtures per the assignment's guardrails.

## Recommended Branch Protection (`main`)
Per your instructions, this is a **recommendation only** — I have not changed any repository governance settings, since doing so remotely without your explicit go-ahead is exactly the kind of action the assignment says to hold off on:
- Require pull requests before merging, at least 1 approval.
- Require status checks to pass (CI above) and branches to be up to date before merging.
- Require conversation resolution before merging.
- Disable force pushes and branch deletion on `main`.
- Enable secret scanning + push protection, Dependabot alerts, and code scanning (CodeQL) in repo settings.
- Signed commits encouraged, not required initially (avoids blocking early velocity while the workflow is still being established).

If you'd like, I can apply these via `gh api` once you confirm — they affect shared repo settings, not just code, so I'm holding off until you say go.
