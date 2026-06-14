---
date: 2026-06-14
topic: setup-customize-command
focus: a command that helps with initial setup of Cursor/Claude/Copilot + improving the /customize skill
mode: repo-grounded
---

# Ideation: Initial-Setup / `/customize` Command for ai-sdlc

## Grounding Context (Codebase Context)

`ai-sdlc` is a TypeScript framework: a host-neutral base (`sdlc-base/` — an `AGENTS.md`
constitution with 4 hard gates, host-manifest, roles architect/engineer/reviewer/debugger,
skills `customize` + `sdlc-loop`, gitlab/jira integration contracts) plus a compiler that emits
host-native config for **Cursor, Claude Code, and GitHub Copilot**.

CLI today (`aisdlc`): `compile` (base+overlay → host files), `customize` (mine repo → gaps →
emit `.sdlc/overlay/.customize.yaml` + `standards-index.yaml`), `upgrade` (re-pin base, block on
conflicts), `smoke` (validate compiled config), `gen-matrix`.

Customize flow: `mineRepo` (depth-4 walk; detect langs/frameworks/test-runner/linters/CI/CODEOWNERS;
evidence map) → `computeGaps` (3 gaps: `test-command`, `gitlab-server`, `jira-server`, asked only if
unmineable) → emit evidence-backed overlay + standards index → drift diff on re-run.

Key first-run gaps: **NO `init`/`setup` command** (manual customize→compile→smoke chain, documented
only in the skill); interview is **non-interactive** (hand-edit YAML); **no host detection** (compiles
all 3); `customize` ignores smoke for "ready" (`ready: gaps.length === 0` vs the harness's
`evaluateReadiness(gaps===0 && smoke.passed)` which is wired only in tests); smoke is **synthetic**;
gap catalog is tiny (3) and `test-command` isn't auto-filled from mining; no root README;
`templates/overlay/` is never copied; `docs/solutions/` learnings store is empty.

External grounding (2026): Claude `/init` (non-destructive, interactive review-before-write),
`specify init` (detects installed agents), Agent OS `/discover-standards` (confirm-per-standard →
`index.yml`), BMAD `install` (`--yes`/`--dry-run`/idempotent), AGENTS.md as the AAIF/Linux-Foundation
standard (concise, exclude discoverable; LLM-auto-generated context = −2-3% success/+20% cost),
~70% portable / ~30% host-specific split, sync tools (rulesync/dotai), validation tiers L0→L5.
UX that sticks: <5min to first verified action, dry-run, idempotent re-run, host detection, explicit
next-step. (The Levi9 `ai9.levi9.com/docs/claude-code-setup` page was SSO-walled and not read.)

## Topic Axes
1. First-run flow & command orchestration (the missing `init`)
2. Repo mining & gap interview (detection depth, interactivity)
3. Host detection & multi-host targeting
4. Preview, idempotency & safety (dry-run, undo, drift, non-destructive merge)
5. Validation & readiness (smoke realism, scoring, next-step)

## Ranked Ideas

### 1. `aisdlc init` — one phased, resumable setup command (+ a skill twin)
**Description:** Add the missing entrypoint. `init` scaffolds `.sdlc/overlay/` from `templates/overlay/`,
then runs `customize → compile → smoke` as named, idempotent phases backed by a `bootstrap-state.yaml`
(`mined → overlay-written → compiled → smoke-passed`). Re-runs skip completed phases and only review
drift; failures print the one command to resume. Mirror it with a zero-terminal path: the `/customize`
skill orchestrates the same pipeline via tool calls for IDE-only users.
**Axis:** First-run flow & command orchestration
**Basis:** `direct:` `src/cli/index.ts` exposes only `compile|customize|smoke|upgrade|gen-matrix`; the
chain lives only in `sdlc-base/skills/customize/SKILL.md` and `templates/overlay/README.md`;
`templates/overlay/` is never copied by any CLI path. `external:` Claude `/init`, `specify init`,
BMAD `install`, terraform `init` collapse setup into one resumable command.
**Rationale:** The #1 abandonment point is "I ran one command, now what?" — agents stop after `customize`
because `ready: true` feels done. A durable state spine lets CI mirror the human happy path.
**Downsides:** New top-level surface; must stay idempotent and gate scaffold behind detection.
**Confidence:** 92% · **Complexity:** Medium · **Status:** Explored

