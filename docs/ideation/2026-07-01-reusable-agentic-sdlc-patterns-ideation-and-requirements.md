---
date: 2026-07-01
topic: reusable-agentic-sdlc-patterns
focus: which patterns from a mature single-host agentic SDLC operating model ai-sdlc should encode as host-neutral, compiled capability
mode: repo-grounded
type: ideation+requirements
---

# Reusable Agentic-SDLC Patterns for ai-sdlc

This document combines an **ideation** pass (rank the reusable patterns) and a
**requirements** pass (turn the top picks into a buildable program). The source
material is a mature single-host agentic SDLC operating model; the value for
`ai-sdlc` is to lift the durable patterns out of one tool's configuration and
express them once, host-neutrally, so they compile onto every supported host.

---

# Part I — Ideation

## Grounding Context

**Codebase context.** `ai-sdlc` authors an SDLC once as a host-neutral **Base**
(Constitution, roles, skills, integration contracts), mines a repo into an
evidence-backed **Overlay**, and emits native config for four **Hosts** via pure
**Adapters** (Cursor, Claude Code, Copilot, Codex).

- Roles: `architect`, `engineer`, `tester`, `reviewer`, `debugger`
  (`sdlc-base/roles/*.md`).
- Skills: `customize`, `sdlc-loop`, `tune-roles`, `track-select`, `wrap-up`
  (`sdlc-base/skills/*/SKILL.md`).
- Integration contracts: `gitlab`, `jira`
  (`sdlc-base/integrations/*.contract.yaml`), bound just-in-time as
  **Integration Bindings** with least-privilege role scoping.
- Base gates (`README.md`): Review required, Tests must pass, Approved? gate,
  Least-privilege MCP.
- Overlay carries standards, Integration Bindings, role-model overrides,
  Ceremony Track, and role guidance (`roleAddenda` + `/tune-roles`)
  (`CONCEPTS.md`).
- Existing surfaces to reuse: Accepted Learning Ledger (`.sdlc/memory/`),
  `aisdlc garden-docs`, Behavior-Level Eval, Loop-Quality Score, reference packs
  (`packs/`: security, frontend, backend-api, infra, mobile).

**Strategy (`STRATEGY.md`).** Primary user is a solo developer; the bet is
evidence-backed alignment mined from the repo; the metrics are hands-off setup
rate, blocking gaps at first run, evidence coverage, and re-run-is-a-no-op.

**External practice (generic).** The observed model contributes a set of durable
patterns worth reusing: role-scoped agents with enforced access boundaries, a
documented delegation policy (go/no-go criteria, a no-delegation list, risk
tiers), a parallel multi-lens review gate with conditional lenses, domain-doc
grounding with a code-path-to-doc map, an "improve the instruction, not the
diff" loop, deterministic author-once test automation, runtime-introspection
integrations that stop agents guessing, and model-tier routing by task class.

## Topic Axes

1. **Governance & autonomy** — turning a prose delegation policy into compiled,
   enforced gates.
2. **Role access boundaries** — write-locks, least-privilege, conditional
   activation.
3. **Grounding sources** — domain docs, live runtime introspection, ticket
   context.
4. **The compounding loop** — routing corrections to the right surface; doc
   freshness.
5. **Cost & model routing** — task-class-appropriate models.
6. **Extension surface** — packs for testing/E2E and ecosystems.

## Ranked Ideas

### 1. Compile a risk-tiered Delegation Policy into enforced host controls

**Description.** Model delegation tiers (assistive / drafting / executing) and a
no-delegation list (production data, secret material, deploy approvals, history
rewrites) as a Constitution edge + Overlay policy, then emit per-host
enforcement: Cursor `permissions.json` + hooks, Claude `settings.json`
allow/deny, Codex hooks. The Approved? gate already exists; this generalizes it
into a tiered, auditable autonomy model.

**Axis:** Governance & autonomy

**Basis:** `direct:` `README.md` base gates (Approved? gate, least-privilege
MCP) and the Cursor/Codex hook + `permissions.json` emission already described;
`CONCEPTS.md` Approved? Gate degradation model. `external:` observed delegation
criteria, no-delegation list, and T1/T2/T3 tiers as human checklists.

