---
title: "feat: Expand corpus and behavior-oriented validation"
type: feat
status: active
date: 2026-06-29
origin: CONCEPTS.md (Corpus, Behavior-Level Eval)
---

# feat: Expand corpus and behavior-oriented validation

## Summary

Expand the checked-in semantic corpus regression harness to cover all existing sample-repo fixtures, assert product guarantees instead of byte snapshots, and add a deterministic behavior-eval scaffold that scores whether generated guidance carries the signals agents need for pinned scenarios — without invoking a host LLM.

---

## Problem Frame

Roadmap item 3 follows the deeper-mining corpus work (U4) that landed three fixtures: `fastapi-like`, `vite-like`, and `ambiguous-architecture`. Six additional sample repos (`python-rags`, `ts-app`, `monorepo`, `ci-repo`, `streamlit-venv`, `thin-poc`) exercise real product shapes — Makefile/pyproject mining, CI provenance, workspace package maps, low-confidence CI-only roots, and honest open gaps — but are not yet regression-gated.

Without coverage, regressions in per-package test commands, hands-off provenance, alignment-ready gating, or deterministic Architect grounding can slip through while the three original fixtures stay green.

---

## Requirements

| ID | Requirement |
|----|-------------|
| R1 | Every checked-in sample-repo fixture runs `customize → compile → smoke → status` in an isolated temp copy. |
| R2 | Assertions use semantic invariants (readiness, confidence, map paths, test-command provenance, standards themes) — not full-file snapshots. |
| R3 | Ready repos assert setup-ready and alignment-ready; gap repos assert open blocking gaps and no false setup-ready. |
| R4 | Monorepo asserts per-package test commands and map rows without requiring a root-level test command. |
| R5 | CI-mined test commands report `ci` provenance and hands-off when setup-ready. |
| R6 | Low-confidence and thin repos omit deterministic Architect grounding. |
| R7 | A deterministic behavior-eval scaffold scores pinned module/test-command scenarios from generated artifacts. |
| R8 | Behavior eval stays local, cheap, and free of host LLM calls in v1. |

---

## Key Technical Decisions

- **Shared harness module.** Extract `copyFixture`, `runSetup`, and artifact types into `tests/corpus/corpus-harness.ts` so regression and behavior tests share one pipeline.
- **Declarative expectations.** Each fixture gets a `CorpusExpectation` record in `tests/corpus/corpus-expectations.ts`; the regression test iterates and asserts via a single `assertCorpusExpectation` helper.
- **Behavior eval as signal scoring.** `tests/corpus/behavior-eval.ts` checks whether constitution, Architect grounding, project-context map, and standards cite the module and test command a pinned scenario expects. This is the merge-gate precursor to future agent-trace comparison.
- **No plugin-mode scope.** This slice does not touch Plugin Mode / item 1 implementation.

---

## Implementation Units

### U1. Corpus harness and expectations

- **Files:** `tests/corpus/corpus-harness.ts`, `tests/corpus/corpus-expectations.ts`
- **Approach:** Move setup pipeline from the existing regression test; define semantic contracts per fixture.
- **Verification:** Focused corpus vitest slice passes.

### U2. Expand regression coverage

- **Files:** `tests/corpus/corpus-regression.test.ts`
- **Approach:** Parameterize over all nine fixtures; keep existing FastAPI/Vite/adversarial invariants.
- **Verification:** `npm test -- tests/corpus` and `npm run typecheck`.

### U3. Behavior-eval scaffold

- **Files:** `tests/corpus/behavior-eval.ts`, `tests/corpus/behavior-eval.test.ts`
- **Approach:** Pin scenarios for ready repos; score artifact surfaces; fail with actionable missing-signal reasons.
- **Verification:** Behavior eval tests pass alongside corpus regression.

---

## Residual Risks

- Monorepo root `test-command` gap leaves `setupReady: false` by design; behavior eval must not assume setup-ready for workspace-only command coverage.
- `ci-repo` is alignment-not-ready (low architecture confidence); scenarios should treat test-command signals separately from map confidence.
- Future host-LLM behavior eval may need flake controls not addressed in this deterministic scaffold.
