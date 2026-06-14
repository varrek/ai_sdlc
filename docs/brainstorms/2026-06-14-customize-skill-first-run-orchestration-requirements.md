---
date: 2026-06-14
topic: customize-skill-first-run-orchestration
type: requirements
scope: deep-feature
status: draft
upstream: docs/ideation/2026-06-14-setup-customize-command-ideation.md
---

# Requirements: `/customize` as First-Run Orchestrator

## Summary

Make the `/customize` skill drive the whole first-run chain — mine → compile → smoke — as
resumable phases, reporting "ready" only when the emitted config is valid and smoke passes. The
CLI subcommands stay composable building blocks the skill calls. Underneath, the miner extracts the
runnable test command and defers org-specific integration gaps so a fresh repo reaches "ready" with
zero hand-editing.

## Problem Frame

Today the first-run chain exists only as prose in `sdlc-base/skills/customize/SKILL.md` and
`templates/overlay/README.md`: a developer must run `aisdlc customize`, hand-edit
`.sdlc/overlay/.customize.yaml`, then run `compile`, then `smoke`. Two failure points bite. First,
`customize` returns `ready: gaps.length === 0` and never runs smoke, so a run that *feels* done can
still fail the gate the skill calls a hard exit. Second, the gap interview blocks on
`gitlab-server`/`jira-server` — org-specific MCP IDs nobody can answer on a fresh repo — which
contradicts the framework's own success criterion of "zero hand-edited config required to reach
ready" and trains people to put placeholder junk in YAML to unblock.

## Key Decisions

- **Skill orchestrates; CLI stays composable.** The `/customize` skill is the first-run orchestrator
  for IDE users; the `customize`/`compile`/`smoke` subcommands remain independently runnable pieces
  it composes. No new top-level `init` installer command is added — this keeps faith with the prior
  framework decision that `/customize` ships as a Skill and CLI-as-primary-installer was rejected.
- **Deferred integrations define "setup-ready".** "Ready" means mined config is valid and smoke
  passes with integrations unbound/mocked. Integration bindings surface only when a task needs them.
  This is a deliberate trade of a fully-wired guarantee for zero-touch first-run.
- **Full resumable phase state, made drift-safe.** Setup persists phase state and resumes from the
  failed phase rather than restarting — but freshness wins: re-mining and input hashing invalidate
  stale downstream phases so resume never acts on stale state.
- **Test-command mining is zero-touch.** The miner picks a runnable test command by the fixed
  priority CI > Makefile > package.json/pyproject and records the choice with evidence, never
  prompting on conflict.
- **Deferred integrations surface just-in-time.** GitLab/Jira bindings are checked as a role/skill
  precondition at the step that needs them, not via upfront prompts or a separate command.

## Requirements

**Skill orchestration**
- R1. The `/customize` skill drives the full first-run chain (mine → compile → smoke) from a single
  invocation, rather than relying on the user to run the subcommands in sequence.
- R2. The `customize`, `compile`, and `smoke` CLI subcommands remain independently runnable building
  blocks; the skill composes them and interprets their results. No new installer command is introduced.

**Readiness & gating**
- R3. The skill reports "ready" only when the emitted config is schema-valid **and** the smoke run
  passes — replacing today's gaps-only `ready` signal with the dual gate.
- R4. Unmineable integration bindings (`gitlab-server`, `jira-server`) are deferred: setup reaches
  "ready" with integrations unbound/mocked. They are surfaced just-in-time as a role/skill
  precondition — when the loop reaches a step that needs GitLab/Jira (e.g. wrap-up), it checks the
  binding and prompts then, never up front.
- R5. "Setup-ready" explicitly excludes live Jira/GitLab wrap-up validation; the skill communicates
  that a green setup is not a fully-wired integration.
- R6. On any phase failure, the skill surfaces a structured fix path and the resume point — never a
  green flag.