**Rationale.** This is the most on-thesis reuse: it converts governance prose
into compiled, reviewable, enforced policy — exactly the kind of thing ai-sdlc
exists to generate — and it strengthens a gate that already ships.

**Downsides.** Autonomy tiers must degrade honestly where a host lacks pre-tool
hooks; policy schema and capability-matrix parity work across four hosts.

**Confidence:** 90%  **Complexity:** Medium

### 2. Enforce role write-scope as compiled permissions

**Description.** Give each role a declared write boundary and emit it as real
host permission scoping — most importantly the Tester writes only to test paths
and cannot edit production code, and read-only roles (Architect, Reviewer,
Debugger) cannot write at all. Today these postures are prose in role bodies;
make them enforced.

**Axis:** Role access boundaries

**Basis:** `direct:` `sdlc-base/roles/{tester,reviewer,architect,debugger}.md`
declare postures; adapters already emit per-role MCP least-privilege and hooks
(`README.md`). `external:` the independent-test-authoring pattern where the code
author cannot weaken its own tests.

**Rationale.** Turns the single most valuable safety property (independent
verification) from a promise into an access boundary, reinforcing the
Tests-must-pass gate. Low conceptual risk; reuses the least-privilege machinery.

**Downsides.** Hosts differ in write-scoping fidelity; degradation must fall back
to an instruction + CI backstop, and the difference must be visible in the
capability matrix.

**Confidence:** 84%  **Complexity:** Medium

### 3. Conditional multi-lens review activation by diff surface

**Description.** Keep the Reviewer always-on, and activate extra review lenses
based on what the diff touches: a security lens always, a migration/data-safety
lens when schema/migration paths change, an infrastructure lens when CI/IaC or
container files change. Run the same gate at loop-completion and in CI.

**Axis:** Role access boundaries / Governance

**Basis:** `direct:` `sdlc-base/roles/reviewer.md`; reference packs already
include `security` and `infra` (`packs/`); Copilot adapter already emits a CI
backstop workflow (`README.md`). `external:` the observed parallel review gate
with conditional migration/infra lenses that loops until all pass.