### 2. Mine the runnable test command + confidence-tiered gap triage
**Description:** The miner detects `testRunner` but never persists the actual command, so the
"tests must pass" gate has nothing to run. Extend `mineRepo` to extract `npm test`/`make test`/`pytest -q`
from `package.json` scripts, Makefile, and CI into `interviewAnswers.test-command` with evidence. Triage
gaps by confidence (auto-close mined, default medium, prompt only the truly unmineable) and **defer**
`gitlab-server`/`jira-server` until a role needs them, so thin/POC repos reach ready with zero prompts.
Expose the already-modeled `answers` via `--answers-file`.
**Axis:** Repo mining & gap interview
**Basis:** `direct:` `repo-miner.ts` L184–189 sets `testRunner` but no command; `gap-interview.ts` closes
`test-command` on `Boolean(p.testRunner)` while the literal command is lost; `gitlab-server`/`jira-server`
are always-unanswered org secrets that block `ready`; `CustomizeOptions.answers` exists but the CLI never
passes it. `external:` Agent OS `/discover-standards`; ER-triage "sort before question."
**Rationale:** Forcing org-specific MCP IDs on day one is the main reason `customize` prints "Interview
needed" on otherwise-configured repos, and trains people to put garbage in YAML to unblock.
**Downsides:** Command inference is ambiguous when CI/Makefile/scripts disagree — needs disambiguation.
**Confidence:** 90% · **Complexity:** Low–Medium · **Status:** Explored

### 3. Host auto-detection + persisted host-probe manifest
**Description:** Probe for installed hosts (`.cursor/`, `CLAUDE.md`/`claude` binary,
`.github/copilot-instructions.md`) and default `--hosts` to the detected subset instead of always emitting
all three. Persist `.sdlc/host-probe.yaml` recording targeted hosts and accepted degradations (e.g.
Copilot IDE `PreToolUse` gap → CI fallback). `--all-hosts` forces full emit for portability.
**Axis:** Host detection & multi-host targeting
**Basis:** `direct:` `src/core/engine.ts` defaults to every manifest host when `--hosts` omitted; no
detection module exists; Copilot adapter permanently declares `COPILOT_GATE_GAP`. `external:` `specify init`
detects installed agents; ~70/30 portable/host-specific split.
**Rationale:** Emitting three hosts into a single-host repo creates noise, gitignore debates, and false
"drift" — reads as bloat on first contact.
**Downsides:** Detection heuristics (repo vs machine scope) need care; risk of under-emitting for teammates.
**Confidence:** 86% · **Complexity:** Medium · **Status:** Unexplored

### 4. `--dry-run` preview-before-write + non-destructive merge + repo/local overlay split
**Description:** `customize` always writes the overlay, so people fear losing hand edits and stop re-running.
Add `--dry-run` that builds in memory and prints a unified diff (with per-field content hashes to separate
real drift from hand edits), persisting only on `--apply`; preserve unknown/hand-edited keys on merge.
Split overlay into committed `overlay/repo/` (standards, integration names) vs gitignored `overlay/local/`
(server URLs, tokens).
**Axis:** Preview, idempotency & safety
**Basis:** `direct:` `src/cli/customize.ts` L60–61 unconditionally writes both files; drift reported after
overwrite; gaps mix repo-scoped (`test-command`) with machine-scoped (`gitlab-server`, `jira-server`).
`external:` Claude `/init` review-before-write; terraform plan-before-apply; chezmoi repo-vs-machine scope.
**Rationale:** Makes re-running safe, which keeps the standards index tracking real code instead of rotting.
**Downsides:** Diff/merge logic + two-layer overlay add surface area.
**Confidence:** 85% · **Complexity:** Medium · **Status:** Unexplored

