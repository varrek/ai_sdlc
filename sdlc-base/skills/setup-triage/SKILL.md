---
name: setup-triage
description: Diagnose and fix setup-ready failures after maintain's compile/smoke chain — missing artifacts, gate failures, or stale phases.
---

# /setup-triage

Use when `aisdlc maintain` reports the repo is **not setup-ready** after the
deterministic customize → compile → smoke chain.

## Invariants

- **Status first.** Run `aisdlc status --repo .` and read smoke log paths from
  maintain output.
- **Fix root cause.** Repair overlay, re-compile, or restore emitted artifacts —
  do not weaken gates in prose.
- **Verify.** Re-run `aisdlc maintain` until setup-ready or a different skill
  handoff replaces this one.

## Flow

1. Read `.sdlc/maintenance-report.json` and `aisdlc status` output.
2. If compile artifacts are missing → `aisdlc compile --overlay … --out .`.
3. If smoke checks fail → read `.sdlc/smoke/` logs; fix overlay/schema issues.
4. If blocking gaps remain → invoke `close-gaps` instead of guessing here.
5. Re-run `aisdlc maintain`.
