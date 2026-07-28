---
description: Run the LiquidAlpha Quality Gate independent review before push/PR/CI.
argument-hint: "[changed|branch|pr|security|fix]"
---

Run the `liquidalpha-quality-gate` subagent (see `.claude/agents/liquidalpha-quality-gate.md`)
against this repository. Use the Agent tool with `subagent_type: liquidalpha-quality-gate`.

Argument received: `$ARGUMENTS`

Map the argument to an invocation mode and tell the subagent explicitly which one to run:

- (no argument) → default mode: if there are uncommitted/staged changes review those
  first, then also run a full branch-vs-`main` review; otherwise run branch review against
  `main` directly.
- `changed` → "Run the LiquidAlpha quality gate against all uncommitted and staged
  changes."
- `branch` → "Run the LiquidAlpha quality gate against the current branch compared with
  main, using the correct merge base."
- `pr` or `pr <number>` → "Run the LiquidAlpha quality gate against the pull request diff
  and associated CI results." If a PR number is given, fetch it with `gh pr view
  <number>` / `gh pr diff <number>` first.
- `security` → "Run the LiquidAlpha quality gate with emphasis on OWASP and blockchain
  security (Steps 8-10)."
- `fix` → "Run the LiquidAlpha quality gate, fix confirmed in-scope defects, add
  regression tests, and rerun the gate." Only the subagent may edit files, and only in
  this mode.

The subagent must produce `artifacts/quality-gate/quality-gate-report.md` and
`artifacts/quality-gate/quality-gate-report.json`, end with exactly one gate decision
(PASS / PASS WITH WARNINGS / FAIL / BLOCKED), and must never push, merge, or commit
unless this invocation explicitly said so.

After the subagent finishes, summarize for the user: the decision, the count of findings
by severity, and the path to the full report.
