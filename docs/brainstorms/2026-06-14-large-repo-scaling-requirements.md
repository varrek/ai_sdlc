# Requirements — Large-repo scaling: monorepo-aware mining & layered instruction emission

- **Date:** 2026-06-14
- **Status:** ready-for-planning
- **Origin ideation:** `docs/ideation/2026-06-14-large-repo-scaling-ideation.md`
- **Scope tier:** Deep — feature (extends existing product shape; does not redefine it)

---

## Problem

ai-sdlc's promise is "your agents follow *this* repo's stack, architecture, and standards." In a single-package repo that holds. In a large/complex repo it breaks in observable ways:

1. **One stack, one command — for many packages.** `mineRepo` returns a single `RepoProfile` with one `testCommand` and one `architecture`. A monorepo with `packages/a` (vitest) and `packages/b` (pytest) gets one command mined — so the emitted config gives the wrong test command for at least one package. This is the exact failure the strategy exists to prevent, re-emerging per package.
2. **One root instruction file, loaded whole, every session.** Instructions emit as a single root `AGENTS.md` (= constitution + appended standards). As mined standards accumulate it bloats and crowds out the task — the "one big AGENTS.md" anti-pattern both Anthropic and OpenAI call out.
3. **Mined noise-reduction never reaches the agent.** The miner knows what to ignore (`IGNORE_DIRS` + emitted-config manifest) but never emits exclusion rules, so the agent's own grep/search burns context on `node_modules`, `dist`, build output.
4. **No map.** Mined module/package structure is never surfaced as a scannable table of contents, so the agent navigates blind on first contact.

## Actors

- **A1 — Solo developer (primary).** Runs the `customize → compile → smoke` chain (or `/customize`) on their repo, which may be a monorepo. Wants correct per-package guidance with zero hand-editing.
- **A2 — The downstream AI agent (Cursor/Claude/Copilot).** Consumes emitted config; benefits from layered instructions, the map, and exclusions at session time.

## Goals

- **G1.** Mine a workspace/monorepo as multiple packages, each with its own stack, runnable test command, and linters — every per-package standard citing that package's source (evidence guarantee preserved at package granularity). _(S1)_
- **G2.** Emit **layered** instructions: a lean root (gates + map + pointers) plus a per-package instruction file carrying that package's local conventions. _(S2, S5)_
- **G3.** Emit a mined **codebase map** (top-level module/package → one-line role) the agent can scan before opening files. _(S3)_
- **G4.** Emit **version-controlled exclusion rules** from the existing ignore set so the agent gets the same noise reduction. _(S4)_
- **G5.** Keep single-package repos behaving as they do today (no nested files; root output unchanged apart from the optional map). _(compatibility)_

## Non-goals

- Path-scoped **skills** (ai-sdlc emits workflow/role skills, not domain skills) — deferred.
- **LSP** integration emission — ai-sdlc is a config emitter, not a runtime — deferred.
- **Model-evolution** config review (distinct from repo-change drift) — deferred.
- **Self-improving stop-hooks** that propose instruction edits at runtime — deferred.
- A **hard** token/length readiness gate — only a soft advisory (R8).
- Reorganizing the user's repository or moving their files — we emit alongside, never restructure.

## Requirements

