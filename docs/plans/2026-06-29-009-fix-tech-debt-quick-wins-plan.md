---
title: "fix: Address tech debt quick wins"
type: fix
date: 2026-06-29
---

# fix: Address tech debt quick wins

## Summary

This plan fixes a reviewable subset of `TECH_DEBT_AUDIT.md`: setup-readiness validation, CI/Makefile test-command inference consistency, standards drift detection, persisted eval-state validation, repository cache symlink error handling, and doc-gardener link scanning.

The slice favors small, test-backed repairs over large architectural refactors. Larger audit findings such as gate runtime `npx` removal, adapter gate template deduplication, and `repo-miner.ts` modularization remain deferred because they need broader design and golden-output review.

---

## Problem Frame

The audit identified several high- and medium-severity issues that can be fixed without reshaping the compiler architecture. These issues share a pattern: weak boundary validation or inconsistent parsing causes the repo to accept bad state, infer the wrong setup command, or report false documentation errors.

The product strategy depends on evidence-backed setup and reliable drift detection. These fixes make the existing setup chain more trustworthy while preserving current CLI and adapter contracts.

---

## Requirements

### Setup Readiness And Mining

- R1. A `test-command` interview answer must close the setup gap only when it is non-empty after trimming.
- R2. GitHub Actions test-command mining must rank jobs consistently instead of accepting whichever job happens to appear first.
- R3. Makefile test-command mining must ignore setup/install recipe lines and return an actual test command when one is present.

### Drift And Persistence

- R4. Standards drift detection must report evidence or scope changes, not only statement text changes.
- R5. Loop behavior eval state must reject invalid result payloads before writing corrupt YAML.

### Error Handling And Documentation Hygiene

- R6. Repository cache symlink scanning must convert filesystem failures into structured materialization failures instead of throwing uncaught errors.
- R7. Doc-gardener link scanning must ignore markdown code spans and fenced code blocks so regex examples are not reported as reference-style links.

---

## Key Technical Decisions

- KTD1. Keep the slice inside existing modules and public contracts. The fixes should not split `repo-miner.ts`, move CLI commands, or change adapter output behavior in this PR.
- KTD2. Treat validation failures as close to the boundary as possible. Empty setup answers fail in gap computation, invalid eval results fail at write time, and symlink scan I/O errors return a cache failure.
- KTD3. Reuse existing parser helpers where possible. GitHub workflow and Makefile fixes should use existing ranking and `pickTestSegment` behavior rather than introducing a second command parser.
- KTD4. Preserve best-effort behavior where it is intentional. Mining malformed CI YAML can still return `undefined`; repository cache materialization should return structured failures rather than crashing.

---

## Scope Boundaries

### In Scope

- Fix `TECH_DEBT_AUDIT.md` findings F003, F005, F008, F010, F031, F033, and F043.
- Add focused regression tests for each changed behavior.
- Keep existing CLI commands and emitted file shapes compatible.

### Deferred to Follow-Up Work

- F001/F002: Split and optimize `src/customize/repo-miner.ts`.
- F017/F018/F027: Add full loop trace event schema validation and `record-event` test extraction.
- F019/F020/F021/F024: Deduplicate approved-gate scripts and remove runtime `npx`.
- F022/F023: Harden generated host gate policy parse and Copilot workflow YAML emission.
- F029/F030/F034/F035/F036: Broader eval and bench error taxonomy coverage.

### Non-Goals

- Do not change generated adapter snapshots unless a fix directly requires it.
- Do not add new dependencies.
- Do not run network-dependent external repository evals.

---

## Implementation Units

### U1. Tighten Setup Gap Closure

- **Goal:** Ensure empty `test-command` answers do not mark setup ready.
- **Requirements:** R1.
- **Dependencies:** None.
- **Files:** `src/customize/gap-interview.ts`, `tests/customize/customize.test.ts` or `tests/customize/deeper-mining.test.ts`.
- **Approach:** Update the gap predicate to require a non-empty trimmed answer when mining does not provide a command. Add a regression test that an empty or whitespace-only answer still leaves the `test-command` gap open.
- **Patterns to follow:** Existing `computeGaps` tests and the overlay answer merge behavior in customize tests.
- **Test scenarios:** A mined command closes the gap; a non-empty manual answer closes the gap; an empty manual answer does not close the gap.
- **Verification:** Setup-readiness cannot be reached with an empty manual test command.

### U2. Normalize Test Command Inference

- **Goal:** Make CI and Makefile test-command mining select the intended runnable test command consistently.
- **Requirements:** R2, R3.
- **Dependencies:** None.
- **Files:** `src/customize/repo-miner.ts`, `tests/customize/customize.test.ts`, `tests/customize/deeper-mining.test.ts`.
- **Approach:** Sort GitHub workflow jobs using the existing workflow rank logic before scanning steps. Run Makefile recipe lines through `pickTestSegment`, allowing setup/install commands to be skipped in favor of real test commands.
- **Patterns to follow:** E2E workflow job ranking and GitLab CI job sorting already present in `src/customize/repo-miner.ts`.
- **Test scenarios:** A workflow with a generic build job before a test job chooses the test job; a Makefile `test:` target with install/setup before a test command returns the test command; existing package script and runner-default behavior remains unchanged.
- **Verification:** Test-command evidence and command selection remain deterministic across CI and Makefile sources.