**Rationale.** A clean, host-neutral policy ("which lenses fire for which diff
surfaces") that maps directly onto existing packs and the review-required gate,
and makes review depth proportional to risk.

**Downsides.** Diff-surface detection needs a shared definition; overlap between
a "security lens" and the security pack must be deduped.

**Confidence:** 80%  **Complexity:** Medium

### 4. Route corrections to the right instruction surface (compound-learning)

**Description.** A skill that takes a correction ("the agent got X wrong") and
routes it: global rule to the Constitution/standards, role-specific to role
grounding/`roleAddenda`, domain-specific to a domain doc — recording it as an
evidence-linked Accepted Learning Ledger entry that resurfaces on future runs.

**Axis:** The compounding loop

**Basis:** `direct:` Accepted Learning Ledger (`CONCEPTS.md`, `.sdlc/memory/`);
`overlay.roleAddenda` + `/tune-roles`; prior art
`docs/ideation/2026-06-29-project-improvement-followups.md`. `external:` the
"fix the instruction, not the diff" loop with global-vs-domain routing.

**Rationale.** Compounding is the whole point of the ledger; this gives it a
front door and makes the improvement loop a system rather than a habit.

**Downsides.** Routing heuristics can misfile a learning; needs a review step so
entries stay evidence-linked, not free-form chat memory.

**Confidence:** 82%  **Complexity:** Medium

### 5. Domain-doc grounding track + freshness gate

**Description.** Mine or scaffold per-domain docs with a code-path-to-doc map,
feed them into role grounding, and treat freshness (broken references, docs
older than the code) as a `garden-docs` gate with thresholds rather than an
advisory report.

**Axis:** Grounding sources / The compounding loop

**Basis:** `direct:` `aisdlc garden-docs` already detects stale/broken
agent-facing docs (`README.md`); Standards Index + evidence coverage
(`CONCEPTS.md`, `STRATEGY.md`). `external:` domain docs treated as the most
valuable agent asset, with a code-path-to-doc map and dated gotchas closed in the
same change as the code.

**Rationale.** Directly serves the evidence-coverage metric and the mining track;
extends an existing command from "report" to "gate."

**Downsides.** Scaffolding domain docs risks generating low-value boilerplate;
must key off mined evidence and stay opt-in for small repos.

**Confidence:** 76%  **Complexity:** Medium

### 6. Default model-tier routing by role/task class

**Description.** Ship a default model-tier map (cheap/fast for docs-style and
narrow work, mid-tier for implementation and review, high-reasoning only for
planning, investigation, and estimation), expressed as role-model defaults in the
Neutral Model and emitted per host, with rationale. Overlay overrides remain.

**Axis:** Cost & model routing

**Basis:** `direct:` role-model overrides in the Overlay (`README.md`,
`CONCEPTS.md`). `external:` observed per-role model tiering to manage cost and
rate limits.

**Rationale.** Cheap, high-value, and reuses an override channel that already
exists — just supply sensible defaults instead of leaving it blank.

**Downsides.** Host model names/tiers drift; defaults must be expressed
abstractly (tier, not vendor SKU) and degrade where a host exposes fewer tiers.

**Confidence:** 78%  **Complexity:** Low

### 7. First-class runtime-introspection integration contract (scoped, read-only)

**Description.** Add a host-neutral integration contract for **runtime
introspection** — live schema, routes/endpoints, logs — bound just-in-time,
read-only, local-only, least-privilege, so grounding can include live runtime
facts and agents stop hallucinating APIs.

**Axis:** Grounding sources

**Basis:** `direct:` integration-contract + Integration Binding + least-privilege
MCP machinery (`sdlc-base/integrations/*.contract.yaml`, `CONCEPTS.md`).
`external:` runtime-introspection tooling that supplies live schema/routes to the
implementing agent.

**Rationale.** Complements static mining with live runtime grounding through the
exact mechanism ai-sdlc already has (contracts + bindings + scoping).

**Downsides.** Runtime access is inherently riskier than reading files; the
contract must default to read-only + local and never reach production.

**Confidence:** 72%  **Complexity:** Medium

### 8. Mandatory read-only investigation before bug-fix delegation

**Description.** Gate bug-fix work behind a read-only investigation step: the
Debugger produces root cause, evidence (`file:line`, query results, logs), a
recommended fix, and a regression-test list — changing no code — before any fix
is delegated.

**Axis:** Governance & autonomy / Grounding sources

**Basis:** `direct:` `sdlc-base/roles/debugger.md` (read-only posture). `external:`
the "no fix on a bug ticket until root cause is human-confirmed via a read-only
investigation" rule.

**Rationale.** A concrete, host-neutral gate that raises fix quality and fits the
Approved?-gate model; small addition to an existing role.

**Downsides.** Risks ceremony on trivial bugs; should be Ceremony-Track-aware
(skip for Quick track / obvious one-liners).

**Confidence:** 74%  **Complexity:** Low

### 9. Ticket-grounded loop entry (acceptance criteria + auto-selected grounding)

**Description.** On loop entry, bind the tracker integration, extract acceptance
criteria from the work item, auto-select the relevant grounding (domain docs,
standards, map slices), and establish the branch/commit convention up front.

**Axis:** Grounding sources

**Basis:** `direct:` `sdlc-base/integrations/jira.contract.yaml`,
`sdlc-base/skills/sdlc-loop/SKILL.md`, `wrap-up` skill. `external:` the
task-kickoff flow that pulls the ticket, extracts acceptance criteria, and
cross-references matching domain docs before code.

**Rationale.** Ties integration bindings to the loop so grounding is automatic;
mostly assembles capabilities that already exist.

**Downsides.** Depends on a bound tracker; must degrade gracefully when no
integration is bound (bindings are just-in-time by design).

**Confidence:** 70%  **Complexity:** Medium

### 10. Author-once/run-natively testing standard + optional E2E pack

**Description.** Adopt "generate deterministic artifacts, don't keep AI in the
execution path" as a Constitution standard for generated automation, and add an
optional E2E pack encoding explore-before-generate, a test-pyramid coverage
budget, bounded self-healing, and the test-bug-vs-application-bug decision.

**Axis:** Extension surface

**Basis:** `direct:` reference packs pattern (`packs/`: frontend, mobile, …) and
`docs/packs.md`. `external:` the author-once/run-natively principle, the
test-pyramid portfolio, explore-before-generate, and bounded self-healing.

**Rationale.** Fits the pack extension model precisely and encodes a genuinely
strong testing principle without bloating the universal base.

**Downsides.** Larger surface; a browser-E2E pack is stack-specific and must stay
opt-in behind ecosystem detection.

**Confidence:** 66%  **Complexity:** High

### 11. Generated onboarding / health-check ("doctor") artifact

**Description.** Emit a per-repo onboarding + health check that verifies hosts,
MCP auth, gate wiring, and runs a first-loop dry run — extending `smoke`/`status`
into a human-facing "are we set up correctly?" surface.

**Axis:** Extension surface

**Basis:** `direct:` `aisdlc smoke`, `aisdlc status`, Setup-ready
(`README.md`, `CONCEPTS.md`). `external:` the 30-minute onboarding + verify-MCP +
run-your-first-task pattern.

**Rationale.** Cheap UX win that turns existing validation into legible
onboarding, serving the hands-off-setup metric.

**Downsides.** Mostly UX packaging over existing checks; lower leverage than the
governance/grounding ideas.

**Confidence:** 68%  **Complexity:** Low

## Rejection Summary

| # | Idea | Reason rejected |
|---|------|-----------------|
| 1 | Runtime delivery-metrics dashboard (velocity / cycle-time tracking) | Out of thesis — ai-sdlc is a setup-time compiler, not a runtime analytics product; Loop-Quality Score is the only adjacent surface. |
| 2 | Clone one host's exact agent and command names wholesale | Violates host-neutrality — patterns must map onto roles/skills/gates, not a single tool's command set. |
| 3 | Bake a specific token-stripping proxy into the base | Tool-specific and non-portable; at most optional pack guidance, never a base capability. |
| 4 | Make "human reviews every line" the only autonomy model | The Approved? gate already covers this; the reuse is to make it *risk-tiered* (idea #1), not to hardcode uniform review. |
| 5 | Duplicate full project standards into every agent body | Token bloat; ai-sdlc already keeps pointers + role-scoped grounding (prior ideation rejected this too). |
| 6 | Front-of-lifecycle requirements-refinement agent as a core role | Scope creep beyond the solo-dev dev-loop thesis; defer to a roadmap pack rather than a base role. |

## Synthesis: what to reuse now

**Reuse the cluster that converts prose governance and access discipline into
compiled, enforced, evidence-backed policy — plus grounding depth and the cheap
routing win.** Ideas #1–#4 land directly on existing surfaces (Constitution/
gates, roles, Overlay, ledger); #5 and #7 deepen grounding through the mining and
integration-contract machinery; #6 is a near-free default over an existing
override channel.

**Recommended sequence:** #2 (write-scope) → #1 (delegation tiers) → #3 (review
matrix) → #6 (model routing) → #4 (compound-learning routing) → #5 (domain-doc
grounding + freshness gate) → #7 (runtime introspection) → #8 (investigate-before-fix).
Ideas #9–#11 follow as UX/assembly work.

