---
name: close-gaps
description: Close blocking setup gaps the miner could not resolve — find the real test command and record it in the overlay, then re-run maintain.
---

# /close-gaps

Close **blocking** setup gaps so the repo can reach setup-ready. Today the main
gap is a runnable **test command** when mining and CI could not infer one.

## Invariants

- **Evidence first.** Every answer must cite repo paths (CI workflow, Makefile,
  `package.json` scripts, README, monorepo package roots).
- **Overlay only.** Write answers to `.sdlc/overlay/.customize.yaml` under
  `interviewAnswers` and set `gapClosureProvenance` appropriately (`manual` or
  `ci` when justified).
- **Verify.** Re-run `aisdlc maintain --repo .` (or `customize` → `compile` →
  `smoke`) until `close-gaps` no longer appears in `.sdlc/maintenance-report.json`.

## Flow

1. Read `.sdlc/maintenance-report.json` for the `close-gaps` handoff.
2. Search CI configs, Makefiles, package manifests, and docs for the canonical
   test invocation.
3. Update the overlay; present the diff for human review.
4. Re-run `aisdlc maintain`.
