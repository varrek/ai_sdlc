---
date: 2026-06-14
type: feat
status: active
origin: docs/brainstorms/2026-06-14-customize-skill-first-run-orchestration-requirements.md
---

# Plan: `/customize` as First-Run Orchestrator

## Summary

Make the `/customize` skill drive the first-run chain (mine → compile → smoke) and report "ready"
only when the emitted config is schema-valid and smoke passes, with org-specific integrations deferred.
The CLI subcommands stay composable: each becomes freshness-aware and records its phase in
`.sdlc/setup-state.yaml`, so re-running the chain resumes from the earliest stale phase without a new
top-level installer/orchestrator command (the `/customize` skill sequences the existing subcommands).
Underneath, the miner extracts the runnable test command so a fresh repo reaches "ready" with zero
hand-editing.

## Problem Frame

`aisdlc customize` returns `ready: gaps.length === 0` and never runs smoke (`src/cli/customize.ts`),
contradicting the skill's "smoke is the hard exit" promise (`sdlc-base/skills/customize/SKILL.md`).
The gap interview (`src/customize/gap-interview.ts`) blocks `ready` on `gitlab-server`/`jira-server` —
org MCP IDs unanswerable on a fresh repo — defeating the framework's "zero hand-edited config to reach
ready" goal. And the miner detects a test *runner* but never records a runnable test *command*, so the
"tests must pass" gate has no command to run. The chain itself (`customize` → `compile` → `smoke`) lives
only as prose, with no resumable state.

## Key Technical Decisions