- **R1 (S1).** Detect workspace/monorepo structure and produce a per-package view. A "package" is a directory containing a recognized manifest, discovered via declared workspace globs (npm/pnpm/yarn `workspaces`, `pnpm-workspace.yaml`, Cargo `[workspace]`, `go.work`) **or** a bounded nested-manifest scan when no workspace declaration exists. Single-package repos yield exactly one package (the root) — identical to today.
- **R2 (S1).** For each package, mine its stack (languages/frameworks), a runnable test command, and linters, resolved from that package's own manifests/CI/Makefile. Every per-package claim cites a path **inside that package**.
- **R3 (S1).** The mined-phase fingerprint must cover the per-package data, so adding/removing a package or changing a package's command is detected as drift (re-run, not stale config).
- **R4 (S2).** When more than one package is detected, emit a per-package instruction file containing that package's local conventions (its test/lint commands, its package-scoped standards). Host-correct placement is a planning detail; the requirement is that the agent, working in a package directory, sees that package's commands.
- **R5 (S2/S5).** The root instruction file holds cross-cutting content only: the non-negotiable gates, the codebase map (R6), and pointers to per-package files. Package-scoped standards route to their package file, not the root.
- **R6 (S3).** Emit a codebase map into the root instructions (or a sibling file the root points to): each top-level module/package with a one-line role, each entry evidence-backed by the directory it describes.
- **R7 (S4).** Emit host-native exclusion rules from the existing ignore set (`IGNORE_DIRS`) plus generated/emitted artifacts, for each enabled host (e.g. Claude `permissions.deny`, a Cursor ignore/permissions entry, Copilot equivalent). Version-controlled, so every developer gets the same noise reduction.
- **R8 (S5).** Emit a **soft, non-blocking** advisory when the root instruction file exceeds a length heuristic, naming what could move to a per-package layer. This never fails `setup-ready`.
- **R9 (compat).** Single-package repos produce byte-identical output to today except for the additive map (R6) and exclusions (R7); existing golden tests are updated only where additive output is intended, never silently regressed.
- **R10 (metrics).** Per-package standards count toward existing evidence-coverage reporting (`status`/`smoke`), so the strategy metric stays meaningful in monorepos.

## Key flows

- **F1 — Monorepo first run.** A2's developer runs `customize` on a pnpm monorepo → miner detects packages, mines each → overlay/standards carry per-package, evidence-backed entries → `compile` emits a lean root (gates + map + pointers), per-package instruction files, and exclusion rules → `smoke` passes and reports setup-ready with per-package evidence counted.
- **F2 — Single-package repo (regression guard).** Developer runs the chain on a flat repo → exactly one package (root) → no nested instruction files → output matches today plus the map and exclusions.
- **F3 — Drift after adding a package.** Developer adds `packages/c` with its own tests → re-run → mined fingerprint changes → chain re-mines and re-emits `c`'s instruction file; unrelated packages' emission is unchanged.

## Acceptance examples

- **AE1 (R1, R2).** Given a repo with root `package.json` declaring `workspaces: ["packages/*"]`, `packages/a` using vitest and `packages/b` using pytest, `customize` produces a profile with two packages, each carrying its own test command, and `a`'s command cites a path under `packages/a/` while `b`'s cites a path under `packages/b/`.
- **AE2 (R4, R5).** After `compile` on AE1's repo, an instruction file under `packages/b` names pytest as the test command, and the root instruction file does **not** assert a single global test command for the whole repo.
- **AE3 (R9).** Given a flat single-package TypeScript repo, `compile` emits no per-package instruction files and the root/host outputs match the prior golden fixtures except for the added map and exclusion files.
- **AE4 (R7).** After `compile`, the emitted Claude config contains deny/ignore rules covering `node_modules` and `dist`, and the Cursor config contains the equivalent ignore entry.
- **AE5 (R6).** The root instruction file (or its pointed-to map file) lists each top-level module/package with a one-line role, and each map entry has a corresponding evidence path.
- **AE6 (R3, F3).** Adding a new package and re-running causes the mined phase to be recomputed (not skipped as fresh), and removing a package likewise.
- **AE7 (R8).** When the root instruction file exceeds the length heuristic, `customize`/`smoke` prints a non-blocking advisory and still reports setup-ready (when otherwise ready).

## Scope boundaries

**In scope:** S1 (workspace detection + per-package mining), S2 (layered emission + lean root), S3 (codebase map), S4 (exclusion rules), S5 (soft bloat advisory).

**Deferred for later:** path-scoped skills, LSP emission, model-evolution review, self-improving hooks, hard token gate.

**Outside this product's identity:** restructuring the user's repo; building/maintaining a codebase index or embedding pipeline; runtime tooling (the agent runs the host, ai-sdlc only configures it).

## Success criteria

- A monorepo reaches `setup-ready` with per-package test commands correct and evidence-backed, **with zero manual overlay edits** for packages mining could resolve (the hands-off-setup-rate metric, now holding in monorepos).
- The root instruction file stays lean as packages grow (cross-cutting only); per-package detail loads with the package.
- Single-package repos are not regressed.
- The emitted agent session benefits from committed exclusion rules and a scannable map.

## Outstanding questions (non-blocking; resolve in planning)

- Exact per-host filename/placement for nested instruction files and exclusion rules.
- The nested-manifest scan's depth/bound for repos with no workspace declaration.
- The root-length heuristic value for R8.
