# Ideation — Working in large / complex repos (per-directory instructions, token efficiency)

- **Date:** 2026-06-14
- **Mode:** Repo-grounded; specified subject.
- **Subject:** Make ai-sdlc's miner and emitted host configs work well in large / complex repos — layered per-directory instructions, monorepo awareness, and token-efficient navigation.
- **Grounding:** Anthropic "How Claude Code works in large codebases" (CLAUDE.md layering, per-subdir commands, `.ignore`/`permissions.deny`, codebase maps, path-scoped skills, LSP, self-improving hooks); OpenAI "Harness engineering" (AGENTS.md as a *table of contents* not an encyclopedia, `docs/` as system of record, progressive disclosure, mechanical enforcement, golden-principle GC); plus `STRATEGY.md` and the current code (`src/customize/repo-miner.ts`, `src/adapters/*/instructions.ts`, `src/adapters/*/skills.ts`).

## How this connects to strategy

ai-sdlc's bet is that off-the-shelf agent configs assume the wrong stack/architecture/conventions, and that mining the repo with evidence fixes that. **At scale that bet breaks in a specific, observable way:** a monorepo has *many* stacks and *many* test commands, but the miner produces exactly one of each, and the emitted instructions are a single root file that loads in full every session. The "wrong test command" failure the strategy promises to solve is precisely what re-emerges per-package in a large repo. So large-repo support is not a new track — it's the existing **Repo mining & evidence** and **Setup orchestration & UX** tracks holding up under scale.

## Topic axes

- **A. Mining at scale** — workspace/monorepo detection, per-package stack/command/linter mining with evidence.
- **B. Layered instruction emission** — lean root + per-directory local conventions.
- **C. Token efficiency & noise reduction** — exclusion rules, lean root discipline, progressive disclosure.
- **D. Navigability** — codebase map / table of contents the agent scans before opening files.
- **E. Scoped capability** — path-scoped skills / per-module activation.

## Grounded current-state facts (the substance the ideas attach to)

- `mineRepo(root)` returns **one** `RepoProfile`: a single `testCommand`, a single `architecture` (one dominant source root + its immediate modules), one languages/frameworks/linters set. No workspace detection (`src/customize/repo-miner.ts`).
- `resolveTestCommand` picks **one** command from `CI > Makefile > root package.json`. A monorepo's per-package commands are invisible.
- Instructions emit as a **single root** `AGENTS.md` (= `model.constitution` + appended overlay standards) and a thin `CLAUDE.md` that imports it (`src/adapters/claude-code/instructions.ts`). No nested/per-directory instruction files.
- `IGNORE_DIRS` (node_modules, dist, build, .next, coverage, caches, `.sdlc`) is used **only** for the mining walk — it is never emitted to the host, so the agent's own grep/search does not get the same noise reduction.
- `architecture.modules` is mined but only surfaced as flat "module" standards — there is no navigable codebase map / table of contents.
- Skills emit **globally** to `.claude/skills/`, `.cursor/skills/` — no path scoping.

---

## Surviving ideas (ranked)

### S1 — Workspace/monorepo detection + per-package profile mining `[axis A]`

**Basis (direct):** `mineRepo` produces one `testCommand` and one `architecture` for the whole tree; `resolveTestCommand` reads only root CI/Makefile/`package.json`. **Move:** detect workspace roots (npm/pnpm/yarn `workspaces`, `pnpm-workspace.yaml`, `go.work`, Cargo workspaces, multiple nested manifests) and mine each package as its own unit — stack, runnable test command, linters — each standard citing that package's source. **Why it matters:** directly repairs the strategy's core promise ("right test command for *this* code") at the granularity where it actually fails in large repos. **Meeting test:** yes — defines the data model the rest of the cluster emits from.

### S2 — Layered instruction emission: lean root + per-directory local conventions `[axis B]`