**Do not pursue:** runtime delivery dashboards, cloning a host's command set,
tool-specific proxies, or a new front-of-lifecycle role — until the core
compiled-governance and grounding work lands.

---

# Part II — Requirements

## Summary

Encode the durable patterns from a mature agentic SDLC operating model as
host-neutral, compiled `ai-sdlc` capability across four tracks: (A) make
autonomy and access **enforced** rather than prose — risk-tiered delegation
policy, role write-scopes, and a conditional review matrix; (B) close the
**compounding loop** — route corrections to the right surface and gate
documentation freshness; (C) improve **grounding and cost** — default model-tier
routing and a scoped runtime-introspection contract; (D) add a **read-only
investigation gate** and an optional author-once **E2E test pack**. Every track
must preserve hands-off setup, evidence coverage, re-run-no-op, and
capability-matrix parity across hosts.

## Problem Frame

`ai-sdlc` already compiles roles, skills, gates, and standards to four hosts and
mines an evidence-backed overlay. The reusable patterns from the observed model
are things ai-sdlc is uniquely positioned to make portable: governance that is
enforced instead of promised, access boundaries that are compiled instead of
described, grounding that is live instead of only mined, and a learning loop that
is a system instead of a habit. The risk is scope creep and host divergence —
each capability must degrade honestly where a host is less capable, and must not
regress the strategy metrics.

