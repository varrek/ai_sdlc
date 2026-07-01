---
title: "feat: Agent skills description extension (Tracks A–B)"
type: feat
date: 2026-06-30
origin: docs/brainstorms/2026-06-30-agent-skills-description-extension-requirements.md
---

# feat: Agent skills description extension (Tracks A–B)

## Summary

Ship Track A (deterministic Reviewer, Debugger, and flat Architect grounding) and Track B (Behavior Eval v2 scenario extension). Defer Tracks C–E until eval report R13 gates downstream work.

---

## Problem Frame

The 10-repo bench shows uneven personalization: Tester and Engineer carry mined commands; Reviewer and Debugger stay generic; flat/low-map repos lack Architect map grounding. This plan closes the deterministic grounding gap and proves guidance quality via extended v2 scenarios before templated addenda, pack skills, or description suffix experiments.

---

## Requirements (this phase)

| ID | Requirement | Track |
|----|-------------|-------|
| R1 | Reviewer deterministic grounding from linters, map, architecture standards | A |
| R2 | Debugger deterministic grounding from test commands + CI pointer + read-only reminder | A |
| R3 | Architect standards-based grounding when map empty but actionable standards exist | A |
| R4 | Grounding respects caps and addenda contract | A |
| R5 | `aisdlc status` reports Reviewer/Debugger deterministic states | A |
| R6 | Corpus expectations for flat Architect + Reviewer/Debugger on ready fixtures | A |
| R8 | v2 scenarios for Tester/Engineer surfaces on 2+ fixtures | B |
| R9 | v2 scenarios scoring Reviewer/Debugger grounding | B |
| R10 | ≥3 ecosystem fixtures (Go, Rust, JVM) in v2 gate | B |
| R12 | `improvement: true` on all pinned v2 scenarios | B |
| R13 | Tracks C–E deferred; document in plan residual | — |

---

## Implementation Units

### U1. Role grounding extensions

- **Files:** `src/core/role-grounding.ts`, `tests/core/role-grounding.test.ts`
- **Approach:** Add `hasDeterministicArchitectGrounding`, `hasDeterministicReviewerGrounding`, `hasDeterministicDebuggerGrounding`; extend `appendRoleGrounding` for architect standards-based, reviewer, debugger paths.
- **Verification:** Unit tests + corpus regression.

### U2. Status role states

- **Files:** `src/cli/status.ts`
- **Approach:** Wire new grounding helpers; include debugger in groundable role count.
- **Verification:** Status tests if present; corpus smoke.

### U3. Corpus expectations

- **Files:** `tests/corpus/corpus-expectations.ts`
- **Approach:** Update `ci-repo`, `kotlin-gradle` for standards-based architect; add reviewer/debugger expectations on `go-app`.
- **Verification:** `npm test -- tests/corpus/corpus-regression.test.ts`

### U4. Behavior eval v2 extension

- **Files:** `tests/corpus/behavior-eval-v2.ts`, `tests/corpus/behavior-eval-v2.test.ts`, `src/eval/setup-chain.ts`
- **Approach:** Extend guidance bundle with role agents; add Go/Rust/JVM localization + lint/reproduce scenarios.
- **Verification:** `npm test -- tests/corpus/behavior-eval-v2.test.ts`

---

## Deferred (Tracks C–E)

- Templated deterministic `roleAddenda` (R14–R18)
- Ecosystem pack skill descriptions (R19–R23)
- Description suffix experiment (R24–R27)

Gate: phase-B eval report with `improvement: true` on all pinned scenarios before merging downstream tracks.

---

## Test plan

- [ ] `npm test`
- [ ] Corpus regression (16 fixtures)
- [ ] Behavior eval v2 all scenarios pass with improvement flag
