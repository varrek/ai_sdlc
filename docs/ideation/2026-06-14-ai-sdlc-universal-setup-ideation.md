---
date: 2026-06-14
topic: ai-sdlc-universal-setup
focus: universal, configurable, skill/agent-oriented AI SDLC; base layer + /customize per project
mode: elsewhere-software
---

# Ideation: Universal AI SDLC Setup (base + `/customize`)

## Grounding Context (Topic Context)

A new, universal "AI SDLC" setup: a flexible, skill/agent-oriented framework dropped into any
project, with two layers — (1) a basic, user-configurable base of agents/skills/tools, and
(2) a `/customize`-style command that adapts the base to the current project (à la
`/customize` in anthropics/defending-code-reference-harness). Reference architecture: an
Orchestrator routing to role agents (Architect, Software Engineer, Reviewer, Debugger) with an
`Approved?` gate, integrating external tools via MCP (Jira, GitLab) for wrap-up.

Prior art (2026) converges on the same two-layer model — **portable base + project bootstrap
emitting stable artifacts**:
- **Spec Kit** (~112K stars): `constitution.md` gates phases; `specify init` scaffolds per-agent commands.
- **BMAD v6**: `_bmad/` modules + update-safe `.customize.yaml` overlays; track selector (Quick/Method/Enterprise); fresh chat per workflow.
- **Agent OS**: global base → `project-install` compiles tool-native files; `/discover-standards` mines repo → `index.yml`.
- **Claude Code** `/init`; skills, subagents, hooks, MCP. **Cursor** plugins (rules/skills/agents/commands/hooks). **Codex** AGENTS.md.
- **defending-code `/customize`**: interview + artifact-driven; mandatory smoke-run validation gate.
- **Devin/Cognition**: "map-reduce-and-manage" — writes single-threaded; clean-context reviewer beats a second writer.
- **Compound Engineering**: `/ce-setup` bootstrap; `/ce-compound` writes learnings back into skills/rules each cycle.
- **Standards**: AGENTS.md / Agent Skills (SKILL.md) / MCP ~70% portable; hooks/permissions/subagent-spawning ~30% tool-specific. Sync tools: rulesync, dotai.
- **Pitfalls**: skill sprawl (~19% of tasks regress on wrong-skill load); auto-generated AGENTS.md +cost/−quality; context pollution / token trap; config↔code drift; ceremony fatigue; over-customize day 1; "50 workflows, use 3"; fork maintenance tax.

## Topic Axes
1. Base composition & distribution
2. Project customization & drift (the `/customize` layer)
3. Orchestration & role agents
4. Configurability, portability & user control (cross-host: Claude Code/Cursor/Codex)
5. Tool/MCP integration & external systems

## Ranked Ideas

### 1. Two-layer distribution: versioned base modules + update-safe project overlays
**Description:** Base ships as a semver'd module graph (orchestrator core, role packs, MCP adapters, review gates) with `requires`/`extends` edges; `/customize` resolves a project subgraph and pins `project.lock`. Project state lives in `.customize.yaml`-style overlays the updater never touches; `base upgrade` replays merges and flags conflicts — no fork.
**Axis:** Base composition & distribution
**Basis:** `external:` BMAD v6 modules + update-safe overlays; Agent OS global-base→project-install; Linux distro LTS+PPA / dotfiles base+overlay analogy.
**Rationale:** Fork-maintenance tax is the #1 abandonment cause; overlays make "drop in AND keep upgrading" viable.
**Downsides:** Module graph + lockfile is real up-front engineering; over-modularizing risks its own ceremony.
**Confidence:** 88% · **Complexity:** Medium-High · **Status:** Explored

### 2. Repo-mine-first `/customize` with a mandatory smoke-run gate
**Description:** Invert interview-first: `/customize` mines the repo (tree, CI, linters, CODEOWNERS, ADRs, manifests, git history), emits evidence-backed artifacts (constitution, standards `index.yml`, AGENTS.md, role overlays) citing real paths, and interviews only for gaps. Cannot report "ready" until a minimal smoke run (Engineer→Reviewer on a canned task) passes.
**Axis:** Project customization & drift
**Basis:** `external:` defending-code `/customize` (artifact-driven + smoke gate) inverted with Agent OS `/discover-standards`; `direct:` auto-generated AGENTS.md is +cost/−quality unless repo-grounded.
**Rationale:** Heart of the ask. Mining first cuts the most-abandoned step (20-question interviews) and raises fidelity; smoke gate = verified operational readiness, not just document generation.
**Downsides:** Repo-mining quality varies by language/hygiene; smoke fixtures need upkeep.
**Confidence:** 90% · **Complexity:** Medium · **Status:** Explored

