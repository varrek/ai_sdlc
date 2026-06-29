---
title: "feat: Deterministic Tester role grounding and status reporting"
type: feat
date: 2026-06-29
origin: docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md
---

# feat: Deterministic Tester role grounding and status reporting

## Summary

Add evidence-backed deterministic grounding for the Tester base role (test commands, package-local commands, CI provenance, and fall-open reminders), extend status to report Tester grounding state, and prove via corpus behavior eval that emitted Tester guidance carries actionable test signals. Preserve existing Architect grounding behavior unchanged.

---

## Problem Frame

Only Architect receives deterministic compile-time grounding today. The Tester role tells agents to run tests but does not receive mined test commands, package-local runners, or CI provenance — the facts it needs most. Status reports `roleStates` for Architect only, so operators cannot see whether Tester guidance is generic or evidence-backed.

This slice implements ranked improvement point 4 from the agent/language/tooling research note, scoped to Tester as the first base role beyond Architect.

---

## Requirements

| ID | Requirement |
|----|-------------|
| R1 | Tester role output includes a bounded `## Deterministic project grounding` section when root or package-local test commands are known. |
| R2 | Tester grounding cites CI/miner provenance when `gapClosureProvenance["test-command"]` is `miner` or `ci`. |
| R3 | Tester grounding includes a reminder not to infer runners from bare test directories without toolchain evidence. |
| R4 | When no test command is known (open gap, thin repo), Tester remains generic with no deterministic section. |
| R5 | Architect deterministic grounding behavior is unchanged. |
| R6 | `status` reports Tester grounding state (`generic`, `deterministic`, `llm-authored`, `deterministic+llm`) without treating LLM addenda as deterministic. |
| R7 | Corpus behavior eval scores the `tester` surface for test-command scenarios. |

---

## Key Technical Decisions

- **Shared grounding module:** Extend `src/core/role-grounding.ts` with a role-dispatch entry point; keep Architect logic isolated in its existing function.
- **Tester inputs:** Use `overlay.interviewAnswers["test-command"]`, `overlay.gapClosureProvenance["test-command"]`, and `projectContext.packages[].testCommand` — the same facts gates and standards already use.
- **Monorepo partial resolution:** Emit package-local commands even when the root test-command gap remains open (matches monorepo corpus fixture).
- **Status parity:** Tester `deterministic` when compile would emit grounding; combine with LLM addenda using the same `roleState` helper Architect uses.

---

## Implementation Units

### U1. Tester grounding in compile merge

- **Goal:** Append deterministic Tester guidance during `mergeOverlay`.
- **Requirements:** R1, R2, R3, R4, R5
- **Dependencies:** None
- **Files:** `src/core/role-grounding.ts`, `src/core/merge.ts`
- **Approach:** Add `appendRoleGrounding`, `hasDeterministicTesterGrounding`, and `buildTesterGroundingLines`. Wire merge to pass overlay + projectContext. Preserve `appendArchitectGrounding` unchanged.
- **Test scenarios:**
  - Repo with root `pytest` emits Tester grounding with command and miner/ci provenance when applicable.
  - Monorepo with package commands but open root gap emits package-local commands only.
  - Repo with no test command leaves Tester body unchanged.
  - Architect grounding unchanged for high-confidence and low-confidence fixtures.
- **Verification:** New `tests/core/role-grounding.test.ts` passes.

### U2. Status reporting for Tester

- **Goal:** Surface Tester grounding state in `buildStatus` and `formatStatus`.
- **Requirements:** R6
- **Dependencies:** U1
- **Files:** `src/cli/status.ts`, `tests/cli/status.test.ts`, `tests/customize/deeper-mining.test.ts`
- **Approach:** Derive project context from inspection profile; call `hasDeterministicTesterGrounding`. Extend `roleStates` and formatted output to include `tester=`.
- **Test scenarios:**
  - python-rags reports `tester=deterministic`.
  - thin repo with open test-command gap reports `tester=generic`.
  - Overlay with `roleAddenda.tester` reports `deterministic+llm` when grounding exists.
- **Verification:** Status tests pass.

### U3. Behavior eval and corpus expectations

- **Goal:** Prove generated Tester guidance carries test-command signals.
- **Requirements:** R7
- **Dependencies:** U1
- **Files:** `tests/corpus/behavior-eval.ts`, `tests/corpus/behavior-eval.test.ts`, `tests/corpus/corpus-harness.ts`, `tests/corpus/corpus-expectations.ts`
- **Approach:** Add `tester` to `GuidanceSurface`; load tester agent body in harness; extend scenarios that involve running tests to require the tester surface; add corpus expectations for `testerHasGrounding`.
- **Test scenarios:**
  - python-rags and ts-app scenarios pass with tester surface citing preferred test command.
  - monorepo API/web scenarios pass with package-local commands on tester surface.
  - thin-python-app has no tester grounding section.
- **Verification:** Corpus regression and behavior-eval tests pass.

---

## Scope Boundaries

### Deferred to Follow-Up Work

- Deterministic grounding for Engineer, Reviewer, and Debugger base roles.
- Stable claim-key `explain test-command` CLI.

---

## Sources & Research

- `docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md` (ranked opportunity 4)
- `docs/plans/2026-06-29-004-feat-lfg-improvement-backlog-plan.md` (U4)
- `docs/plans/2026-06-14-003-feat-deeper-mining-and-metrics-plan.md` (Architect grounding pattern)
