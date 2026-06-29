---
title: "feat: Evidence-backed Playwright and Cypress E2E tool detection"
type: feat
date: 2026-06-29
origin: docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md
---

# feat: Evidence-backed Playwright and Cypress E2E tool detection

## Summary

Add fixture-backed, evidence-gated detection for frontend E2E tools (Playwright and Cypress) in the repo miner. Unit-test runners remain primary for `testCommand`; E2E tools and commands are surfaced separately so agents do not conflate vitest/jest with browser automation.

---

## Problem Frame

Improvement point 10 lists many ecosystems; broad manifest detection without fixtures is explicitly out of scope. The frontend pack already assumes Playwright for UI smoke checks, but the miner does not recognize Playwright or Cypress from repo evidence. Agents may miss E2E workflows or treat a bare `e2e/` directory as toolchain proof.

The first slice targets Playwright/Cypress only — the research note's suggested frontend E2E path — with corpus-backed validation before any PHP, mobile, or Bazel expansion.

---

## Requirements

| ID | Requirement | Verification |
|----|-------------|--------------|
| R1 | Assert `playwright` in `tools` when `@playwright/test` or `playwright.config.*` is present; record `tool:playwright` evidence. | Fixture + unit test |
| R2 | Assert `cypress` in `tools` when `cypress` is in deps or `cypress.config.*` exists; record `tool:cypress` evidence. | Fixture + unit test |
| R3 | Bare `e2e/` directories without manifest/config signals must not infer Playwright or Cypress. | Negative unit test |
| R4 | `testCommand` stays the unit-test command when both vitest and Playwright are present. | Fixture + unit test |
| R5 | When an E2E script or CI job evidences a command, surface `e2eTestCommand` separately with provenance in evidence. | Fixture + unit test |
| R6 | Standards index emits E2E tool guidance with cited sources when tools or `e2eTestCommand` are known. | Emitter test |
| R7 | Extend `TEST_TOOL` / CI parsing to recognize `playwright test` and `cypress run` for E2E command mining only. | Unit test |

---

## Key Technical Decisions

- **Separate `tools` and `e2eTestCommand` from `testRunner` / `testCommand`:** E2E browser automation is not the primary suite; conflating it with vitest/pytest would regress setup quality.
- **Evidence gating mirrors existing framework rules:** deps, config files, or explicit scripts/CI — never directory names alone.
- **Single fixture slice:** one Playwright-primary fixture with vitest unit tests; Cypress covered by focused unit test with inline tmp dir (same pattern as optional-dep tests).
- **Corpus promotion:** add the Playwright fixture to corpus expectations asserting tool presence and unit-test command unchanged.

---

## Scope Boundaries

### In scope

- `tools[]`, `e2eTestCommand`, evidence keys, standards emission, Playwright fixture, customize tests, corpus expectation.

### Deferred to Follow-Up Work

- PHP/Composer/Laravel, mobile manifests, Bazel, Nix, Angular/Vue/Svelte framework detection.
- Dedicated Cypress sample-repo fixture (inline tmp test suffices for v1).
- Behavior-level agent eval for E2E command selection.

---

## Implementation Units

### U1. Extend RepoProfile and miner detection

- **Goal:** Detect Playwright/Cypress tools and optional E2E commands with evidence.
- **Requirements:** R1, R2, R3, R4, R5, R7
- **Dependencies:** None
- **Files:** `src/customize/repo-miner.ts`
- **Approach:** Add `tools: string[]` and optional `e2eTestCommand` to `RepoProfile`. In the JS/TS mining block, detect Playwright/Cypress from deps and config filenames. Add `resolveE2eTestCommand` (package.json `test:e2e` / `e2e` scripts, then CI jobs whose names or steps reference e2e/playwright/cypress). Extend `TEST_TOOL` for playwright/cypress invocations. Keep `resolveTestCommand` unchanged for unit tests.
- **Patterns to follow:** Existing framework and test-runner detection in the JS/TS block; `addEvidence` conventions.
- **Test scenarios:** Playwright fixture asserts `tools` includes `playwright`, `testRunner` is `vitest`, `testCommand` is unit test; bare `e2e/` dir only does not set tools; Cypress tmp repo with `cypress.config.ts` asserts `cypress` tool.
- **Verification:** Focused customize tests pass.

### U2. Emit standards for E2E tools

- **Goal:** Surface mined E2E facts in the standards index.
- **Requirements:** R6
- **Dependencies:** U1
- **Files:** `src/customize/emitters.ts`, `tests/customize/customize.test.ts`
- **Approach:** Emit standards for each tool (`tool:*` evidence) and for `e2eTestCommand` when present, scoped like linters/frameworks.
- **Patterns to follow:** Existing `buildStandardsIndex` loops for linters and frameworks.
- **Test scenarios:** Playwright fixture standards include playwright and cite `package.json` or config path.
- **Verification:** customize test asserts standards content and sources.

### U3. Playwright fixture and corpus gate

- **Goal:** Durable regression fixture and corpus expectation.
- **Requirements:** R1, R4, R6
- **Dependencies:** U1, U2
- **Files:** `tests/fixtures/sample-repos/ts-playwright-e2e/**`, `tests/corpus/corpus-expectations.ts`
- **Approach:** Add a TS repo with vitest unit tests, Playwright dep + config, `test:e2e` script, and optional CI workflow. Register corpus expectation for setup-ready, vitest command, and playwright in standards.
- **Patterns to follow:** `ts-app` fixture shape; existing corpus expectation entries.
- **Test scenarios:** Corpus regression passes for new fixture; hands-off setup-ready when gaps are closed.
- **Verification:** `tests/corpus/corpus-regression.test.ts` passes.

---

## Sources & Research

- `docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md` (point 10)
- `docs/plans/2026-06-29-004-feat-lfg-improvement-backlog-plan.md` (U8 deferred-track slice)
- `packs/frontend/` (Playwright integration contract)