### U3. Detect Evidence-Level Standards Drift

- **Goal:** Make standards drift reviewable when statement text is stable but sources or scope change.
- **Requirements:** R4.
- **Dependencies:** None.
- **Files:** `src/customize/emitters.ts`, `tests/customize/customize.test.ts` or a focused emitter test file.
- **Approach:** Compare standards by statement while also checking normalized `scope` and sorted `sources`. Preserve the current added/removed output and set `changed` when evidence or scope differs.
- **Patterns to follow:** Existing `StandardsIndex` shape and deterministic sorting conventions in emitters.
- **Test scenarios:** Same statements and same evidence produce no drift; changed sources produce `changed: true`; changed scope produces `changed: true`; added/removed statements still populate the existing arrays.
- **Verification:** Re-runs surface evidence drift without rewriting unrelated overlay fields.

### U4. Validate Loop Behavior Eval Writes

- **Goal:** Prevent invalid loop behavior eval result payloads from being written.
- **Requirements:** R5.
- **Dependencies:** None.
- **Files:** `src/eval/loop-behavior-eval-state.ts`, `tests/eval/loop-behavior-eval-state.test.ts`.
- **Approach:** Reuse the existing `isEvalResult` validator before writing state. Throw a clear error for invalid results and update the existing test to expect write-time rejection.
- **Patterns to follow:** Existing read-time validation in `readLoopBehaviorEvalState`.
- **Test scenarios:** Valid results still round-trip; missing `score` rejects before writing; after rejection no corrupt state file is accepted by the reader.
- **Verification:** Invalid eval-state producers fail fast and do not leave corrupt YAML as the durable state.

### U5. Structure Symlink Scan Failures

- **Goal:** Keep repo cache materialization failures inside the existing result object when symlink scanning hits filesystem errors.
- **Requirements:** R6.
- **Dependencies:** None.
- **Files:** `src/eval/repo-cache.ts`, `tests/eval/repo-cache.test.ts`.
- **Approach:** Catch `realpathSync`, `readdirSync`, and `lstatSync` failures inside symlink scanning and return a failure message that classifies as `workflow-error`. Add a fixture or temp-dir test with a dangling symlink when the platform supports it.
- **Patterns to follow:** Existing `materializeRepo` structured `{ ok: false, failureClass, message }` path.
- **Test scenarios:** Outbound symlinks still fail; dangling symlinks return `workflow-error`; normal repositories still materialize successfully.
- **Verification:** Bench/cache callers receive structured failures instead of uncaught filesystem exceptions.

### U6. Ignore Code Spans In Doc Link Scanning

- **Goal:** Stop doc-gardener from treating regex examples inside markdown code as reference-style links.
- **Requirements:** R7.
- **Dependencies:** None.
- **Files:** `src/garden/doc-gardener.ts`, `tests/garden/doc-gardener.test.ts`.
- **Approach:** Mask fenced code blocks and inline code spans before extracting markdown links. Keep real links outside code blocks unchanged.
- **Patterns to follow:** Existing pure helper style in `doc-gardener.ts` and current broken-link tests.
- **Test scenarios:** A regex like ``^[a-z][a-z0-9-]*$`` in a code span is ignored; fenced code with markdown-looking text is ignored; a real missing reference link outside code still reports an error.
- **Verification:** Running doc gardening on current docs no longer reports the `docs/packs.md` regex false positive.

---

## Risks & Dependencies

- **Parser regressions:** Test-command inference is subtle across languages and CI systems. Mitigate with focused tests and by reusing existing helpers.
- **Behavior compatibility:** Empty manual answers may previously have let setup continue. This is intended because an empty command cannot satisfy the tests-must-pass gate.
- **Filesystem portability:** Symlink tests can be platform-sensitive. Keep the test conditional or use Node APIs that work in the current Linux CI target.
- **Drift output shape:** `StandardsDrift` currently has only added, removed, and changed. This slice should avoid widening the public shape unless implementation shows a strong need.

---

## Documentation / Operational Notes

`TECH_DEBT_AUDIT.md` remains the source for the broader backlog. This plan intentionally fixes only the small, test-backed items that can land together without reshaping architecture.

---

## Sources & Research

- `TECH_DEBT_AUDIT.md` findings F003, F005, F008, F010, F031, F033, and F043 define the active scope.
- `README.md` and `STRATEGY.md` frame setup-ready and evidence-backed setup as product-critical.
- `CONCEPTS.md` defines setup-ready, standards index, drift, loop trace, and behavior-level eval.
- `docs/solutions/design-patterns/round-trip-editable-generated-config.md` reinforces preserving user-owned state while regenerating machine-owned evidence.
