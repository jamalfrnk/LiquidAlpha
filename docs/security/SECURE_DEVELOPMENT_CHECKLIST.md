# Secure Development Checklist

This checklist backs Step 8 (OWASP) and Step 9 (blockchain/trading) of the
[LiquidAlpha Quality Gate agent](../development/QUALITY_GATE_AGENT.md). Use it directly
when writing code, not only when reviewing it.

## Application Security (OWASP)

- [ ] Every trust boundary (HTTP body, query/path params, WebSocket message, env var
      parsed at runtime) is validated — this repo standardizes on Zod
      (`server/src/hyperliquid-real.ts` is the reference pattern).
- [ ] Database access goes through the Drizzle query builder — no raw string-concatenated
      SQL.
- [ ] Any endpoint or query that returns or mutates user-owned data filters by the
      **authenticated** user's ID server-side, not a client-supplied ID.
- [ ] Passwords are hashed (bcrypt, as in `server/src/auth.ts`) — never stored or logged
      in plaintext.
- [ ] JWT secret comes from `JWT_SECRET` with no usable fallback in any environment that
      can reach real users; a hardcoded/default fallback (e.g. `'dev-secret'`) is a
      finding, not a convenience.
- [ ] CORS uses an explicit origin allowlist in any environment that isn't purely local
      dev; a bare `cors()` with no options is a finding once this ships anywhere real
      users can reach it.
- [ ] Rate limiting exists on authentication endpoints (register/login) and any endpoint
      that triggers external API calls or signal generation on demand.
- [ ] Error responses sent to clients never include stack traces, internal file paths, or
      raw upstream error bodies.
- [ ] Logs never contain passwords, tokens, full JWTs, or raw request bodies for
      authentication endpoints.
- [ ] Dependencies are kept current enough that `npm audit --audit-level=high` is clean,
      or any accepted exception is documented with a reason and owner.
- [ ] Secrets live in environment variables (see `server/.env.example` for the documented
      set) and are never committed, echoed to logs, or sent to the client bundle.

## Blockchain / Trading Security

- [ ] No code path requests, stores, or logs a seed phrase.
- [ ] No code path stores a raw private key without an explicitly approved secure-custody
      design (this repository's current design is signature-based auth — private keys
      never reach the server; keep it that way unless a custody design is explicitly
      reviewed and approved).
- [ ] Signature verification happens server-side; the frontend's claim of "this wallet is
      authorized" is never trusted on its own.
- [ ] Any signing request presented to a user is human-readable (no blind-signing of
      opaque hex payloads where a structured/typed request is possible).
- [ ] Nonces (if introduced for auth or transaction flows) are single-use, expire, and are
      bound to the intended domain/chain to prevent replay.
- [ ] RPC URLs, contract addresses, chain IDs, and destination addresses are validated
      against an allowlist rather than accepted as arbitrary input.
- [ ] Market data feeding a signal or trade decision has explicit staleness handling —
      `generateSignals()` in `server/src/technical-analysis.ts` already requires ≥210 bars
      of history; any new signal/execution path needs an equivalent freshness/sufficiency
      check, not an implicit assumption.
- [ ] Risk rules (stop-loss direction, take-profit direction, position size, leverage,
      minimum risk/reward — currently 1:2 per the README) are enforced **before** an order
      is constructed, not validated after the fact.
- [ ] Order submission is idempotent — a retried or duplicated request cannot produce two
      live orders for the same intent.
- [ ] Ambiguous provider failures (timeout, partial response, unknown status) trigger
      reconciliation against provider state, not a blind automatic retry of the same
      submission.
- [ ] There is an explicit, testable boundary between paper/dev mode and any path that
      could reach a production trading endpoint — dev and CI runs must be structurally
      unable to place a live trade, not just unlikely to.
- [ ] Live trading is never the default; enabling it requires an explicit, auditable
      opt-in.
- [ ] A kill switch / circuit breaker exists (or is planned before execution code ships)
      to halt trading independent of the normal request path.

## PII and Secrets

- [ ] Fixtures, tests, and documentation use neutral placeholder values only:
      `user@example.com`, `test-user`, `example-builder-code`,
      `0x0000000000000000000000000000000000000000`.
- [ ] Screenshots attached to PRs/docs are checked for real user data before attaching.
- [ ] If a secret is suspected to already be in Git history, it is reported (type,
      location, remediation) without printing the value, and handled via rotation +
      a controlled history-remediation procedure — never an automatic history rewrite.

## When In Doubt

Run `/quality-gate security` for a review pass weighted toward this checklist before
opening a PR that touches auth, wallets, signing, market data, signals, or execution.
