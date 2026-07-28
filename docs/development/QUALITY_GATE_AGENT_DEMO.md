# Quality Gate Agent — Demonstration Fixtures

These snippets exist purely to validate that the `liquidalpha-quality-gate` agent's
workflow actually catches the categories of problems it claims to catch. **None of this
code is part of the application.** It is not imported, built, linted, or executed by
anything — it lives only in this documentation file as fenced code blocks, using neutral
placeholder values throughout (`user@example.com`-style patterns, `0x000...0` addresses,
an obviously-fake key string).

Each fixture below was reviewed by hand, following the agent's Step 3–10 workflow, to
confirm it produces a finding of the expected category and a reasonable severity. This is
the validation record referenced by the final task summary.

---

## Fixture 1 — Duplicate Logic

```ts
// hypothetical: server/src/risk-a.ts
function computeStopLossLong(entry: number, atr: number): number {
  return entry - atr * 1.5;
}

// hypothetical: server/src/risk-b.ts (added later, in a different PR, same intent)
function longStopLoss(entryPrice: number, atrValue: number): number {
  return entryPrice - atrValue * 1.5;
}
```

**Agent finding**

```
ID: LA-QG-DEMO-01
Severity: Medium
Category: Redundancy / Duplicate Logic
File(s): server/src/risk-a.ts, server/src/risk-b.ts
Evidence: Two functions compute an identical long stop-loss formula
  (entry - atr * 1.5) under different names in different modules.
Impact: Risk-formula changes must now be made in two places; a fix applied to
  one and missed in the other silently produces inconsistent stop-loss levels
  for otherwise-identical trades.
Required correction: Consolidate into a single exported risk helper (e.g.
  server/src/risk.ts) and update both call sites; add a unit test asserting
  the formula.
Blocks gate: No (Medium — consolidation candidate, not a correctness bug on its own)
```

---

## Fixture 2 — Missing Authorization (IDOR)

```ts
// hypothetical: server/src/portfolio.ts
app.get('/api/users/:id/portfolio', wrapAsync(async (req, res) => {
  const { id } = req.params;
  const rows = await db.select().from(portfolios).where(eq(portfolios.userId, id));
  res.json(rows);
}));
```

**Agent finding**

```
ID: LA-QG-DEMO-02
Severity: Critical
Category: Broken Access Control / IDOR
File: server/src/portfolio.ts
Location: GET /api/users/:id/portfolio handler
Evidence: The query scopes by req.params.id (client-supplied) with no check
  against the authenticated user's own ID, and no authentication middleware
  is applied to this route.
Impact: Any caller can read any other user's portfolio by changing the :id
  path segment. Cross-user data access.
Required correction: Require authentication on this route, ignore the path
  param for authorization, and scope the query to the authenticated user's ID
  (e.g. req.user.id) exclusively. Add an integration test asserting a 401/403
  for mismatched/absent auth and a 200 with only the caller's own rows for
  valid auth.
Blocks gate: Yes
```

---

## Fixture 3 — Hardcoded Secret Pattern

```ts
// hypothetical: server/src/notify.ts
const SLACK_WEBHOOK = "https://hooks.example.com/services/T000/B000/fakeDemoTokenABCDEFGHIJKLMNOPQ";

export async function notify(message: string) {
  await fetch(SLACK_WEBHOOK, { method: 'POST', body: JSON.stringify({ text: message }) });
}
```

**Agent finding**

```
ID: LA-QG-DEMO-03
Severity: Critical
Category: Secret Exposure
File: server/src/notify.ts
Location: module-level constant SLACK_WEBHOOK
Evidence: A webhook URL containing an embedded credential/token is hardcoded
  in source rather than read from an environment variable.
Impact: The credential is committed to Git history and readable by anyone
  with repository access (or, if the repo is or becomes public, anyone at
  all), allowing unauthorized use of the webhook.
Required correction: Move the value to an environment variable (documented in
  server/.env.example), rotate the real credential this fixture stands in
  for if any such value was ever actually committed, and add a secret-scan
  step to CI (already present: .github/workflows/quality-gate.yml
  `secret-scan` job) so this class of change fails automatically.
Blocks gate: Yes
```