**Basis (direct + external):** single root `AGENTS.md` grows with every mined standard and loads every session; both articles converge on lean-root + layered-subdir as *the* large-repo pattern ("root for big picture, subdirectory files for local conventions"; "AGENTS.md as table of contents, not encyclopedia"). **Move:** when S1 finds packages, emit a nested instruction file per package (`<pkg>/AGENTS.md` or host equivalent) carrying that package's local conventions (its test/lint command, its standards), and keep the root file to gates + map + pointers. Claude walks up the tree, so root context is never lost. **Why it matters:** turns the single bloating file into progressive disclosure — the session loads only what the working directory needs. **Meeting test:** yes.

### S3 — Codebase map emission (table of contents) `[axis D]`

**Basis (direct + external):** `architecture.modules`/packages are mined but never emitted as a scannable map; both articles call this out ("a lightweight markdown file… listing each top-level folder with a one-line description"; "ARCHITECTURE.md provides a top-level map"). **Move:** emit a mined codebase map — each top-level module/package with a one-line role — into the root instruction file (or a sibling `ARCHITECTURE.md` the root points to). **Why it matters:** gives the agent a table of contents to scan before opening files, the cheapest navigability win, and reuses data already mined. **Meeting test:** yes.

### S4 — Emit version-controlled exclusion rules from `IGNORE_DIRS` + generated artifacts `[axis C]`

**Basis (direct + external):** the miner already knows the noise set (`IGNORE_DIRS` + the emitted-config manifest) but never tells the host about it; the article recommends committing `permissions.deny` / `.ignore` so "every developer gets the same noise reduction." **Move:** emit host-native exclusion config — Claude `permissions.deny` in `.claude/settings.json`, a `.cursorignore`/permissions entry, Copilot equivalent — from the same `IGNORE_DIRS` + generated/emitted paths. **Why it matters:** stops the agent burning context grepping `node_modules`/`dist`/build output; pure reuse of existing knowledge. **Meeting test:** yes.

### S5 — Lean-root discipline + soft bloat warning `[axis C/B]`

**Basis (external + reasoned):** OpenAI's failure modes for "one big AGENTS.md" (crowds out the task, rots, hard to verify) and Anthropic's "root file should be pointers and critical gotchas only." **Move:** route mined standards to the layer they apply to (package standards → package file via S2; only cross-cutting standards stay at root), and emit a **soft** advisory (not a hard gate) when the root instruction file exceeds a length heuristic, pointing to what could move down a layer. **Why it matters:** keeps the compounding benefit of S2 from silently eroding as standards accumulate. **Meeting test:** yes — but it is connective tissue for S2/S3, not a standalone feature; fold into the same plan rather than its own track.

---

## Rejected / deferred (with reasons)

- **Path-scoped skills (axis E).** The article's path-scoping targets *domain* skills a team authors (a payments deploy skill bound to the payments dir). ai-sdlc emits *process/role* skills (customize, the SDLC roles) that are workflow-global by design — binding them to a path doesn't map. **Deferred** until/unless ai-sdlc emits domain skills.
- **Token-budget hard readiness gate.** Making "setup-ready" fail on root token size risks false negatives on legitimately large roots and entangles a load-bearing definition. Kept only as the **soft** warning in S5.
- **LSP integration emission (axis D).** Highest-value per Anthropic, but ai-sdlc is a config *emitter*, not a runtime; wiring language servers is out of its lane. **Deferred.**
- **Model-evolution config review (remove model-compensating rules).** Real, but it's a different axis (config drift vs *model* change) from the existing repo-change drift detection. **Deferred** to its own future ideation.
- **Self-improving stop-hook that proposes instruction updates.** Compelling (Anthropic + OpenAI both lean on it) but it's a runtime-capture mechanism, a meaningfully different surface from static emission. **Deferred.**

## Recommended cluster for one implementable plan

**S1 → S2 → S3 → S4, with S5 as the connecting discipline.** S1 establishes the multi-package data model; S2 emits it as layered instructions; S3 adds the map; S4 reuses the noise set for exclusions; S5 keeps the root lean. Cohesive, evidence-preserving, and aligned to the Repo mining & Setup orchestration tracks. Path-scoped skills, LSP, model-evolution review, and self-improving hooks are explicitly deferred.

## Next step

`ce-brainstorm` the S1–S5 cluster into a requirements document.