## Key Decisions

- **Enforce, don't describe.** Governance and access postures become compiled
  host controls (permissions, hooks, MCP scoping) with instruction + CI backstops
  where a host can't enforce natively.
- **Host-neutral first.** Everything is authored in the Base/Overlay and emitted
  by Adapters; no host-specific command cloning.
- **Reuse existing channels.** Prefer the Approved? gate, least-privilege MCP,
  `roleAddenda`, Accepted Learning Ledger, integration contracts, packs, and
  `garden-docs` over new subsystems.
- **Ceremony-aware.** New gates (investigation-before-fix, review matrix depth)
  respect the Ceremony Track so Quick track stays light.
- **Degrade honestly.** Any capability a host can't fully enforce is recorded in
  the capability matrix, not silently dropped.
- **Metrics are guardrails.** No track ships if it regresses hands-off setup,
  evidence coverage, or re-run-no-op.

## Phased Delivery

| Phase | Track | Ideation # | Depends on |
|---|---|---|---|
| A | Autonomy & access enforcement | #1, #2, #3 | — |
| B | Compounding loop & grounding | #4, #5 | A (shares policy/overlay surfaces) |
| C | Routing & runtime grounding | #6, #7 | — (C6 independent; C7 after A) |
| D | Investigation gate & extension packs | #8, #10 | A; D10 optional after B |

Deferred to follow-ups: #9 (ticket-grounded loop entry), #11 (onboarding doctor).

## Requirements

### Track A — Autonomy & access enforcement (#1, #2, #3)

- **R1.** Represent delegation autonomy as a small set of tiers (assistive /
  drafting / executing) plus a no-delegation list (production data, secret
  material, deploy approvals, history rewrites), authored in the Constitution
  edges and tunable in the Overlay.
- **R2.** Adapters emit tier + no-delegation enforcement per host: permission
  allow/deny lists, pre-action approval hooks, and MCP scoping; where a host
  lacks pre-tool hooks, degrade to an instruction checklist + CI backstop and
  record the degradation in the capability matrix.
- **R3.** Each role declares a machine-checkable write-scope; the Tester's scope
  is limited to test paths and excludes production code; read-only roles
  (Architect, Reviewer, Debugger) emit no write capability.
- **R4.** A conditional review matrix defines which lenses activate for which
  diff surfaces: base Reviewer always, a security lens always, a data/migration
  lens when schema/migration paths change, an infrastructure lens when CI/IaC or
  container files change; the same gate runs at loop-completion and in the CI
  backstop.
- **R5.** `aisdlc status` reports the resolved autonomy tier, per-role write-scope
  enforcement state, and active review lenses per host.

### Track B — Compounding loop & grounding (#4, #5)

- **R6.** A `compound-learning` skill routes a correction to the correct surface
  (global → Constitution/standards; role → role grounding / `roleAddenda`;
  domain → domain doc) and records an evidence-linked Accepted Learning Ledger
  entry that resurfaces on future runs touching the same surface.
- **R7.** Routed learnings are reviewable before acceptance and remain
  evidence-linked (no free-form chat memory); accepted entries appear in role
  guidance and `status`.
- **R8.** A domain-doc grounding capability mines or scaffolds per-domain docs
  with a code-path-to-doc map and feeds them into role grounding, keyed off mined
  evidence (never boilerplate for repos without signal).
- **R9.** `aisdlc garden-docs` gains a gating mode: broken code references and
  docs older than the code they describe fail at a configurable threshold
  (`--fail-on`), extending the current report-only behavior without changing its
  default.

### Track C — Routing & runtime grounding (#6, #7)

