# Pull Request Checklist

Copy this into every PR description. See [QUALITY_GATE_AGENT.md](./QUALITY_GATE_AGENT.md)
and [DEVELOPMENT_TO_CI_WORKFLOW.md](./DEVELOPMENT_TO_CI_WORKFLOW.md) for the workflow this
supports.

```markdown
## Quality Gate Decision
<!-- PASS / PASS WITH WARNINGS / FAIL / BLOCKED, from artifacts/quality-gate/quality-gate-report.md -->

## Scope
- [ ] This PR is focused on a single change; unrelated changes are not mixed in
- [ ] No direct commits to `main` — this branch was created from `main` and targets `main`

## Tests
- [ ] Tests were added or updated for this change (or N/A, with reason)
- [ ] Regression test added for any bug fix

## Local / CI Checks
- [ ] Lint passes (or N/A — not yet configured)
- [ ] Type check / build passes
- [ ] Unit + integration tests pass (or N/A — not yet configured)

## Security
- [ ] No secrets, API keys, tokens, or PII introduced (checked diff, not just final files)
- [ ] Authentication and authorization reviewed for any changed endpoint or query
- [ ] OWASP impact reviewed (injection, IDOR, XSS/CSRF/SSRF, rate limits, error disclosure)
- [ ] Blockchain/trading impact reviewed (signing, nonces, slippage/price checks, risk
      rules before order construction, no default-live-trading, no ambiguous-failure retry)

## Data
- [ ] Database migration included and reviewed, if schema changed (rollback/backfill plan
      documented for anything destructive or incompatible)
- [ ] API and resource efficiency reviewed (no N+1 queries, no duplicated polling,
      no unbounded retries, no LLM calls in a tick loop)

## Trading Safety
- [ ] Paper/test runs cannot reach a live-trading or production-transaction path
- [ ] Risk limits (position size, leverage, risk/reward minimum) are enforced before
      order construction, not after

## UX
- [ ] Accessibility reviewed for any UI change (keyboard nav, focus, labels, color-only
      status, reduced motion) — screenshot attached for material UI changes

## Documentation
- [ ] README / env-var docs / API docs / architecture docs updated if this change affects
      them
- [ ] No documentation claims functionality that isn't actually implemented/validated

## Rollback
- [ ] Rollback or mitigation plan considered for this change (how do we back this out or
      contain it if it's wrong in production?)
```