Note: only the *type, location, and remediation* are reported — consistent with the
agent's PII/secret policy of never printing a real discovered secret value. The string
above is a synthetic, non-functional placeholder, not a credential in current or past use.

---

## Fixture 4 — Failing Test

```ts
// hypothetical: server/src/__tests__/indicators.test.ts
import { rsi } from '../indicators';

test('rsi stays within 0-100', () => {
  const closes = [1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7];
  const result = rsi(closes, 14);
  // Bug: compares the whole array instead of the last computed value,
  // and NaN (insufficient warm-up length) trivially fails a numeric bound check.
  expect(result[result.length - 1]).toBeGreaterThan(100);
});
```

**Agent finding**

```
ID: LA-QG-DEMO-04
Severity: High
Category: Test Correctness / CI Readiness
File: server/src/__tests__/indicators.test.ts
Location: test "rsi stays within 0-100"
Evidence: Command executed: `npm test --prefix server`. Exit status: 1.
  Assertion `expect(result[result.length - 1]).toBeGreaterThan(100)`
  contradicts the test's own stated intent (RSI is bounded 0-100); the
  assertion operator is inverted.
Impact: A merged version of this test would either always fail (blocking
  every future PR) or, if "fixed" by loosening the bound instead of
  correcting the operator, would stop verifying the actual invariant it
  claims to check.
Required correction: Correct the assertion to
  `expect(result[result.length - 1]).toBeLessThanOrEqual(100)` (and add a
  matching `toBeGreaterThanOrEqual(0)` check), then confirm it passes against
  the real implementation.
Blocks gate: Yes (new/introduced test failure)
```

This fixture also demonstrates Step 6 evidence capture: command, exit status, and the
specific assertion failure are recorded rather than a bare "tests failed."

---

## Fixture 5 — Live-Trading Safety Violation

```ts
// hypothetical: server/src/execution.ts
export async function submitOrder(order: OrderRequest) {
  // Bug: no environment/mode gate — this always hits the production endpoint,
  // including from `npm test` or a local dev run.
  return hyperliquidClient.placeOrder(order);
}
```

**Agent finding**

```
ID: LA-QG-DEMO-05
Severity: Critical
Category: Blockchain / Trading Safety
File: server/src/execution.ts
Location: submitOrder()
Evidence: submitOrder() calls hyperliquidClient.placeOrder() unconditionally,
  with no check of a paper/live mode flag and no distinction between
  test/dev/CI execution and a real trading session.
Impact: Running this function from a local dev environment, an automated
  test, or CI would submit a real order against production trading
  infrastructure — potential direct loss of funds and violates the
  requirement that dev/test runs cannot place live trades.
Required correction: Gate execution on an explicit TRADING_MODE (e.g. "paper"
  | "live") that defaults to "paper"; route paper-mode orders to a simulated
  fill path; require an explicit, auditable opt-in for "live"; add a test
  proving that TRADING_MODE=paper (and the default with no env var set)
  never reaches hyperliquidClient.placeOrder().
Blocks gate: Yes
```

---

## Result Summary

| Fixture | Category | Severity | Detected as expected? |
|---|---|---|---|
| 1 | Duplicate logic | Medium | Yes |
| 2 | Missing authorization (IDOR) | Critical | Yes |
| 3 | Hardcoded secret | Critical | Yes |
| 4 | Failing test | High | Yes |
| 5 | Live-trading safety violation | Critical | Yes |

All five fixtures produced a finding in the expected category with a severity consistent
with the agent's severity model (Critical for fund-loss/auth-bypass/secret-exposure risks,
High for a concrete test/CI-blocking defect, Medium for non-blocking redundancy). None of
the fixture code was introduced into `server/src/`; it exists only in this file.
