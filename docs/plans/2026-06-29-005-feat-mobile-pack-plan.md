---
title: "feat: Add mobile reference pack"
type: feat
date: 2026-06-29
origin: docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md
---

# feat: Add mobile reference pack

## Summary

Ship a reference `mobile` pack with `mobile-reviewer` role and `mobile-smoke-check` skill so README examples referencing `./packs/mobile` resolve to real artifacts. No MCP integration contracts in the first slice — device/simulator guidance stays in prose until the binding story is clearer.

---

## Problem Frame

`README.md` already demonstrates compile/smoke with `./packs/security,./packs/mobile`, but the mobile pack directory does not exist. That breaks the documented quickstart and leaves iOS/Android/React Native/Flutter work without curated pack guidance. The pack extension mechanism is proven by four reference packs; mobile is a low-friction addition modeled on `frontend` without mandatory Playwright/MCP contracts.

---

## Requirements

- R1. Add `packs/mobile/` with valid `pack.yaml`, `AGENTS.md`, `mobile-reviewer` role, and `mobile-smoke-check` skill.
- R2. Role and skill cover iOS, Android, React Native, and Flutter smoke guidance (simulator/emulator, platform-specific test commands) without requiring credentials or MCP bindings.
- R3. Update pack documentation and README so mobile is listed alongside existing reference packs.
- R4. Extend reference pack tests to assert mobile loads additively with the base and does not duplicate names.
- R5. Defer MCP integration contracts (e.g. device farm, Maestro, Detox bindings) to follow-up work.

---

## Key Technical Decisions

- **No integrations in v1:** Research first slice explicitly skips mandatory MCP contracts. Mobile smoke guidance references repo-mined test commands and platform docs instead of bound automation servers.
- **Mirror frontend pack shape:** Same directory layout (`pack.yaml`, `AGENTS.md`, `roles/`, `skills/`) as existing reference packs for loader compatibility.
- **Read-only reviewer posture:** `mobile-reviewer` uses `posture: read-only` consistent with other domain reviewers.

---

## Output Structure

```
packs/mobile/
├── pack.yaml
├── AGENTS.md
├── roles/
│   └── mobile-reviewer.md
└── skills/
    └── mobile-smoke-check/
        └── SKILL.md
```

---

## Implementation Units

### U1. Mobile pack artifacts

- **Goal:** Create the mobile pack manifest, guidance, role, and skill.
- **Requirements:** R1, R2, R5
- **Dependencies:** None
- **Files:** `packs/mobile/pack.yaml`, `packs/mobile/AGENTS.md`, `packs/mobile/roles/mobile-reviewer.md`, `packs/mobile/skills/mobile-smoke-check/SKILL.md`
- **Approach:** Model content on `packs/frontend` but emphasize platform matrices (iOS Simulator, Android emulator, RN/Flutter CLI), device permissions, and native bridge boundaries. Skill paths target mobile source globs (`*.swift`, `*.kt`, `*.dart`, etc.).
- **Patterns to follow:** `packs/frontend/pack.yaml`, `packs/frontend/roles/frontend-reviewer.md`, `packs/frontend/skills/ui-smoke-check/SKILL.md`
- **Test scenarios:**
  - Happy path: `loadBase` with `packs/mobile` alone yields `mobile-reviewer` role and `mobile-smoke-check` skill without errors.
  - Happy path: constitution includes `## Pack guidance: mobile`.
  - Edge case: combining mobile with all existing reference packs produces five unique pack names.
- **Verification:** Pack loads via loader; no duplicate artifact names.

### U2. Documentation updates

- **Goal:** Document mobile pack in README-adjacent pack docs.
- **Requirements:** R3
- **Dependencies:** U1
- **Files:** `packs/README.md`, `docs/packs.md`, `README.md`
- **Approach:** Add mobile row to pack table; list mobile in shipped reference packs; ensure README reference pack bullet includes mobile.
- **Test scenarios:** Test expectation: none — documentation only.
- **Verification:** Docs consistently list five reference packs including mobile.

### U3. Reference pack tests

- **Goal:** Gate mobile pack in automated reference pack suite.
- **Requirements:** R4
- **Dependencies:** U1
- **Files:** `tests/packs/reference-packs.test.ts`
- **Approach:** Extend expected pack name list (alphabetical: backend-api, frontend, infra, mobile, security), role/skill assertions, constitution snippet, and pack count.
- **Test scenarios:**
  - Happy path: curated set includes `mobile` in sorted order.
  - Happy path: `loadBase` with all five packs succeeds with `mobile-reviewer` and `mobile-smoke-check` present.
  - Integration: five-pack load does not throw duplicate errors.
- **Verification:** `npm test -- tests/packs/reference-packs.test.ts` passes.

---

## Scope Boundaries

- No MCP integration contracts in this slice.
- No repo-miner framework detection for Swift/Dart/Flutter (deferred to ranked opportunity 10).
- No changes to base roles or constitution gates.

### Deferred to Follow-Up Work

- Optional MCP contracts for Maestro, Detox, or device-farm automation when overlay binding story is defined.
- Corpus fixtures for mobile ecosystems once miner detection lands.

---

## Sources & Research

- `docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md` (ranked opportunity 5)
- `docs/plans/2026-06-29-004-feat-lfg-improvement-backlog-plan.md` (U5)
- `packs/frontend/` reference pack
