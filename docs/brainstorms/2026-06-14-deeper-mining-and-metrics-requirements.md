---
status: ready
origin_ideation: docs/ideation/2026-06-14-strategy-aligned-improvements-ideation.md
actors: [A1]
flows: [F1, F2, F3]
acceptance_examples: [AE1, AE2, AE3, AE4, AE5]
---

# Requirements — Deeper mining (architecture + conventions) and strategy-metric instrumentation

## Problem

`ai-sdlc` derives evidence-backed agent config from the repo, but two pieces of its own strategy are unimplemented:

1. **Mining stops short of architecture and conventions.** `RepoProfile` captures stack signals (languages, frameworks, test command, linters, manifests, CI, CODEOWNERS) but not **project architecture** (module/layer structure, entrypoints) or **conventions** (commit style, test layout). STRATEGY's approach explicitly promises the Architect carries rules "grounded in the actual project," and names "wrong conventions" as a core symptom of the target problem — yet neither is mined today.
2. **The strategy metrics are uninstrumented.** Hands-off setup rate, blocking gaps at first run, evidence coverage, and re-run-is-a-no-op are defined in `STRATEGY.md` but nothing computes or surfaces them, and a user can't see the evidence behind any emitted standard.

## Actors

- **A1 — Individual developer** setting up / re-aligning AI agents on their own repo (the STRATEGY persona).

## Goals

- Mine concrete **architecture** signals and emit an evidence-backed architecture standard plus Architect-role grounding.
- Mine **conventions** (commit-message style, test layout) as evidence-backed standards.
- Surface the **four strategy metrics** and per-standard **evidence** through read-only CLI commands.
- Keep every new standard **evidence-backed** (every claim cites a source path or sampled artifact) and every command **idempotent / freshness-aware**, consistent with the existing model.

## Non-goals

- No new AI/LLM in artifact generation — mining stays deterministic TypeScript.
- No interactive TTY interview, no file watcher, no git hooks (rejected in ideation).
- No new host adapters; architecture/convention standards flow through the existing overlay → adapter emit path.

## Requirements

- **R1 (S1).** Mine architecture: the top-level source-module map (directory roles under the primary source root, to depth ≤2) and entrypoints (from manifests/`bin`), recorded with evidence (the dirs/files observed). Empty/flat repos yield no architecture standard rather than a fabricated one.
- **R2 (S1).** Emit an evidence-backed **"Project architecture"** standard from R1, and make the architecture summary available to the Architect role's grounding so its rules reference the real module map.
- **R3 (S3).** Mine **commit convention**: sample recent `git log` subjects; if a clear majority match Conventional Commits, assert it as an evidence-backed standard (evidence = sampled commit subjects / count). No git history or no clear majority → no claim.
- **R4 (S3).** Mine **test layout**: detect co-located (`*.test.*`/`*.spec.*`) vs separate (`tests/`/`spec/`) and assert it as an evidence-backed standard (evidence = sample test paths).
- **R5 (S2).** Add `aisdlc status`: a read-only report of (a) setup phase state + whether a re-run would be a no-op (freshness), (b) open blocking gaps count, (c) **evidence coverage** = % of emitted standards with ≥1 source, listing any zero-source standards. Never mutates state.
- **R6 (S4).** Add `aisdlc explain <n>`: print standard *n* (as numbered by `status`/standards-index) with its full statement and source list. Out-of-range / no-overlay → a clear, non-crashing message.
- **R7 (S4).** Surface evidence coverage at `customize`/`compile` time (one line; warn when any standard has zero sources) so a coverage regression is visible without running `status`.
- **R8 (cross-cutting).** All mined claims remain evidence-backed; architecture/convention inputs participate in the `mined` fingerprint so freshness/drift continue to hold (re-run is a no-op when inputs are unchanged).

## Key flows

- **F1 — Deeper customize.** `aisdlc customize` mines stack **+ architecture + conventions**; the overlay/standards-index gains architecture, commit-convention, and test-layout standards, each citing sources.
- **F2 — Status check.** `aisdlc status` prints phase/freshness, blocking gaps, and evidence coverage for the current repo.
- **F3 — Explain a standard.** `aisdlc explain 3` prints standard #3 and the files that justify it.

## Acceptance examples

- **AE1 (R1,R2).** In this repo, customize records an architecture map including `src/adapters`, `src/core`, `src/cli`, `src/customize` with evidence = those directories, and emits a "Project architecture" standard whose sources are non-empty.
- **AE2 (R3).** A repo whose recent commits are majority `feat:/fix:/chore:` gets a Conventional Commits standard citing sampled subjects; a repo with freeform commits gets no such standard.
- **AE3 (R4).** A repo using `*.test.ts` gets a "tests are co-located" standard; a repo using a top-level `tests/` dir gets a "tests live in tests/" standard — each with sample paths as sources.
- **AE4 (R5,R7).** `aisdlc status` on a freshly set-up repo reports 0 blocking gaps, a re-run-is-a-no-op = true, and an evidence-coverage percentage; a standard with zero sources is listed explicitly.
- **AE5 (R6).** `aisdlc explain <n>` prints the n-th standard's statement and sources; `explain 999` prints a clear out-of-range message and exits non-zero without a stack trace.

## Scope boundaries

### In scope
- S1 architecture mining, S2 `status`, S3 convention mining, S4 `explain` + coverage surfacing (R1–R8).

### Deferred to follow-up work
- **S5** — language/framework breadth (Go, Rust, Java, Ruby).
- **S6** — monorepo / nested-manifest mining.
- **S7** — CI mining beyond GitHub Actions (GitLab CI).
- Git hooks / `--watch` auto-re-alignment (rejected in ideation; revisit after `status` makes drift visible).

## Success criteria

- Architecture + convention standards appear in the emitted overlay for this repo, all with non-empty sources (evidence coverage does not regress).
- `aisdlc status` and `aisdlc explain` run read-only, are covered by tests, and never mutate `.sdlc`.
- Re-running `customize`/`compile` with unchanged inputs remains a no-op (golden + freshness tests stay green after the new fingerprint inputs are added).

## Outstanding questions

- None blocking. Architecture detection is heuristic by nature; AE1 pins the expected shape for this repo so "good enough" is testable.
