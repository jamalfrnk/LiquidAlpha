# Development-to-CI Workflow

LiquidAlpha's repository operating model:

```
Developer
    ↓
Local implementation and tests
    ↓
LiquidAlpha Quality Gate Agent   (.claude/agents/liquidalpha-quality-gate.md)
    ↓
GitHub CI                        (.github/workflows/quality-gate.yml)
    ↓
Draft pull request
    ↓
Manual human review
    ↓
Manual merge
```

## Ground Rules

- **GitHub is canonical.** `jamalfrnk/LiquidAlpha` on GitHub is the source of truth.
- **Local is the workspace.** Your local checkout is where you write and iterate.
- **Replit is reference-only.** Replit is a functional test environment, never the
  canonical source, and never the deploy target for production trading.
- **Feature branches only.** All development happens on a feature branch. Direct
  development on `main` is prohibited — the quality gate agent will fail a review
  performed directly on `main` unless the run is strictly read-only.
- **Draft PRs, not direct pushes to main.** Claude Code may create a draft pull request
  when explicitly instructed. It never merges one.
- **Manual merge, always.** The repository owner reviews and merges every PR by hand.
- **No live trading during validation.** Nothing in this pipeline — local dev, the
  quality gate agent, or CI — may trigger production trading functionality.

## Stage by Stage

### 1. Local implementation and tests

Work on a feature branch (`git checkout -b feature/<short-description>`). Write/adjust
code and tests. Run what's available locally (`npm run build --prefix server`, and `npm
test` / `npm run lint` once those scripts exist).

### 2. LiquidAlpha Quality Gate Agent

Before pushing, run `/quality-gate branch` (or `changed` while mid-edit, or `security` for
a security-focused pass). This is an independent review — it does not trust your PR
description, it re-derives what the change does from the diff and checks it against
architecture, tests, security, and CI readiness. See
[QUALITY_GATE_AGENT.md](./QUALITY_GATE_AGENT.md) for full detail.

Resolve Critical/High findings. Use `/quality-gate fix` if you want the agent to apply
confirmed in-scope fixes itself, then re-run the gate.

### 3. GitHub CI

Push the branch. `.github/workflows/quality-gate.yml` runs the **deterministic** checks —
lockfile-enforced install, lint (once configured), type check/build, tests (once
configured), dependency audit, migration sanity check, and a secret scan — with no
dependency on Claude/API access. This is the pipeline that actually gates merges via
branch protection / required checks.

### 4. Draft pull request

Open a draft PR against `main`. Include the quality gate's decision and a summary of
findings in the PR description (see
[PULL_REQUEST_CHECKLIST.md](./PULL_REQUEST_CHECKLIST.md)). Mark it ready for review once
CI is green and Critical/High findings are resolved.

### 5. Manual human review

The repository owner reviews the diff, the quality gate report, and CI results. The
agent's review is advisory input to this step, not a replacement for it — see
"Why manual merge approval remains required" in
[QUALITY_GATE_AGENT.md](./QUALITY_GATE_AGENT.md).

### 6. Manual merge

Only the repository owner merges, and only into `main`. No automated actor — including
the quality gate agent — merges a PR.

## Deterministic CI vs. Agent-Assisted Review

| | Deterministic CI | Agent-assisted review |
|---|---|---|
| Runs | GitHub Actions, every push/PR | Local Claude Code session, on demand |
| Needs Claude | No | Yes |
| Checks | Build, typecheck, lint, tests, dependency audit, secret scan, migration sanity | Architecture, duplicate-logic, business-logic correctness, risk-model review, blockchain workflow review, doc consistency, missing-test detection, CI-failure interpretation |
| Gates merge | Yes, via branch protection / required checks | No — informs the human reviewer |

Keeping these separate means CI keeps working (and keeps gating merges) even when Claude
or API access is unavailable; the deeper reasoning pass happens locally where it can also
read files, run commands, and iterate.