### 3. Single-writer orchestrator with ephemeral role-"hats" and a clean-context reviewer
**Description:** One Software Engineer thread holds the write lock; Architect/Debugger explore as subagents returning ~1–2K-token summaries; Reviewer runs after writes in fresh read-only context. Roles are invocation recipes (tool allowlist + output schema + context budget), not standing personas. Parallel writers opt-in only on isolated worktrees.
**Axis:** Orchestration & role agents
**Basis:** `external:` Devin/Cognition map-reduce-and-manage; `direct:` Anthropic subagent summaries + progressive disclosure.
**Rationale:** Concurrency feels faster but yields merge conflicts and quadratic token cost; serial writes + parallel read + clean-room review matches how teams ship.
**Downsides:** Less "swarm" wow; provocative alternative = drop orchestrator, drive phases by artifact-presence gates (lower cost, higher coordination risk).
**Confidence:** 86% · **Complexity:** Medium · **Status:** Explored

### 4. Host-neutral semantic core, compiled to host-native configs
**Description:** Author capabilities once in host-agnostic YAML/Skills; a `compile`/`sync` step emits Cursor/Claude Code/Codex native configs + a `portability.gap.yml` for the ~30% needing manual host tweaks. Edit source once; hosts recompile and never drift apart.
**Axis:** Configurability, portability & user control
**Basis:** `direct:` ~70% portable (AGENTS.md/Skills/MCP) vs ~30% tool-specific (hooks/permissions); `external:` rulesync/dotai, Agent OS compile, Terraform/Helm analogy.
**Rationale:** "Universal" is the core promise; portability friction is a top abandonment cause. Compile-once/adapt-many makes "any harness" honest.
**Downsides:** Adapter upkeep as hosts evolve; the leaky 30% must be surfaced or trust erodes.
**Confidence:** 84% · **Complexity:** High · **Status:** Explored

### 5. Track/ceremony selector: Quick / Standard / Full SDLC
**Description:** Track selector maps task size/risk to depth: Quick = Engineer→Reviewer; Standard = full role chain + `Approved?` gates; Full = adds MCP wrap-up. One routing question picks the track.
**Axis:** Configurability, portability & user control
**Basis:** `external:` BMAD v6 tracks (added to fight ceremony fatigue); `direct:` "ceremony fatigue", "50 workflows use 3".
**Rationale:** Running full SDLC for every task kills adoption; tiering keeps heavy pipeline where it earns cost. Biggest predictor of sustained use.
**Downsides:** Mis-routing risk; needs mid-task escalation path.
**Confidence:** 87% · **Complexity:** Low-Medium · **Status:** Explored

### 6. Least-privilege MCP role profiles + capability contracts
**Description:** Don't bake Jira/GitLab into core. Base declares per-role MCP profiles (Architect: read-only Jira; Engineer: GitLab branch/MR; Reviewer: none) + JSON-Schema contracts per integration. `/customize` discovers host MCP config and binds server IDs/field mappings; orchestrator refuses calls outside the active role's profile and validates wrap-up against contract.
**Axis:** Tool/MCP integration & external systems
**Basis:** `direct:` reference Jira/GitLab MCP wrap-up + `Approved?` gate; `reasoned:` role-scoped least privilege enables enterprise adoption; contracts localize breakage.
**Rationale:** Role-scoped least privilege is what lets orgs turn this on; contracts make wrap-up idempotent.
**Downsides:** Schema/contract upkeep; host MCP discovery is itself host-specific.
**Confidence:** 80% · **Complexity:** Medium · **Status:** Explored

### 7. Living, compounding project memory (the differentiator)
**Description:** Make customize output accrete: living `standards/index.yml` gains evidence-backed deltas as agents notice real conventions (gated, then promoted into skills `/ce-compound`-style); every `Approved?` gate outcome logged to `gate_history/` and preloaded as top-k similar past failures before re-routing; drift sentinel reconciles artifacts vs live repo on commit/PR.
**Axis:** Project customization & drift (+ orchestration)
**Basis:** `external:` Compound Engineering review→`/ce-compound` loop, `docs/solutions/`; Devin `known_bugs` steering; Agent OS living index; `direct:` config↔code drift pitfall.
**Rationale:** Research's explicit gap: frameworks pick heavy ceremony OR light sync. Memory that improves each run (cheaper retries, standards tracking real code) is the strongest adoption reason over a static scaffold.
**Downsides:** Accretion can become sprawl/noise without strict promotion gates and a pruning story.
**Confidence:** 82% · **Complexity:** Medium-High · **Status:** Explored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Gateless artifact-state-machine / peer mesh (no orchestrator) | Higher coordination risk; folded into #3 as a brainstorm fork |
| 2 | Continuous "drift gardener" (customize runs forever) | One-shot-vs-continuous fork; folded into #7 + #2 |
| 3 | Zero-install / ghost base | Distribution mechanism; merged into #1 lockfile/submodule story |
| 4 | 1/100-token "parliament" | Context-budget stress test; merged into #3 |
| 5 | PM-owned constitution | Audience pivot; better as a brainstorm variant |
| 6 | Configless convention host (zero files) | Too risky/unproven for a base default |
| 7 | External systems hold canonical workflow state | Folded into #6 contracts |
| 8 | Capability-atoms / micro-kernel base | Overlaps #1 module graph; merged |
| 9 | Immune / stem-cell / franchise / assembly-line analogies | Mechanisms absorbed into #2 and #7 |
| 10 | One global org-brain config + deltas | Folded into #1 (base shared, overlay delta) |
| - | axis coverage | All 5 axes represented; no gaps |