### 5. Wire `evaluateReadiness` into the CLI + a readiness ledger (kill false-green `ready`)
**Description:** The harness defines `evaluateReadiness(gapCount, smoke) = gaps===0 && smoke.passed`, but
`runCustomize` returns `ready: gaps.length === 0` and never runs smoke. Wire the real gate into `init`
(or `customize --gate`), exit non-zero with per-check remediation, and persist `.sdlc/readiness.yaml` with
scored dimensions so CI can `--fail-under 80` and ratchet. Optionally persist the overlay only once
readiness passes (smoke-before-write).
**Axis:** Validation & readiness
**Basis:** `direct:` `src/cli/customize.ts` L68 vs `src/smoke/harness.ts` L102–104; `evaluateReadiness`
is imported only in tests. `external:` readiness scoring with CI `--fail-under` commoditizing in 2026;
"verification theater" anti-pattern.
**Rationale:** False-green "ready" is the worst outcome — teams debug setup bugs as task bugs. Highest-integrity,
lowest-cost fix.
**Downsides:** Smoke on every `customize` slows iteration — needs `--skip-smoke`.
**Confidence:** 91% · **Complexity:** Low · **Status:** Unexplored

### 6. Make smoke real and tiered
**Description:** Today's smoke is synthetic. Upgrade: (a) L0 sectional per-host shape checks run in parallel,
fail fast; (b) compile-time dependency preflight rejects overlays referencing an MCP/gate a host can't
express (uses the capability matrix + contracts); (c) the ensemble check executes the mined test command as
gate-zero instead of a mock; (d) a First-Article cadence runs the heavy behavioral pass only on first compile
or version bump.
**Axis:** Validation & readiness
**Basis:** `direct:` `src/smoke/harness.ts` uses `runCannedTask()` mock; `repo-miner.ts` has the test command
(per #2); the capability matrix + contracts encode valid host/MCP edges. `external:` validation tiers L0→L3,
First-Article Inspection, prove-it L4, orchestra sectional→ensemble.
**Rationale:** Synthetic smoke proves shape, not that emitted bindings work on the team's host — closing this
loop makes "ready" trustworthy.
**Downsides:** Real tests/agents in smoke raise cost/CI-safety — keep MCP mocked, gate heavy passes behind FAI.
**Confidence:** 80% · **Complexity:** Medium–High · **Status:** Unexplored

### 7. Compounding standards-index → compiled skill context + gated drift-promotion
**Description:** `customize` emits `standards-index.yaml` but nothing reads it back. Teach `compile` to inject
top-ranked evidence-backed statements into the emitted `sdlc-loop` skill preamble, so each re-`customize`
refreshes agent context without editing `sdlc-base/skills/`. Turn `diffStandardsIndex` deltas into gated
promotion candidates under `docs/solutions/pending/` (bootstrapping the empty learnings store), promoted only
on explicit approval — `/ce-compound`-style, with a strict promotion gate.
**Axis:** Repo mining / leverage
**Basis:** `direct:` `buildStandardsIndex()` writes the index but `runCompile` never reads it;
`diffStandardsIndex` reports drift to stdout only; `docs/solutions/` is empty. `external:` Compound Engineering
`/ce-compound`; Agent OS living `index.yml`; Devin `known_bugs` steering.
**Rationale:** Frameworks pick heavy ceremony OR light sync; memory that improves each run is the strongest
reason to keep using this over a static scaffold.
**Downsides:** Accretion → noise without strict promotion gates and a pruning story; higher complexity.
**Confidence:** 78% · **Complexity:** Medium–High · **Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Pre-commit continuous re-customize | Brainstorm variant; one-shot-vs-continuous already folded in prior universal-setup doc |
| 2 | Decompose `/customize` into discover/propose/apply | Folded into #1 (phases) + #4 (preview) |
| 3 | Mining fingerprint cache / evidence-demand depth | Premature optimization at current scale; revisit for monorepo/org rollout |
| 4 | Zero-terminal / AGENTS.md first-turn gate | Folded into #1 as the skill twin |
| 5 | Setup-as-state reframe | Folded into #1's `bootstrap-state.yaml` |
| 6 | Setup status artifact + next-command printer | Folded into #1 (state file) + #5 (readiness ledger) |
| - | Axis coverage | All 5 axes have ≥1 survivor (A2 and A5 have 2) — no gaps |
