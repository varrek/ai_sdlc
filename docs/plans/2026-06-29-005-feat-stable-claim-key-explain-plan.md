---
title: "feat: Stable claim-key explain for test-command and architecture"
type: feat
date: 2026-06-29
origin: docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md
---

# feat: Stable claim-key explain for test-command and architecture

## Summary

Extend `aisdlc explain` with stable claim keys `test-command` and `architecture` so users and harnesses can inspect mined claims without relying on numbered standard order. Preserve existing numeric explain behavior.

---

## Problem Frame

Numbered `aisdlc explain <n>` ties evidence inspection to the order standards appear in `status`, which shifts when new standards are mined. Stable claim keys align with miner evidence keys (`test-command`, `architecture:*`) and support debugging, trust, and future behavior eval.

---

## Requirements

- R1. `aisdlc explain test-command` reports the resolved command (or gap), provenance, positive evidence paths, and deterministic negative signals when the claim is weak or absent.
- R2. `aisdlc explain architecture` reports confidence, primary root/modules, positive architecture evidence, and rejected (demoted) roots as negative evidence.
- R3. Existing `aisdlc explain <n>` numeric behavior remains unchanged.
- R4. Uninitialized repos fail cleanly like numeric explain.
- R5. Unknown claim keys fail with a helpful message listing supported keys.

---

## Key Technical Decisions

- **Claim routing in CLI:** Parse the positional arg as an integer for numeric explain; otherwise match against a fixed allowlist (`test-command`, `architecture`).
- **Evidence source:** Reuse `inspectRepo` profile + overlay (same as numeric explain) — no new mining paths.
- **Negative evidence for test-command:** Derived deterministically from profile state (open gap, separate test layout without runner/command, runner without resolved command) rather than new miner storage.
- **Negative evidence for architecture:** Use `architecture.demotedRoots` plus low-confidence `reasons`; omit fabricated rejected paths.

---

## Implementation Units

### U1. Claim-key explain core

- **Goal:** Add `explainClaim` with formatters for `test-command` and `architecture`.
- **Requirements:** R1, R2, R4
- **Dependencies:** None
- **Files:** `src/cli/explain.ts`
- **Approach:** Export claim key constants, `isExplainClaimKey`, and `explainClaim`. Format positive/negative sections consistently with numeric explain's Sources block.
- **Patterns to follow:** `explainStandard` in `src/cli/explain.ts`; architecture demotion in `src/customize/repo-miner.ts`.
- **Test scenarios:**
  - Ready repo (`python-rags`): `test-command` shows command and positive CI/manifest paths.
  - Low-confidence repo (`ambiguous-architecture`): `architecture` shows low confidence, reasons, and no high-confidence module map.
  - `fastapi-like`: `architecture` lists `docs_src` under negative (demoted) evidence.
  - Not initialized: both keys return the same customize-first message as numeric explain.
- **Verification:** Unit tests pass for all scenarios.

### U2. CLI wiring and docs

- **Goal:** Wire claim keys through CLI and update help text.
- **Requirements:** R3, R5
- **Dependencies:** U1
- **Files:** `src/cli/index.ts`, `tests/cli/explain.test.ts`, `tests/customize/deeper-mining.test.ts` (numeric regression only if needed)
- **Approach:** Update `cmdExplain` to branch on claim key vs number; extend HELP string.
- **Test scenarios:**
  - Numeric explain still works for in-range and out-of-range numbers.
  - Unknown key `aisdlc explain language:rust` fails with supported-key hint.
- **Verification:** CLI tests and existing deeper-mining explain tests pass.

---

## Scope Boundaries

- Defer additional claim keys (`language:rust`, `ci.github-actions`, etc.) until these two are validated.
- No miner schema changes in this slice.

### Deferred to Follow-Up Work

- Full claim-key catalog and alias map (`architecture.primary-roots`, `architecture.rejected-roots`).
- Behavior-eval harness integration for claim-key explain.

---

## Risks & Dependencies

- **Output format stability:** Claim-key output is a new contract; keep wording deterministic for future eval fixtures.
- **Thin negative evidence for test-command:** Without miner-stored rejections, negatives are inferred from profile gaps — sufficient for first slice but may expand later.

---

## Sources & Research

- `docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md` (ranked opportunity #7)
- `docs/plans/2026-06-29-004-feat-lfg-improvement-backlog-plan.md` (U6)
- `src/cli/explain.ts`, `src/customize/repo-miner.ts`, `src/customize/emitters.ts`
