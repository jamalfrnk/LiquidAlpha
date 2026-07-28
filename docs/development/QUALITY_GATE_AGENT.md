# LiquidAlpha Quality Gate Agent

## Purpose

`liquidalpha-quality-gate` is a repository-native Claude Code subagent that acts as a
mandatory independent review layer between local development and GitHub CI. It combines
the perspective of a senior DevOps engineer, QA automation engineer, architecture
reviewer, application security reviewer, blockchain security reviewer, and CI readiness
gatekeeper into a single review pass.

It exists because CI alone only tells you the build didn't break — it does not tell you
whether the change is correct, safe for a trading application, adequately tested, free of
duplicated logic, or ready for a human to review. This agent fills that gap *before* a
push, a pull request, or a green CI run is trusted.

## Location

```
.claude/agents/liquidalpha-quality-gate.md   # agent definition
.claude/commands/quality-gate.md             # /quality-gate slash command
```

Claude Code auto-discovers subagent definitions under `.claude/agents/*.md` in the
repository and slash commands under `.claude/commands/*.md`. Both are checked into
version control so every contributor and CI-adjacent tooling gets the same reviewer.

## How to Invoke It

From a Claude Code session opened in this repository:

```
/quality-gate              # default mode (see below)
/quality-gate changed      # review uncommitted + staged changes only
/quality-gate branch       # review current branch vs. main
/quality-gate pr 42        # review PR #42's diff + its CI results
/quality-gate security     # same workflow, weighted toward OWASP + blockchain security
/quality-gate fix          # review, then fix confirmed in-scope issues and re-run
```

You can also invoke it directly by name ("run the liquidalpha-quality-gate agent on this
branch") or let Claude Code route to it automatically when you ask things like "is this
ready for CI?" or "review this before I push."

## What It Reviews

The full change surface: frontend/backend source, shared schemas, database access,
market-data adapters, signal generation, risk logic, trading execution, wallet
authentication, WebSocket behavior, notifications, analytics, configuration,
infrastructure code, and the repository changes themselves (diff, new/deleted/renamed
files, dependency and lockfile changes, env vars, migrations, CI workflows, build/test
config, deployment config, docs). See the agent definition's 15-step workflow for the
full checklist (functional logic, redundancy, quality checks, test quality, OWASP,
blockchain/trading security, PII/secrets, API/resource efficiency, DB/migrations, UI/
accessibility, CI readiness, documentation consistency).

## What It Does Not Do

- It does not replace GitHub CI. The deterministic pipeline
  (`.github/workflows/quality-gate.yml`) must run and gate merges on its own, without
  Claude/API access.
- It does not merge pull requests, push to `main`, disable branch protection, or weaken
  checks to force a pass.
- It does not place live trades or use production credentials/secrets during validation.
- It does not modify code unless explicitly told to ("review and fix" or equivalent) —
  default behavior is read-only.
- It does not rewrite Git history.
- It is not a substitute for the repository owner's manual review and merge decision —
  see [DEVELOPMENT_TO_CI_WORKFLOW.md](./DEVELOPMENT_TO_CI_WORKFLOW.md).

## How Decisions Are Made

Every run ends in exactly one gate decision: `PASS`, `PASS WITH WARNINGS`, `FAIL`, or
`BLOCKED`. Findings are classified Critical / High / Medium / Low; any Critical finding is
an automatic `FAIL`. The full severity model and report format are defined in the agent
file itself (`.claude/agents/liquidalpha-quality-gate.md`) so the rubric travels with the
agent rather than drifting out of sync with this doc.

## How Findings Should Be Corrected

1. Read the full report at `artifacts/quality-gate/quality-gate-report.md` (or `.json`
   for tooling).
2. Fix Critical and High findings before opening/updating a PR; treat Medium findings on
   their merits (cumulative risk matters, not just count); Low findings are optional but
   should not silently accumulate.
3. If you want the agent to apply fixes itself, explicitly ask for `/quality-gate fix` (or
   equivalent language) — it will only touch code in scope of the current change, add/
   update tests for what it fixed, and re-run the gate. It will not commit, push, or open
   a PR for you.
4. Re-run `/quality-gate branch` before requesting human review.

## How It Interacts With CI

Two separate layers, deliberately:

| Layer | Runs where | Needs Claude? | Gates merge? |
|---|---|---|---|
| Deterministic checks (build, typecheck, tests, audit, secret scan) | GitHub Actions (`quality-gate.yml`) | No | Yes, via required checks / branch protection |
| Agent-assisted review (this agent) | Local Claude Code session, before push/PR | Yes | Advisory — informs the human reviewer, does not itself gate |

This split means CI keeps working even if Claude/API access is unavailable, while still
getting the deeper reasoning pass locally. See
[DEVELOPMENT_TO_CI_WORKFLOW.md](./DEVELOPMENT_TO_CI_WORKFLOW.md) for the full pipeline.

## How It Interacts With Pull Requests

The agent can review a PR's diff and CI results (`/quality-gate pr <number>`) and can
draft a PR when explicitly instructed, but it never merges one. Use its output alongside
[PULL_REQUEST_CHECKLIST.md](./PULL_REQUEST_CHECKLIST.md) when opening or reviewing a PR.

## Why Manual Merge Approval Remains Required

The agent independently verifies a change, but it does not carry accountability for a
production trading system, does not have full context on business priorities or user
impact, and can be wrong — especially about intent ("is this discrepancy between docs and
code a bug or a deliberate change?"). The repository owner's manual review and merge is
the final control, and this agent is designed to make that review faster and better
informed, not to replace it. `main` is only ever updated by a human clicking merge.

## Known Limitations

See the "Known Limitations" section of the quality-gate report produced during agent
validation, and the summary in this repository's implementation record. In short: newly
created subagent definitions require the Claude Code session to pick up the repository's
`.claude/agents/` directory (a fresh session in this repo, or a restart, is needed before
`/quality-gate` or agent auto-routing will resolve to this specific subagent); until then,
a Claude Code session can still follow the same workflow manually by reading the agent
file directly.
