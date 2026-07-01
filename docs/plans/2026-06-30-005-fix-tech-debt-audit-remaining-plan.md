---
title: "fix: Resolve remaining TECH_DEBT_AUDIT findings"
type: fix
date: 2026-06-30
---

# fix: Resolve remaining TECH_DEBT_AUDIT findings

## Summary

Re-run remediation against `TECH_DEBT_AUDIT.md` on latest `main`. Several quick-win findings (F003, F005, F008, F010, F019, F021, F024, F031, F033, F043) are already fixed. This plan closes the remaining actionable findings with test-backed changes and updates the audit document.

---

## Problem Frame

The 2026-06-29 audit catalogued 45 findings. Main has since absorbed many quick wins, but boundary validation, eval error taxonomy, host gate hardening, exclusion consistency, and miner modularization remain open.

---

## Requirements

- R1. Loop trace events must pass discriminated runtime validation at CLI ingress and when reading JSONL history.
- R2. Copilot CI workflows must emit safe YAML for mined test commands (including multiline/special characters).
- R3. Cursor MCP gate must fail closed when a role-policy file exists but cannot be parsed.
- R4. Setup-chain and bench must classify I/O and parse failures instead of throwing opaque errors.
- R5. Project context parsing must validate package and map entry shapes.
- R6. Miner ignore dirs and default exclusions must share one registry; dead exports removed.
- R7. Extract CI test-command mining and `record-event` helpers; add missing unit tests (redact, classifySetup).
- R8. Update `TECH_DEBT_AUDIT.md` with RESOLVED/NEW status and accepted residuals for breaking dependency upgrades.

---

## Key Technical Decisions

- KTD1. Keep adapter golden snapshots stable unless a fix requires intentional output change (MCP gate script, Copilot YAML).
- KTD2. Defer full `repo-miner.ts` orchestration split (F001) to a follow-up if modular extraction of CI commands plus package subtree mining (F002) lands in this slice.
- KTD3. Document npm audit residuals (F039/F040) when breaking upgrades are out of scope; attempt safe patch upgrades only.

---

## Scope Boundaries

### In Scope

Findings still open on `main`: F004, F006–F007, F009, F011–F012, F014–F018, F022–F023, F025–F030, F034–F036, F041–F042, F044–F045, and partial F001/F002.

### Deferred to Follow-Up Work

- F038: Golden snapshot splitting (large churn, low correctness impact).
- F039/F040: Breaking dependency major upgrades if patch path fails.
- F013/F015: Customize/smoke freshness caching beyond status `--no-mine`.

### Non-Goals

- External corpus eval runs.
- Behavior-eval framework convergence beyond documentation (F037).

---

## Implementation Units

### U1. Loop trace validation and record-event extraction

- **Goal:** Harden loop event boundaries (F017, F018, F027).
- **Files:** `src/eval/loop-trace.ts`, `src/cli/record-loop-event.ts`, `src/cli/index.ts`, `src/core/memory.ts`, `tests/cli/record-loop-event.test.ts`, `tests/eval/loop-trace.test.ts`
- **Verification:** Malformed events rejected; valid events persist; JSONL reader skips invalid lines.

### U2. Host gate and Copilot YAML hardening

- **Goal:** Fail closed on corrupt MCP policy; safe CI test-command YAML (F022, F023).
- **Files:** `src/adapters/cursor/gates.ts`, `src/adapters/copilot/gates.ts`, `src/core/loop.ts`, `src/adapters/shared/approved-gate.ts`, `tests/adapters/gates.test.ts`
- **Verification:** Runtime tests for corrupt policy and multiline test commands.

### U3. Eval and setup error taxonomy

- **Goal:** Structured failures for setup artifacts and catalog load (F029, F030, F034).
- **Files:** `src/eval/setup-chain.ts`, `src/cli/bench.ts`, `tests/eval/setup-chain.test.ts`, `tests/cli/bench.test.ts`
- **Verification:** Missing artifacts and bad catalog produce classified failures, not uncaught throws.

### U4. Shared exclusions, project context validation, dead code

- **Goal:** Align exclusions; validate persisted context; trim exports (F011, F012, F028, F041, F042).
- **Files:** `src/core/miner-exclusions.ts`, `src/core/project-context.ts`, `src/customize/repo-miner.ts`, `src/cli/compile.ts`
- **Verification:** DEFAULT_EXCLUSIONS derives from miner ignore set; malformed context rejected.

### U5. Tests and docs refresh

- **Goal:** redact/classifySetup coverage; eval framework doc; audit refresh (F035, F036, F037, F044, F045).
- **Files:** `tests/eval/redact.test.ts`, `tests/eval/report.test.ts`, `docs/eval/eval-frameworks.md`, `TECH_DEBT_AUDIT.md`, `docs/eval/external-repo-workflow.md`
- **Verification:** New tests pass; audit marks resolved items.

### U6. Miner CI module and package subtree mining

- **Goal:** Reduce god-file size and repeated walks (F001 partial, F002, F004, F006, F007).
- **Files:** `src/customize/ci-test-command.ts`, `src/customize/repo-miner.ts`, `tests/customize/deeper-mining.test.ts`
- **Verification:** Existing miner tests pass; package mining reuses filtered inventory.