**Repo mining (gap closure)**
- R7. The miner extracts a *runnable* test command (e.g. `npm test`, `make test`, `pytest -q`), not
  just the runner name, and records it in the overlay with the repo evidence path it was derived from.
- R8. When multiple sources define a test command and they conflict, the miner selects by the fixed
  priority **CI > Makefile > package.json/pyproject**, records the chosen command and its evidence,
  and does not prompt. (CI is the most authoritative because it gates merges.)
- R9. Gaps the miner can resolve are auto-closed; only genuinely unmineable items can surface as
  interview gaps, and integration gaps are deferred per R4.

**Phase state & resume**
- R10. The skill persists first-run phase state (mined → overlay-written → compiled → smoke-passed)
  in a dedicated `.sdlc/setup-state.yaml`, separate from `project.lock` (which remains the base-version
  pin), so an interrupted or failed run can resume from the failed phase instead of restarting.
- R11. On resume, the skill cheaply re-checks inputs (re-mine + hash overlay/manifests); if inputs
  changed, it invalidates downstream phases and re-runs from the earliest stale phase.

## Key Flows

- F1. **First-run happy path.** Developer invokes `/customize` in a fresh repo. **Mine:** detect
  stack + runnable test command, record evidence. **Overlay:** emit schema-valid overlay + standards
  index, integrations left unbound. **Compile:** emit host-native config. **Smoke:** run the existing
  Engineer→Reviewer canned check against mocks. **Gate:** config valid + smoke green → report
  "setup-ready (integrations deferred)" with the phase state recorded.
- F2. **Resume after failure or drift.** Developer re-invokes `/customize` after a failed smoke or
  after the repo/overlay changed. The skill re-mines and hashes inputs against recorded phase state;
  unchanged phases are skipped, the earliest stale phase and everything downstream re-run, and the
  run ends at the same dual gate as F1.

## Acceptance Examples

- AE1. **Covers R3, R4.** A Python repo with a detected `pytest` command and no GitLab/Jira signals:
  `/customize` completes with no interview prompts and reports "setup-ready"; smoke passes with
  integrations unbound.
- AE2. **Covers R3.** Config emits but the smoke canned task fails: the skill reports NOT ready with
  the failing check and resume point, even though zero gaps remain.
- AE3. **Covers R8.** A repo where `package.json` `scripts.test` and a `Makefile` `test` target
  disagree: the miner records the higher-priority command with its evidence path and does not prompt.
- AE4. **Covers R11.** After a successful run, the overlay is hand-edited and `/customize` is
  re-invoked: the skill detects the changed input, invalidates compile/smoke, and re-runs from the
  overlay phase forward rather than reporting the stale "smoke-passed" state.

## Scope Boundaries

**Deferred for later:** host detection / multi-host targeting (ideation #3); real/tiered smoke that
executes the project's tests (ideation #6); compounding standards-index → compiled skill context and
gated drift-promotion (ideation #7); dry-run/preview-before-write and the repo-vs-local overlay split
(ideation #4). The skill gates on the *existing* synthetic smoke for now.

**Outside this effort's identity:** changing the four non-negotiable base gates; autonomous wrap-up
without the human `Approved?` gate; turning the CLI into the primary installer.

## Dependencies & Assumptions

- Builds on the existing `customize`/`compile`/`smoke` subcommands and the `evaluateReadiness(gaps,
  smoke)` helper already present in `src/smoke/harness.ts` (today wired only in tests).
- Assumes the existing synthetic smoke harness is the gate for v1; smoke realism is deferred.
- Assumes the miner can reach a runnable test command from `package.json` scripts, `Makefile`, and
  CI for the common stacks (the framework's open language-agnostic-mining assumption still applies).

## Outstanding Questions

**Deferred to planning**
1. The input-fingerprinting/hashing scheme for freshness detection on resume (R11), and the format of
   `.sdlc/setup-state.yaml`.
2. User-facing messaging copy for "setup-ready (integrations deferred)" vs not-ready states.
