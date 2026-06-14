# Ideation — Strategy-aligned improvements to ai-sdlc

_Date: 2026-06-14 · Mode: repo-grounded · Grounding: `STRATEGY.md`, `src/customize/repo-miner.ts`, `src/cli/*`, prior shipped work (setup chain, track-aware compilation)_

## Grounding context

**Strategy (verbatim anchors).**
- **Target problem:** off-the-shelf agents/skills don't fit a real project (wrong test command, linter, framework, conventions); hand-alignment is costly and drifts.
- **Approach:** derive each agent's config from the repo itself — mine the real stack **and architecture** into an evidence-backed overlay where every standard cites its source, so roles like the **Architect carry rules grounded in the actual project**; keep aligned via freshness/drift.
- **Tracks:** (1) Repo mining & evidence, (2) Freshness & re-alignment, (3) Setup orchestration & UX.
- **Metrics:** hands-off setup rate, blocking gaps at first run, evidence coverage, re-run-is-a-no-op.

**Codebase reality (the gap to close).** `RepoProfile` mines `languages, frameworks, testRunner, testCommand, linters, packageManagers, manifests, ciFiles, codeowners, docs, evidence`. It does **not** mine **architecture** (module/layer structure, entrypoints, directory roles) or **conventions** (naming, commit style, test-file layout). The Architect role therefore carries no project-specific architectural rules — a direct miss against the stated approach. Separately, the four strategy metrics are **defined but uninstrumented**: nothing computes or reports them.

> Generation method: grounded directly by the orchestrator (deep prior context this session) across the three tracks + cross-cutting; external research skipped for momentum.

---

## Survivors (ranked)

### S1. Architecture mining → Architect-grounded standards _(Track: Repo mining & evidence)_
Detect concrete architecture signals — top-level module/directory roles, entrypoints, layering (e.g. `src/adapters`, `src/core`, `src/cli`), and the dependency direction between them — and emit an **evidence-backed "project architecture" standard** plus Architect-role context.
- **basis** `direct:` `RepoProfile` has no architecture field; the Architect role body is generic. STRATEGY's approach explicitly names "mine … architecture … so the Architect carries rules grounded in the actual project."
- **why it matters** Closes the single biggest gap between the stated approach and the implementation. This is the headline differentiator.
- **meeting test** Yes — what counts as "architecture" worth mining is a real design discussion.

### S2. `aisdlc status` — instrument the strategy metrics _(Track: Freshness & re-alignment / cross-cutting)_
A read-only command that reports the four strategy metrics for the current repo: hands-off setup rate proxy (blocking gaps at first run = 0?), open blocking gaps, **evidence coverage** (% of emitted standards citing a source), and freshness state (which phases are fresh / a re-run would be a no-op).
- **basis** `direct:` metrics live latently in `.sdlc/setup-state.yaml`, `standards-index.yaml`, and the gap list, but nothing surfaces them. `STRATEGY.md` defines them as the feedback loop.
- **why it matters** You can't improve hands-off rate or evidence coverage without measuring them; cheap to build on existing artifacts; makes the strategy self-monitoring.
- **meeting test** Yes — which metrics to surface and their exact definitions.

### S3. Convention mining _(Track: Repo mining & evidence)_
Mine project conventions with evidence: file/naming casing, test-file layout (`*.test.ts` vs `tests/`), and **commit-message convention** (sampled from `git log`). Emit as evidence-backed standards.
- **basis** `direct:` the target problem literally names "wrong … conventions"; miner detects CODEOWNERS but no naming/commit conventions.
- **why it matters** Directly attacks the stated problem; conventions are what generic configs most often get wrong.
- **meeting test** Yes — which conventions are worth asserting vs noise.

### S4. `aisdlc explain <standard>` + evidence-coverage surfacing _(Track: Setup orchestration & UX)_
Show the source files behind any emitted standard, and surface evidence coverage (and any zero-source standards) at compile/customize time.
- **basis** `direct:` `evidence` is already recorded per claim and we recently fixed framework standards to carry sources; nothing lets a user *see* the evidence or catch a coverage regression.
- **why it matters** Makes the "evidence-backed" bet legible and trustworthy — the trust half of the approach; very low cost.
- **meeting test** Borderline-yes — pairs naturally with S2.

### S5. Language/framework breadth (Go, Rust, Java, Ruby) _(Track: Repo mining & evidence)_
Extend detection beyond Python/JS-TS to more stacks, each evidence-backed.
- **basis** `reasoned:` widening alignment to more repos extends the existing manifest-detection pattern with low architectural risk.
- **why it matters** Grows the set of projects the tool can align for; modest, incremental.
- **meeting test** Weak-yes — mostly mechanical; included as breadth.

### S6. Monorepo / nested-manifest mining _(Track: Repo mining & evidence)_
Detect workspaces and resolve per-package test commands and stacks.
- **basis** `direct:` explicitly deferred in the setup plan ("monorepo/nested-manifest test-command resolution").
- **why it matters** Real for non-trivial repos; heavier lift, lower near-term frequency for the solo-dev persona.
- **meeting test** Yes.

### S7. CI mining beyond GitHub Actions (GitLab CI) _(Track: Repo mining & evidence)_
Mine `.gitlab-ci.yml` for the test command, mirroring the GitHub Actions miner.
- **basis** `direct:` deferred in the setup plan; coherent with the existing `gitlab` integration contract.
- **why it matters** Extends test-command mining to GitLab shops; medium.
- **meeting test** Weak-yes.

---

## Rejected (with reasons)

- **`--watch` mode (auto re-run on file change).** YAGNI — freshness already makes manual re-runs cheap; a watcher is heavy daemon surface for little gain. A git hook (below) is the lighter form, and even that is deferred.
- **Git pre-commit/post-checkout hook to auto-re-align.** Plausible but adds host-git coupling and lifecycle complexity; freshness makes re-runs a no-op already. Revisit after S2 makes drift visible.
- **Interactive CLI (TTY) interview for blocking gaps.** Duplicates the product's actual delivery model — the agent/skill conducts the interview and writes the overlay. Building a second prompt path competes with the core bet.
- **`aisdlc doctor`.** Folds entirely into S2 (`status`) + existing `smoke`; no distinct value.
- **Standalone drift-history changelog.** Partially exists (`core/memory.ts` `recordStandardsDelta`); fold the surfacing into S2 rather than a new artifact.

---

## Handoff

Strongest cohesive cluster for one implementable plan: **S1–S4** (deepen mining with architecture + conventions, and instrument/expose the evidence+alignment metrics). **S5–S7** are breadth/heavier — carry as deferred follow-ups. Next: `ce-brainstorm` on the surviving set to define scope precisely.