- **R10.** Ship default role-model tiers in the Neutral Model expressed
  abstractly (narrow/fast, standard, high-reasoning) rather than vendor SKUs;
  Overlay role-model overrides still win; adapters map tiers to each host and
  degrade where fewer tiers exist.
- **R11.** Add a host-neutral **runtime-introspection** integration contract
  (live schema, routes/endpoints, logs) with a least-privilege posture; it binds
  just-in-time, defaults to read-only and local/non-production, and is reachable
  only by roles whose posture allows it.
- **R12.** Runtime-introspection grounding is additive to static mining and never
  a prerequisite for setup-ready (bindings remain deferred/just-in-time).

### Track D — Investigation gate & extension packs (#8, #10)

- **R13.** Add a read-only investigation step for bug-fix work: the Debugger
  produces root cause, evidence (`file:line`, query results, logs), a recommended
  fix, and a regression-test list, changing no code; a fix may not be delegated
  until this exists. The gate is Ceremony-Track-aware (skippable on Quick track /
  trivial fixes).
- **R14.** Add "generate deterministic artifacts; keep AI off the execution path"
  as a Constitution standard for generated automation.
- **R15.** Add an optional E2E test pack encoding explore-before-generate, a
  test-pyramid coverage budget, bounded self-healing with a retry limit, and the
  test-bug-vs-application-bug decision; it activates only on ecosystem detection
  and emits nothing when inactive.

## Success Criteria

| Metric | Target after program |
|---|---|
| Hands-off setup rate | Maintained (no regression from new gates/policy) |
| Evidence coverage | Maintained at 100% on ready repos |
| Re-run is a no-op | Preserved — new capabilities key off existing overlay/project-context fingerprints |
| Capability-matrix parity | Every new enforcement declared per host, with honest degradation |
| Behavior eval | Enforced-policy and grounding artifacts present and preferred vs generic baseline on pinned scenarios |
| Autonomy tier + write-scope enforcement | Emitted and reported by `status` on all four hosts |

## Scope Boundaries

**In scope:** compiled delegation tiers and no-delegation enforcement, role
write-scopes, conditional review matrix, correction-routing skill, domain-doc
grounding + freshness gate, default model-tier routing, runtime-introspection
contract, investigation-before-fix gate, optional E2E pack.

**Out of scope:** runtime delivery-metrics dashboards; cloning any host's exact
agent/command set; tool-specific token proxies baked into the base; duplicating
full standards into agent bodies; a new front-of-lifecycle requirements role.

**Deferred follow-ups:** ticket-grounded loop entry (#9), generated
onboarding/health "doctor" (#11), an ecosystem requirements-refinement pack.

## Dependencies & Assumptions

- Track A extends the Constitution edges, Overlay schema (autonomy tier +
  write-scope), and the Cursor/Claude/Codex hook + permission emitters; Copilot
  uses its CI backstop where native hooks are absent.
- Track B extends the Accepted Learning Ledger, `roleAddenda`, and `garden-docs`
  (`--fail-on` already exists as a flag surface).
- Track C reuses role-model overrides and the integration-contract + binding +
  least-privilege machinery.
- Track D extends the Debugger role and the packs loader (`packs/`, `docs/packs.md`).
- Assumption: mock/scaffold behavior eval remains an acceptable gate until live
  host eval is productized.

## Outstanding Questions

- **Q1.** Do autonomy tiers belong as Constitution edges, Overlay policy, or
  both? *Default: default tiers in the Constitution, per-project tuning in the
  Overlay.*
- **Q2.** How faithfully can each host enforce role write-scope, and what is the
  minimum acceptable degradation (instruction-only vs CI-enforced)?
- **Q3.** Should review-matrix conditions live in the Base or ride on the
  relevant packs (security/infra)? *Default: conditions in the Base; lens depth
  from packs.*
- **Q4.** What is the source of default model-tier assignments per role, and how
  do we keep them vendor-neutral as host model line-ups change?
- **Q5.** For runtime introspection, which roles may bind it, and how do we prove
  it never reaches production in emitted config?

## Handoff

Ready for `ce-plan`, ideally as one program with four track plans in phase order
**A → B → C → D**. Track A is the highest-leverage, most on-thesis work
(compiled, enforced governance and access) and should plan first.
