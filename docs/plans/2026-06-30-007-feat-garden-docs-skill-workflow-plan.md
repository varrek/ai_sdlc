---
title: "feat: garden-docs skill and garden workflow command"
type: feat
date: 2026-06-30
origin: "Conversation — Option A LLM-assisted doc gardening via host skill"
---

# feat: garden-docs skill and garden workflow command

## Summary

Add a host-agent `garden-docs` skill (Option A) that repairs judgment-heavy doc findings after the CLI applies safe deterministic fixes, plus an `aisdlc garden` workflow command that runs the full mechanical chain and writes `.sdlc/doc-gardening-report.json`.

## Problem Frame

`aisdlc garden-docs` reports doc health but leaves broken links, root bloat, and hierarchy budget issues for manual cleanup. The product already uses skills (`tune-roles`) for host-LLM work instead of embedding API calls in the CLI. Users also lack a single entrypoint like `aisdlc setup` for doc gardening.

## Requirements

- R1. `--fix` on `garden-docs` regenerates stale capability matrix and appends missing codebase map sections.
- R2. `aisdlc garden` runs report → deterministic fix → re-report (workflow alias).
- R3. `sdlc-base/skills/garden-docs/SKILL.md` documents the host-agent flow for non-fixable findings.
- R4. README and CLI help document `garden`, `garden-docs --fix`, and skill handoff.
- R5. Default `garden-docs` behavior unchanged (report-only).

## Implementation Units

### U1. Deterministic fixes in doc-gardener

- **Files:** `src/garden/types.ts`, `src/garden/doc-gardener.ts`, `tests/garden/doc-gardener.test.ts`
- **Approach:** `applyDocGardenFixes`, `FIXABLE_DOC_GARDEN_FINDING_IDS`, update suggestions to mention `--fix` / `aisdlc garden`.

### U2. CLI flags and garden workflow

- **Files:** `src/cli/garden-docs.ts`, `src/cli/garden.ts`, `src/cli/index.ts`, `tests/cli/garden-docs.test.ts`, `tests/cli/garden.test.ts`
- **Approach:** `--fix` on `garden-docs`; new `runGardenCli` mirroring `runSetupCli` pattern.

### U3. Host skill

- **Files:** `sdlc-base/skills/garden-docs/SKILL.md`
- **Approach:** Flow: `aisdlc garden` → read report → patch judgment findings → re-run garden → present diff.

### U4. Documentation

- **Files:** `README.md`, `package.json` (`garden` script)
- **Approach:** Document full workflow and skill boundary.

## Scope Boundaries

- No embedded LLM API in the CLI.
- No auto-apply of model-authored patches without re-running gardener checks (enforced in skill prose).
