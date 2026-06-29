---
title: "feat: Corpus-gate Go, Rust, JVM, Ruby, and .NET fixtures"
type: feat
date: 2026-06-29
origin: docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md
parent: docs/plans/2026-06-29-004-feat-lfg-improvement-backlog-plan.md
---

# feat: Corpus-gate Go, Rust, JVM, Ruby, and .NET fixtures

## Summary

Promote the six existing language-ecosystem sample fixtures (`go-app`, `rust-cargo`, `java-maven`, `kotlin-gradle`, `ruby-rails`, `dotnet-app`) from customize unit tests into semantic corpus expectations and deterministic behavior-eval scenarios. No miner changes unless a fixture exposes a real regression.

---

## Problem Frame

Repo-miner language support for Go, Rust, JVM, Ruby, and .NET is implemented and covered by `tests/customize/customize.test.ts`, but the semantic corpus still gates only Python/TS/monorepo/CI edge cases. Without corpus expectations, regressions in test-command provenance, setup readiness, architecture confidence, or emitted role guidance for these ecosystems can slip through while customize tests stay green.

---

## Requirements

| ID | Requirement |
|----|-------------|
| R1 | Each of the six ecosystem fixtures runs `customize → compile → smoke → status` in the corpus harness. |
| R2 | Assertions use semantic invariants: setup/alignment readiness, test-command value and miner provenance, architecture confidence, map paths, and standards/constitution themes. |
| R3 | Ready repos assert `setupReady: true` and `handsOff: true`; low-confidence repos assert `validButNeedsAttention` and omit false architect grounding. |
| R4 | Deterministic behavior-eval scenarios pin test-command signals on constitution and standards for each ready repo; rust-cargo additionally pins map/architect module signals. |
| R5 | Do not change miner behavior unless implementing expectations reveals a real bug. |
| R6 | Corpus regression count and behavior-eval scenarios stay in sync with promoted fixtures. |

---

## Key Technical Decisions

- **Extend existing corpus contracts.** Add six `CorpusExpectation` records following the shape in `tests/corpus/corpus-expectations.ts`; reuse `assertCorpusExpectation`.
- **Behavior eval for flat maps.** Repos without a high-confidence map (go, java, dotnet, kotlin, ruby) use empty `preferredModule` and surfaces `constitution` + `standards` only, matching the `ci-repo` pattern.
- **Low-confidence JVM/Ruby.** `kotlin-gradle` and `ruby-rails` assert `alignmentReady: false`, `architectureConfidence: low`, and low-confidence standards language without architect grounding.
- **No miner edits in happy path.** Probed harness output matches intended product behavior; implementation is test-only.

---

## Implementation Units

### U1. Add ecosystem corpus expectations

- **Goal:** Gate all six fixtures with semantic invariants derived from probed harness output.
- **Requirements:** R1, R2, R3
- **Files:** `tests/corpus/corpus-expectations.ts`, `tests/corpus/corpus-regression.test.ts`
- **Approach:** Append expectations for go, rust, java, kotlin, ruby, dotnet; update fixture count assertion from 9 to 15.
- **Test scenarios:** Each fixture asserts mined test command and `miner` provenance; rust-cargo asserts `src` map and architect grounding; kotlin/ruby assert low-confidence standards; all ready repos assert `handsOff: true`.
- **Verification:** `npm test -- tests/corpus/corpus-regression.test.ts` passes.

### U2. Add behavior-eval scenarios

- **Goal:** Pin module/test-command guidance signals for ecosystem fixtures.
- **Requirements:** R4, R6
- **Files:** `tests/corpus/behavior-eval.ts`, `tests/corpus/behavior-eval.test.ts`
- **Approach:** Add six scenarios mirroring existing ready-repo patterns; rust-cargo includes map and architect surfaces.
- **Test scenarios:** Each scenario passes deterministic signal scoring; no host LLM invocation.
- **Verification:** `npm test -- tests/corpus/behavior-eval.test.ts` passes.

### U3. Full corpus suite verification

- **Goal:** Confirm no cross-fixture regressions.
- **Requirements:** R6
- **Files:** (none beyond U1–U2)
- **Approach:** Run full corpus vitest slice and repository typecheck.
- **Verification:** `npm test -- tests/corpus` and `npm run typecheck` pass.

---

## Scope Boundaries

- Does not add new sample-repo fixtures or broaden miner detection.
- Does not implement Behavior Eval v2 host-agent scenarios.
- Does not change architect grounding for flat single-file ecosystems unless a bug is found.

### Deferred to Follow-Up Work

- Expanding architect deterministic grounding to flat Go/Java/.NET repos (role-grounding slice).
- Additional negative corpus fixtures for bare `test/` directories in Go/Ruby (already covered in customize tests).

---

## Sources & Research

- `docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md` (ranked opportunity #2)
- `docs/plans/2026-06-29-004-feat-lfg-improvement-backlog-plan.md` (U2)
- `docs/plans/2026-06-29-003-feat-corpus-behavior-validation-plan.md` (corpus patterns)
- Probed harness output from ecosystem fixtures on 2026-06-29
