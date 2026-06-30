---
title: "feat: maintenance skills 1–9 and aisdlc maintain orchestration"
type: feat
date: 2026-06-30
origin: "Conversation — extend repo workflows with host skills + one orchestration command"
---

# feat: maintenance skills 1–9 and aisdlc maintain orchestration

## Summary

Add nine host-agent skills for judgment-heavy maintenance tasks and `aisdlc maintain`, a single CLI workflow that runs the deterministic chain (customize → compile → smoke → garden), writes `.sdlc/maintenance-report.json`, and lists which skills to invoke next.

## Requirements

- R1. Skills: `close-gaps`, `resolve-upgrade`, `setup-triage`, `review-standards-drift`, `bind-integrations`, `compound-learnings`, `pack-workflows`, `bench-triage`, `architecture-grounding`.
- R2. `aisdlc maintain` runs deterministic phases in order and never silently applies host-LLM edits.
- R3. Maintenance report lists skill handoffs with reasons and paths to read (garden report, upgrade conflicts, etc.).
- R4. README, CLI help, `npm run maintain`, and `customize` skill reference the workflow.
- R5. Tests cover handoff detection and maintain CLI wiring.

## Implementation Units

### U1. Maintenance report model and handoff builder

- **Files:** `src/core/maintenance.ts`, `tests/core/maintenance.test.ts`

### U2. `aisdlc maintain` CLI

- **Files:** `src/cli/maintain.ts`, `src/cli/index.ts`, `tests/cli/maintain.test.ts`

### U3. Nine base skills

- **Files:** `sdlc-base/skills/*/SKILL.md` (nine new directories)

### U4. Docs and golden compile snapshot

- **Files:** `README.md`, `package.json`, `sdlc-base/skills/customize/SKILL.md`, golden snapshot

## Scope Boundaries

- No embedded LLM API calls in the CLI.
- `bench-triage` runs only when `--bench` is passed to `maintain`.
- `resolve-upgrade` is handoff-only unless `upgrade-conflicts.yml` exists (upgrade itself stays explicit).
