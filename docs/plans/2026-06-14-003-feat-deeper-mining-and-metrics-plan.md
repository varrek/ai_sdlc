---
title: "feat: Deeper mining (architecture + conventions) and strategy-metric instrumentation"
type: feat
status: active
date: 2026-06-14
origin: docs/brainstorms/2026-06-14-deeper-mining-and-metrics-requirements.md
---

# feat: Deeper mining (architecture + conventions) and strategy-metric instrumentation

## Summary

Extend the deterministic repo miner to capture **architecture** (module map + entrypoints) and **conventions** (commit style, test layout) as evidence-backed standards, and add two read-only CLI commands — `aisdlc status` (the four strategy metrics) and `aisdlc explain <n>` (the evidence behind a standard) — plus a one-line evidence-coverage signal during `customize`/`compile`. All new claims stay evidence-backed and participate in the `mined` fingerprint so freshness/idempotency hold.

---

## Problem Frame

Two parts of the strategy are unimplemented: mining stops at the stack and never reaches architecture/conventions (so the Architect role isn't grounded in the real project, and "wrong conventions" — a named symptom — is never asserted), and the four strategy metrics are defined but uninstrumented (no way to see evidence coverage, blocking gaps, or freshness). See origin: `docs/brainstorms/2026-06-14-deeper-mining-and-metrics-requirements.md`.

---

## Requirements

| ID | Requirement | Units |
|----|-------------|-------|
| R1 | Mine architecture: top-level module map (roles under primary source root, depth ≤2) + entrypoints, with evidence | U1 |
| R2 | Emit evidence-backed "Project architecture" standard; flows to roles via the overlay/constitution | U3 |
| R3 | Mine commit convention from sampled `git log` (Conventional Commits majority → standard) | U2 |
| R4 | Mine test layout (co-located vs separate) as an evidence-backed standard | U2 |
| R5 | `aisdlc status`: phase/freshness, blocking-gap count, evidence coverage (read-only) | U4 |
| R6 | `aisdlc explain <n>`: print standard n + its sources; safe on out-of-range/no-overlay | U5 |
| R7 | Surface evidence coverage at customize/compile; warn on zero-source standards | U6 |
| R8 | Architecture/convention inputs feed the `mined` fingerprint; re-run stays a no-op | U1, U2, U7 |

---

## Key Technical Decisions

- **Architecture detection is heuristic and evidence-bound.** Identify the primary source root (the dir containing the most source files, e.g. `src/`), enumerate its immediate subdirectories as the module map, and read entrypoints from manifests (`package.json` `bin`/`main`, `pyproject` scripts). Every recorded item cites the directory/file it came from; a flat or empty repo yields *no* architecture standard rather than a fabricated one. Avoids brittle "layer inference" — the module map + entrypoints are observable facts.
- **Commit-convention mining shells out to git, guarded.** `git log --format=%s -n 50` via `execFileSync` wrapped in try/catch: no git binary, not a repo, or empty history → skip silently (no claim). A standard is asserted only when a clear majority (≥70% of sampled, ≥5 samples) matches the Conventional Commits subject regex. This is the only new external process; it is read-only and failure-tolerant.
- **`status` and `explain` are strictly read-only.** They load existing artifacts (`.sdlc/setup-state.yaml`, the resolved overlay's standards-index, the gap list) and never write `.sdlc`. This keeps them safe to run anytime and trivially idempotent.
- **Evidence coverage = standards-index metric.** Coverage = `standards with sources.length>0 / total standards`. Computed once from `StandardsIndex`, reused by `status` (R5) and the customize/compile surface line (R7).
- **New mined fields join the `mined` fingerprint.** Architecture + conventions are added to the profile inputs hashed for the `mined` phase, so unchanged inputs still short-circuit and changed structure correctly invalidates freshness.

---

## Implementation Units

### U1. Architecture mining in the repo miner
- **Goal:** Capture the module map + entrypoints with evidence.
- **Requirements:** R1, R8
- **Dependencies:** none
- **Files:** `src/customize/repo-miner.ts`, `tests/customize/repo-miner.test.ts`
- **Approach:** Add `architecture?: { sourceRoot: string; modules: string[]; entrypoints: string[] }` to `RepoProfile`. Pick the source root as the top-level dir with the most mined files; modules = its immediate subdirs; entrypoints = manifest `bin`/`main`/scripts. **Root-level-source guard:** when the source root resolves to the repo root (no dominant `src/`-style dir), module candidates are the root's immediate subdirs minus `IGNORE_DIRS` and known non-source dirs (`docs`, `tests`, `spec`, `.github`) so the map stays source-relevant rather than listing docs/test/CI dirs. Record evidence under keys `architecture:module:<dir>` and `architecture:entrypoint:<file>`. Feed these fields into the `mined` fingerprint input.
- **Patterns to follow:** existing framework/linter detection + `addEvidence` usage in the same file.
- **Test scenarios:**
  - Covers AE1. A repo with `src/{adapters,core,cli,customize}` records those modules with the directories as evidence; entrypoint from `package.json` `bin` is captured.
  - A flat repo (no subdir source root) records no architecture and emits no fabricated module list.
  - A root-level-source repo (source files at repo root, no `src/`) lists source subdirs as modules but excludes `docs/`, `tests/`, `.github/`, and ignored dirs.
  - Changing the module set changes the mined fingerprint; an unchanged tree leaves it stable.
- **Verification:** miner unit tests pass; profile shows the module map for this repo with non-empty evidence.

### U2. Convention mining (commit style + test layout)
- **Goal:** Assert commit convention and test layout as evidence-backed claims.
- **Requirements:** R3, R4, R8
- **Dependencies:** U1 (same file; land after U1 to avoid churn)
- **Files:** `src/customize/repo-miner.ts`, `tests/customize/repo-miner.test.ts`
- **Approach:** Add `conventions?: { commits?: "conventional"; testLayout?: "co-located" | "separate" }`. Commit detection via guarded `execFileSync("git", ["log","--format=%s","-n","50"])`; majority Conventional-Commits → set `commits: "conventional"` with sampled subjects as evidence (`convention:commits`). Test layout from already-walked file list: `*.test.*`/`*.spec.*` → co-located, else a `tests/`|`spec/` dir → separate; evidence = sample paths (`convention:test-layout`). Add to the `mined` fingerprint.
- **Patterns to follow:** fs-only detection already in the miner; isolate the git call behind a small helper with try/catch.
- **Test scenarios:**
  - Covers AE2. Mocked/sampled subjects that are majority `feat:/fix:` → conventional standard with evidence; freeform subjects → no claim; no-git → no claim, no throw.
  - Covers AE3. A fixture with `x.test.ts` → co-located; a fixture with `tests/x.ts` → separate.
  - Convention inputs participate in the mined fingerprint.
- **Verification:** miner unit tests pass; git-absent path is exercised and does not throw.

### U3. Emit architecture + convention standards
- **Goal:** Turn the new profile fields into evidence-backed standards in the index.
- **Requirements:** R2
- **Dependencies:** U1, U2
- **Files:** `src/customize/emitters.ts`, `tests/customize/emitters.test.ts`
- **Approach:** In `buildStandardsIndex`, append a "Project architecture: modules X, Y; entrypoints …" standard (sources = architecture evidence) when architecture is present, and commit/test-layout standards (sources = convention evidence) when present. No standard emitted when the corresponding field is absent (preserves evidence coverage).
- **Patterns to follow:** existing `standards.push({ statement, sources })` blocks for runner/linter/framework.
- **Test scenarios:**
  - Covers AE1. Architecture present → a "Project architecture" standard with non-empty sources.
  - Conventions present → commit + test-layout standards with sources; absent → no such standards, coverage unchanged.
- **Verification:** emitter tests pass; emitted standards all carry sources.

### U4. `aisdlc status` command
- **Goal:** Read-only report of the four strategy metrics.
- **Requirements:** R5
- **Dependencies:** none (reads existing artifacts; reflects U1–U3 once present)
- **Files:** `src/cli/status.ts` (new), `src/cli/index.ts`, `tests/cli/status.test.ts` (new)
- **Approach:** New `runStatus({ sdlcDir, overlay })` that reads `readSetupState`, resolves the overlay's standards-index, and computes evidence coverage + freshness (would a re-run be a no-op?). **Blocking-gap source (read-only):** mining is itself read-only, so `status` derives blocking gaps by running the existing gap detection against the current repo/overlay *in memory* without writing `.sdlc` — never by re-running `customize`. Prints a compact report including a **numbered list of standards** (so `aisdlc explain <n>` numbering is discoverable and stable). Wire `cmdStatus` + `case "status"` + HELP line. No writes.
- **Patterns to follow:** `resolveOverlay`, `runSmokeCli` structure, `parseArgs`.
- **Test scenarios:**
  - Covers AE4. Given a set-up fixture: reports 0 blocking gaps, re-run-no-op true, a coverage %, and lists any zero-source standard.
  - No `.sdlc`/overlay → a clear "not set up yet" message, exit non-zero, no crash, no writes.
- **Verification:** status tests pass; running it leaves `.sdlc` byte-identical.

### U5. `aisdlc explain <n>` command
- **Goal:** Show the evidence behind a standard.
- **Requirements:** R6
- **Dependencies:** none
- **Files:** `src/cli/explain.ts` (new), `src/cli/index.ts`, `tests/cli/explain.test.ts` (new)
- **Approach:** New `runExplain({ index, n })` printing standard n (1-based, as numbered by `status`/the standards-index) with statement + sources. Wire `cmdExplain` + `case "explain"` + HELP line. Out-of-range or missing overlay → clear message, non-zero exit, no stack trace.
- **Patterns to follow:** `runStatus` overlay resolution; `fail()` for clean error exits.
- **Test scenarios:**
  - Covers AE5. `explain 1` prints the first standard and its sources.
  - `explain 999` → clear out-of-range message, non-zero exit; `explain` with no overlay → clear message.
  - `explain abc` (non-numeric) → clear usage message.
- **Verification:** explain tests pass.

### U6. Surface evidence coverage at customize/compile
- **Goal:** Make coverage visible without running `status`; warn on zero-source standards.
- **Requirements:** R7
- **Dependencies:** none (uses standards-index)
- **Files:** `src/cli/index.ts`, `tests/cli/*` (extend existing customize/compile output assertions if present; otherwise a focused test)
- **Approach:** After customize/compile build the standards-index, print one line: `Evidence coverage: N/M standards cite a source.` and, when any standard has zero sources, a warning naming the count. Reuse the coverage helper from U4.
- **Patterns to follow:** existing drift/gap output lines in `cmdCustomize`/`cmdCompile`.
- **Test scenarios:**
  - Output includes a coverage line after customize.
  - A standard with zero sources triggers the warning line.
- **Verification:** existing CLI output tests updated and green.

### U7. Tests + golden snapshot update
- **Goal:** Lock the new behavior and intentionally refresh the golden compile output.
- **Requirements:** R8
- **Dependencies:** U1–U6
- **Files:** `tests/golden/compile.test.ts` (snapshot), `tests/customize/setup-state.test.ts` (fingerprint), any fixtures
- **Approach:** Run the suite; the golden compile output changes because the emitted overlay now carries architecture/convention standards — review the diff to confirm it contains only the intended new standards, then update the snapshot. Add/extend a freshness test asserting that adding architecture/convention inputs keeps a second run a no-op when inputs are unchanged.
- **Patterns to follow:** prior intentional golden updates this session (`vitest run -u` after confirming the diff).
- **Test scenarios:**
  - Golden diff contains only the new evidence-backed standards.
  - Unchanged inputs → `mined` fingerprint stable → re-run no-op (freshness test).
- **Verification:** full `npm test` green; golden diff reviewed and intentional.

---

## System-Wide Impact

- **Freshness/idempotency:** new mined fields must join the `mined` fingerprint (U1, U2) or re-runs would wrongly short-circuit on structural change — covered by U7.
- **Golden output:** the emitted overlay/standards change; the snapshot update is expected and must be diff-reviewed, not blind-accepted.
- **Self-pollution guard:** architecture mining enumerates source dirs — it must continue to honor `IGNORE_DIRS` and the emitted-paths exclusion so generated config (`.sdlc`, emitted `.claude/` etc.) never becomes a "module."

---

## Scope Boundaries

### Deferred to follow-up work
- S5 language/framework breadth (Go, Rust, Java, Ruby); S6 monorepo/nested-manifest mining; S7 GitLab CI mining.
- Per-role *targeted* architecture grounding beyond the shared constitution/standards path (current approach routes the architecture standard through the existing overlay so it already reaches the Architect).
- Git hooks / watch-mode auto-re-alignment.

### Out of scope
- Any LLM participation in artifact generation; new host adapters; mutating commands beyond the existing customize/compile/smoke.

---

## Risks & Dependencies

- **Heuristic architecture quality.** Mitigation: keep it to observable facts (module dirs + entrypoints), pin the expected shape for this repo in AE1, emit nothing when signals are absent.
- **git invocation portability.** Mitigation: guarded `execFileSync` with full try/catch; absence is a normal "no claim" path, tested.
- **Golden churn masking regressions.** Mitigation: U7 requires diff review before `-u`.
