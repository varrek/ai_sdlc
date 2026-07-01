---
name: e2e-authoring
description: Author browser E2E tests using explore-before-generate, pyramid budget, and bounded self-healing. Activates only when the e2e pack is loaded.
tracks:
  - standard
  - full
---

# E2E Authoring

Use when the project ships a browser E2E framework (Playwright, Cypress, etc.).

## Process

1. **Explore** — navigate the flow manually or with trace recording before codegen.
2. **Pyramid check** — confirm unit/integration coverage exists; add E2E only for critical paths.
3. **Generate** — emit deterministic test files; no LLM in CI execution.
4. **Self-heal budget** — retry selector fixes up to 3 times, then classify:
   - **Test bug** — fix the test.
   - **Application bug** — hand to Engineer with reproduction.

## Hand off

Return generated file paths, commands to run natively, and coverage budget notes.