- **Skill orchestrates; CLI subcommands stay composable and self-recording.** No new `init`/installer
  command (honors the origin's distribution decision). Each of `customize`/`compile`/`smoke` records
  its phase + an input fingerprint in `.sdlc/setup-state.yaml` and short-circuits its *writes* when its
  inputs are unchanged. The skill runs the three in order; fresh phases no-op, so
  resume-from-earliest-stale falls out of freshness checks (see origin:
  docs/brainstorms/2026-06-14-customize-skill-first-run-orchestration-requirements.md).
- **Why a phase cache and not mtime/no-state.** Origin R10/R11 explicitly chose a persisted phase-state
  machine with downstream invalidation; fingerprints (not mtimes) make resume deterministic across
  machines and let one changed input invalidate exactly the right downstream phases.
- **`.sdlc/setup-state.yaml` is a fingerprint-keyed phase cache**, separate from `project.lock` (which
  stays the base-version pin). Freshness wins on resume: when an input hash changes — or an expected
  artifact is missing — that phase and everything downstream are treated as stale and re-run.
- **`ready` has two distinct meanings, never conflated.** `CustomizeResult.ready` means *blocking gaps
  closed* (the customize-side proxy). Chain `setup-ready` = `evaluateReadiness(blockingGapCount, smoke)`
  and is emitted only by `aisdlc smoke` (and summarized by the skill after the full chain). "Schema-valid
  config" (R3) is enforced at compile/smoke; standalone `customize`/`compile` never assert setup-ready.
- **Integration gaps are deferred, not blocking.** `computeGaps` returns only blocking gaps; integration
  bindings are left unbound and reported via a `deferredIntegrations` field. "Setup-ready" = no blocking
  gaps + smoke passes, with integrations excluded.
- **Test-command source priority is CI > Makefile > package.json/pyproject** (GitHub Actions for CI in
  v1), recorded with evidence, never prompted. An inferred runner always yields a runnable default
  command so runner-only repos don't regress to a blocking gap.
- **Just-in-time integration surfacing lives in the loop, not setup.** Setup leaves integrations unbound
  and marks "setup-ready (integrations deferred)"; the role/skill precondition that prompts for a binding
  when wrap-up needs it is a `sdlc-loop` concern, referenced but not built here.

## High-Level Technical Design

Phase cache + freshness flow the skill drives:

```mermaid
flowchart TD
    A[/customize skill] --> B[aisdlc customize]
    B --> C{mined fresh?}
    C -- no --> E[mine: detect test command, defer integrations]
    C -- yes --> D{overlay fresh vs mine+answers?}
    E --> D
    D -- no --> F[write overlay; record mined + overlay-written]
    D -- yes --> G[skip writes, keep phases]
    A --> H[aisdlc compile]
    H --> I{compiled fresh vs overlay+base?}
    I -- no --> J[emit host config; record compiled]
    A --> K[aisdlc smoke]
    K --> L[mine + computeGaps; run smoke; record smoke-passed]
    L --> M{no blocking gaps AND smoke pass?}
    M -- yes --> N[setup-ready: integrations deferred]
    M -- no --> O[NOT ready: failing phase + fix path + resume entrypoint]
```

Fingerprint inputs per phase (directional): `mined` ← hash of repo mining inputs (manifests, CI files,
Makefile) only; `overlay-written` ← hash of overlay content (mine result + merged answers); `compiled`
← hash of overlay content + base-dir content hash (`project.lock` baseVersion when present, else a hash
of `sdlc-base`); `smoke-passed` ← hash of the emitted config (the paths in `outDir/.sdlc/emitted.json`)
+ base hash, so a framework/base upgrade invalidates smoke.

## Output Structure

```
src/customize/setup-state.ts        # new: phase-state types, read/write, fingerprint, staleness
src/customize/repo-miner.ts         # +runnable test-command extraction
src/customize/gap-interview.ts      # blocking-only gaps; integrations deferred
src/customize/emitters.ts           # record mined test-command into overlay/standards
src/cli/customize.ts                # --answers-file, freshness-aware, record phases, deferred list
src/cli/compile.ts                  # record compiled phase, freshness short-circuit
src/cli/smoke.ts                    # mine+gaps, readiness, record smoke-passed
src/cli/index.ts                    # wire --answers-file; readiness/next-step output
sdlc-base/skills/customize/SKILL.md # skill orchestrates chain + reports setup-ready
```

## Implementation Units

### U1. Setup-state module (phase cache + fingerprints)
**Goal:** A reusable module owning `.sdlc/setup-state.yaml`: phase records, per-phase input
fingerprints, and a staleness computation the subcommands consume.
**Requirements:** R10, R11.
**Dependencies:** none.
**Files:** create `src/customize/setup-state.ts`, `tests/customize/setup-state.test.ts`.
**Approach:** Define `SetupPhase = "mined" | "overlay-written" | "compiled" | "smoke-passed"` and a
`SetupState` carrying, per phase, `{ fingerprint, updatedAt }`. Export `readSetupState(sdlcDir)`,
`writeSetupPhases(sdlcDir, records)` (atomic temp-file + rename so a crash never leaves a half-written
multi-phase update), `fingerprint(parts: string[])` (stable hash via `node:crypto`), and
`stalePhases(state, current: Partial<Record<SetupPhase,string>>)` returning phases whose recorded
fingerprint differs from current **and** all downstream phases. A phase is also stale when its expected
artifact is absent (caller passes which artifacts must exist). Use `yaml` + `node:fs`.
**Execution note:** Implement test-first — the staleness/invalidation logic is the correctness core.
**Patterns to follow:** `readPriorStandards`/`readPriorOverlay` in `src/cli/customize.ts` (corrupt/missing
file → empty, no throw); `src/core/overlay.ts` for `project.lock` yaml I/O style.
**Test scenarios:**
- Happy: writing phases then reading returns each fingerprint + timestamp.
- Edge: missing `setup-state.yaml` → empty state, no throw; corrupt file → empty state **and** a stderr warning (do not silently equate corrupt with missing).
- Staleness: changing the `mined` fingerprint marks mined + all downstream stale; unchanged returns none.
- Overlay-only drift: `mined` unchanged but `overlay-written` fingerprint differs → `overlay-written` + downstream stale, `mined` fresh (covers origin AE4).
- Edge: a later phase recorded but an earlier one missing → earlier + downstream treated stale.
- Artifact-missing: recorded `compiled` fingerprint matches but emitted output absent → `compiled` + downstream stale.
**Verification:** Module unit tests pass; no other module imports break.

### U2. Mine the runnable test command
**Goal:** Extract a runnable test command (not just runner name) with evidence, by fixed source priority.
**Requirements:** R7, R8.
**Dependencies:** none.
**Files:** modify `src/customize/repo-miner.ts`; add a `describe("test command")` block to
`tests/customize/customize.test.ts` (where the existing `describe("repo miner")` tests live); add a
GitHub Actions workflow fixture under `tests/fixtures/sample-repos/`.
**Approach:** Add `testCommand?: string` to `RepoProfile`. Resolve by priority **CI > Makefile >
package.json/pyproject** (CI = GitHub Actions `.github/workflows/*` in v1):
- **CI:** pick the test command from the first workflow file in lexicographic order that has a job/step
  whose run line invokes a test tool (`pytest`, `npm test`, `vitest`, `go test`, `make test`); record
  that step's command, normalized to the test invocation (strip `&&`-chained install prefixes). Evidence
  = the workflow path.
- **Makefile:** the `test:` target recipe. Evidence = `Makefile`.
- **Manifest:** `package.json` `scripts.test`; else, when a runner is inferred (e.g. pytest detected),
  a sensible default for that runner (`pytest`). Evidence = the manifest path.
No prompting on conflict — highest-priority present source wins.
**Patterns to follow:** existing detection + `addEvidence` usage in `repo-miner.ts`.
**Test scenarios:**
- Happy: `package.json` `scripts.test: "vitest run"` → `testCommand: "vitest run"`, evidence `package.json`.
- Edge (conflict): CI workflow + Makefile + package.json all define tests → CI command chosen, evidence is the workflow file.
- Edge: two workflow files define test jobs → lexicographically first chosen (deterministic tie-break).
- Edge: Makefile `test:` present, no package script → Makefile recipe chosen.
- Edge: pytest repo with no scripts → default `pytest`, evidence the manifest/pytest signal.
- Edge: CI command is install-chained (`npm ci && npm test`) → normalized to `npm test`.
- Edge: no test signal anywhere → `testCommand` undefined (drives the remaining blocking gap).
**Verification:** `RepoProfile.testCommand` populated for the sample fixtures with correct evidence and normalization.

### U3. Defer integration gaps; record mined test command
**Goal:** Make the gap interview blocking-only (integrations deferred) and persist the mined test command.
**Requirements:** R4, R7, R9.
**Dependencies:** U2.
**Files:** modify `src/customize/gap-interview.ts`, `src/customize/emitters.ts`, `src/cli/customize.ts`;
update `tests/customize/customize.test.ts`.
**Approach:** In `gap-interview.ts`, drop `gitlab-server`/`jira-server` from the blocking set —
`computeGaps` returns only readiness-blocking gaps (today: `test-command` when no command is available).
Keep an exported `DEFERRED_INTEGRATIONS` list (informational, not blocking). Change the `test-command`
predicate to `Boolean(p.testCommand) || "test-command" in a`. In `runCustomize`/`emitters.ts`, inject
the mined `profile.testCommand` into the answers map **before** `computeGaps` runs, and write it into
overlay `interviewAnswers["test-command"]` plus an evidence-backed standard so the "tests must pass" gate
has a runnable command. Add `deferredIntegrations: string[]` to `CustomizeResult` and a one-line
informational log in `cmdCustomize`. Integrations stay `{}` unless the user supplied a binding
(prior-wins merge unchanged).
**Patterns to follow:** existing `GAPS`/`answered` shape; `buildOverlay` prior-wins merge.
**Test scenarios:**
- Happy: mined `testCommand` → zero blocking gaps; overlay `interviewAnswers["test-command"]` set with evidence.
- Edge: no `testCommand` mined → one blocking `test-command` gap remains.
- Runner-only regression guard: pytest fixture (runner inferred, default command set) → no blocking gap.
- Integrations: fresh repo with no bindings → `computeGaps` returns no gitlab/jira gaps; overlay `integrations` empty; `deferredIntegrations` lists them.
- Re-run: a hand-added `integrations.gitlab` binding is preserved (prior-wins).
- **Existing-test migration:** rewrite `customize.test.ts` cases that currently assert `ready: false` / `gaps: ["jira-server"]` for `python-rags` — after deferral those become ready-eligible with empty blocking gaps.
**Verification:** A Python/TS fixture with detectable tests yields empty blocking gaps without integration prompts; legacy integration-gap assertions updated.

### U4. `customize`: `--answers-file`, freshness, phase recording
**Goal:** Expose the existing `answers` param via `--answers-file`, make `customize` freshness-aware,
and record the `mined` + `overlay-written` phases.
**Requirements:** R1, R2, R10, R11.
**Dependencies:** U1, U3.
**Files:** modify `src/cli/customize.ts`, `src/cli/index.ts`; update `tests/customize/customize.test.ts`
and add `tests/customize/setup-chain.test.ts`.
**Approach:** Add `--answers-file <path>` (YAML/JSON map) parsed in `cmdCustomize` and passed as
`answers` to `runCustomize`. Always run the repo walk to compute current fingerprints — freshness skips
overlay/standards **writes and phase updates**, never the cheap mine itself. Compute the `mined`
fingerprint from mining inputs and the `overlay-written` fingerprint from the *would-be* overlay (mine
result merged with `priorOverlay` + answers-file), so a changed `--answers-file` correctly invalidates.
If `setup-state.yaml` shows both phases fresh, print `"customize fresh — skipped (mined + overlay
unchanged)"` and skip the write; otherwise write the overlay and record both phases in one atomic update
(U1). `--force` is an optional escape hatch that bypasses the skip (off by default).
**Patterns to follow:** `parseArgs` option handling; `resolveOverlay` messaging in `index.ts`.
**Test scenarios:**
- Happy: `--answers-file` values flow into overlay `interviewAnswers`/integration bindings.
- Freshness: second run with unchanged inputs skips the overlay rewrite; a changed `--answers-file` re-records `overlay-written` (and downstream stale).
- Freshness: overlay edited by hand → `mined` stays fresh, `overlay-written` + downstream stale (AE4).
- Edge: missing/invalid answers file → clear error, no partial write.
- Phase: after a successful run, `setup-state.yaml` records `mined` + `overlay-written` atomically.
**Verification:** Re-running `customize` on an unchanged repo is a no-op except drift review; phases recorded atomically; `--answers-file` deltas invalidate correctly.

### U5. Wire readiness; integrations deferred from "ready"
**Goal:** Replace gaps-only `ready` with "no blocking gaps + smoke passes", excluding deferred
integrations, and emit the chain gate from `smoke`.
**Requirements:** R3, R4, R5, R6.
**Dependencies:** U3.
**Execution note:** Land U5 readiness wiring in `smoke.ts` before U6 adds freshness/phase recording there.
**Files:** modify `src/cli/smoke.ts`, `src/cli/index.ts`, `src/cli/customize.ts`; reuse
`evaluateReadiness` in `src/smoke/harness.ts`; update `tests/smoke/smoke.test.ts`.
**Approach:** `runSmokeCli` gains a `--repo` option (default `cwd`); it mines the repo and runs
`computeGaps(profile, overlay.interviewAnswers)` to obtain the blocking gap count, then calls
`evaluateReadiness(blockingGapCount, smokeResult)` — the single chain gate. Because integrations are no
longer blocking gaps (U3), `evaluateReadiness` naturally excludes them. `CustomizeResult.ready` keeps its
narrow meaning (blocking gaps closed) and is documented as *not* setup-ready. On pass, `cmdSmoke` prints
"setup-ready (integrations deferred)" with the `deferredIntegrations` list; on fail, it prints the
failing phase, the fix path, and the resume entrypoint (re-run `/customize` or the stale subcommand) per
R6. The four base gates are unchanged.
**Patterns to follow:** existing `evaluateReadiness` and `cmdSmoke` output.
**Test scenarios:**
- Happy: zero blocking gaps + smoke pass → ready true, "integrations deferred" + deferred list surfaced.
- Covers R3: zero gaps but smoke fails → not ready, failing checks + resume entrypoint listed.
- Edge: a real blocking gap (no test command) → not ready regardless of smoke.
- Output: failure includes the resume-point fields U7 will mirror in the skill.
**Verification:** `evaluateReadiness` (fed by mined gaps) drives the chain exit; a fresh repo with mined tests and no integrations reports setup-ready.

### U6. `compile` + `smoke`: phase recording and freshness
**Goal:** Record `compiled` and `smoke-passed` phases with fingerprints; short-circuit writes when fresh.
**Requirements:** R10, R11.
**Dependencies:** U1, U4, U5.
**Files:** modify `src/cli/compile.ts`, `src/cli/smoke.ts`; update `tests/customize/setup-chain.test.ts`
and `tests/smoke/smoke.test.ts`.
**Approach:** After a successful compile, record `compiled` fingerprinted on overlay content + base-dir
content hash (use `project.lock` baseVersion when present, else hash `sdlc-base`); if fresh and not
forced, print "compiled config fresh — skipped". After smoke, record `smoke-passed` fingerprinted on the
emitted config — reuse the existing `EMITTED_MANIFEST_PATH` (`outDir/.sdlc/emitted.json`) export from
`src/core/engine.ts` to hash the emitted files — plus the base hash, so a base upgrade invalidates. No
`engine.ts` changes are expected (consume its existing export only). `--force` bypasses the skip.
**Patterns to follow:** `runCompile`/`runSmokeCli` result handling in `index.ts`; `EMITTED_MANIFEST_PATH` in `engine.ts`.
**Test scenarios:**
- Compile records `compiled`; unchanged overlay+base → skip on re-run; changed overlay → recompile.
- First-run with no `project.lock` → compile fingerprint still stable (uses base-dir hash); no throw.
- Smoke records `smoke-passed`; a changed emitted config (via overlay change → recompile) invalidates it.
- Base upgrade (different base hash) → `smoke-passed` stale even if overlay unchanged.
- Integration: customize→compile→smoke on a fixture leaves all four phases fresh; re-running the chain is a full no-op.
**Verification:** The full chain is idempotent across re-runs and resumes from the earliest changed input, including base upgrades.

### U7. `/customize` skill orchestrates the chain
**Goal:** Update the skill so it drives mine→compile→smoke, resumes via freshness, and reports setup-ready.
**Requirements:** R1, R4, R5, R6.
**Dependencies:** U2–U6.
**Files:** modify `sdlc-base/skills/customize/SKILL.md`.
**Approach:** Rewrite the steps so the skill runs `aisdlc customize` (with `--answers-file` when answers
exist — the AE1 first-run happy path needs no flag), then `aisdlc compile`, then `aisdlc smoke`, relying
on freshness short-circuiting for resume. Document that "ready" means setup-ready with integrations
deferred (R5); that GitLab/Jira bind just-in-time as a role precondition at wrap-up (reference
`sdlc-loop`, do not implement here); that placeholder integration IDs are forbidden at setup and wrap-up
hard-stops without real bindings (so a green setup is never mistaken for integration-ready); and that a
failed phase prints a fix path + resume entrypoint and the chain re-runs from there (R6).
**Execution note:** Docs only — no code; keep the four non-negotiable gates unchanged.
**Patterns to follow:** current `sdlc-base/skills/customize/SKILL.md` structure and tone.
**Test scenarios:** Test expectation: none — documentation unit (no behavioral code).
**Verification:** SKILL.md describes the orchestrated chain, setup-ready semantics, just-in-time integrations, and the no-placeholder rule; no stale "edit YAML then re-run" instructions remain.

## Scope Boundaries

**In scope:** the setup chain orchestration, test-command mining, gap triage/deferral, readiness wiring,
phase-state/resume, and the skill update.

**Deferred to Follow-Up Work:** the `sdlc-loop` role-precondition that actually prompts for a GitLab/Jira
binding at wrap-up (this plan only leaves them unbound and records deferral); CI mining beyond GitHub
Actions (GitLab CI / Jenkins) and monorepo/nested-manifest test-command resolution.

**Outside this product's identity (from origin):** host detection / multi-host targeting; real/tiered
smoke that executes the project's own tests; compounding standards-index → skill context; dry-run/preview
and repo-vs-local overlay split; changing the four non-negotiable base gates; a new installer command.

## Risks & Dependencies

- **Fingerprint correctness.** A too-coarse hash makes phases falsely fresh (skips needed re-runs); too
  fine makes everything stale. Mitigation: fingerprint only load-bearing inputs per phase (split per the
  HTD), and treat a missing expected artifact as stale regardless of hash; cover both with U1 tests.
- **State writes spread across subcommands** could leave partial state on a mid-chain failure. Mitigation:
  each command records its phase only after its own success and only after verifying its artifact exists;
  the next command recomputes freshness from actual inputs + artifact presence, not just recorded phases.
- **Standalone subcommands desync the phase graph.** `smoke`/`compile` run alone can advance state without
  upstream phases. Mitigation: `stalePhases` treats a missing upstream phase as forcing the downstream to
  be stale, so a standalone run never yields a false setup-ready; the skill always runs customize first.
- **Skill/CLI drift.** The SKILL.md (U7) must match the CLI behavior; update it last (depends on U2–U6).

## Outstanding Questions

**Deferred to Implementation**
- `--force`: MVP is freshness-only; ship `--force` only as an optional escape hatch on `customize`/
  `compile`/`smoke` for resume debugging and forced re-runs after a base upgrade (base-hash invalidation
  already covers the common upgrade case). Decide final parity while wiring U4/U6.
- Exact `setup-state.yaml` field layout and the hash algorithm (U1) — settle when writing the module.
- User-facing copy for "setup-ready (integrations deferred)" vs not-ready (U5).
- Whether a CI-derived test command that isn't locally runnable (e.g. `docker compose run test`) is
  acceptable given smoke is synthetic and does not execute the project's tests (U2) — fall open to the
  blocking `test-command` gap if normalization can't produce a plausible local command.
