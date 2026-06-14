---
date: 2026-06-14
topic: internal-ai-sdlc-framework
type: requirements
scope: deep-product
status: draft
upstream: docs/ideation/2026-06-14-ai-sdlc-universal-setup-ideation.md
---

# Requirements: Internal AI SDLC Framework

## Problem

Engineers across the company use AI coding agents inconsistently: every team hand-rolls its
own rules, prompts, and workflows per repo and per host (Cursor, Claude Code, Codex). There is
no shared "way of working" — no consistent review bar, no standard Jira/GitLab wrap-up, and no
mechanism for one team's hard-won conventions to benefit the next. Setups rot as repos evolve,
and nothing compounds.

## Actors & Core Outcome

- **Primary actor:** an internal engineer (any team) working in a repo with an AI agent host.
- **Secondary actor:** a **platform team** that owns and versions the shared base.
- **Core outcome:** a team drops the framework into a repo, runs `/customize` to adapt it to
  that repo, and from then on runs real work through a consistent role loop
  (Architect → Software Engineer → Reviewer) gated by an `Approved?` checkpoint, with wrap-up
  to the company's Jira/GitLab. The setup stays consistent across teams and improves as it is used.

## Product Thesis & Positioning

This is a **standalone, internal AI SDLC framework**, not an OSS contender and not a thin sync
layer. Its durable value is **company-specific**: it encodes our standards, our review bar, our
Jira/GitLab workflows, and the institutional memory accumulated across our repos. External
standards (AGENTS.md, Agent Skills, MCP) are the **portable substrate it emits onto**, not
competition — they make cross-host distribution cheaper without eroding the bespoke value.

**Product shape (chosen): B + D**
- **B — opinionated core, configurable edges:** the base ships company-blessed defaults
  (constitution, review gates, tool wrap-up) that teams can configure; `/customize` adapts repo
  specifics and lets teams pick a ceremony track.
- **D — central-push distribution:** the platform team owns a versioned base and pushes updates
  org-wide; teams hold only thin overlays, never forks.

## Goals

- One consistent, opinionated SDLC loop usable across internal teams and repos.
- A `/customize` step that adapts the base to a specific repo with high fidelity and a validation gate.
- Base updates roll out org-wide without teams maintaining forks.
- Native integration with the company's Jira and GitLab via MCP, with least-privilege per role.
- Architecture that does not preclude multi-host support or a compounding-memory layer.

## Non-Goals (v1)

- Public/OSS distribution or competing for external adoption.
- Full multi-host compile (Cursor + Claude Code + Codex) — v1 targets one host.
- A composable internal pack **registry** (product shape C) — deferred until packs stabilize.
- A rich, self-promoting compounding-memory system — v1 captures memory minimally only.
- Autonomous/unattended execution — v1 keeps the human `Approved?` gate in the loop.

## Primary Flow (v1 hero slice)

On a single host (**assumed Cursor** — confirm), end to end:

1. **Install** the base into a repo (platform-team-owned, versioned; project state isolated in an overlay).
2. **`/customize`** mines the repo (tree, CI, linters, CODEOWNERS, manifests, existing docs),
   emits evidence-backed project artifacts (constitution, standards index, role overlays,
   integration bindings) citing real repo paths, and interviews only for gaps.
3. **Validation gate:** `/customize` cannot report "ready" until a minimal smoke run
   (Engineer → Reviewer on a canned task using the generated config) passes.
4. **Run a task** through the orchestrated role loop: Architect (read-only plan) → Software
   Engineer (holds the write lock) → `Approved?` gate → Reviewer (fresh, read-only context).
5. **Wrap-up** via MCP: open/update the GitLab MR and update the Jira issue, scoped to the
   active role's least-privilege profile.

## Functional Requirements

**Base & distribution (survivor #1)**
- The base is versioned and installed without copy-paste forking; all project-specific state
  lives in an overlay the base updater never overwrites.
- A base update applies org-wide and flags (does not silently clobber) any conflict with a team overlay.
- Ceremony tracks (Quick / Standard / Full) are selectable per repo or per task (survivor #5).

**`/customize` (survivor #2)**
- Mines the repo first; interviews only for what the repo cannot answer.
- Emitted artifacts cite the repo evidence they were derived from.
- A passing smoke run is a hard exit criterion for "customize complete."
- Re-running `/customize` updates artifacts in place and reports what changed (drift-aware).

**Orchestration & roles (survivor #3)**
- Single writer: only the Software Engineer role holds the write lock at a time.
- Architect and Debugger run as read/explore roles returning compressed summaries.
- Reviewer runs after writes complete, in fresh read-only context.
- An explicit `Approved?` gate sits between implementation and wrap-up.

**Tool integration (survivor #6)**
- Jira and GitLab are integrated via MCP, never baked into core logic.
- Each role declares a least-privilege MCP profile (e.g., Architect: read-only Jira;
  Engineer: GitLab branch/MR; Reviewer: none); the orchestrator refuses out-of-profile calls.
- Wrap-up responses are validated against a thin integration contract before a task is marked done.

**Portability readiness (survivor #4 — readiness only in v1)**
- v1 artifacts are authored in a host-neutral form even though only one host is compiled,
  so multi-host compile is an additive v2 step rather than a rewrite.

**Compounding memory (survivor #7 — minimal in v1)**
- v1 captures, at minimum, `Approved?` gate outcomes (verdict, scope, rejection reason) and a
  living standards index that can accept gated deltas. Promotion-back and similarity recall are v2.

## Key Design Decisions & Tensions

- **Central-push vs configurable edges (B vs D tension).** When the platform team pushes a new
  gate or standard, it may conflict with a team's overlay. v1 must surface conflicts for human
  resolution rather than last-write-wins. *(Outstanding: conflict-resolution UX.)*
- **One host now, many hosts soon.** Host choice for v1 is a convenience; the artifact format is
  the real commitment. Authoring host-neutral from day 1 is a hard requirement.
- **Opinionated where it pays, configurable where it doesn't.** Constitution, review bar, and
  tool wrap-up are opinionated; ceremony depth, repo specifics, and stack details are configurable.

## Scope Boundaries

**Deferred for later (v2+):** multi-host compile + `portability.gap` reporting; composable pack
registry (C); promotion of learnings into skills + similar-failure recall; continuous/background
drift reconciliation; non-developer (PM-driven) customize.

**Outside this product's identity:** public/OSS framework; replacing the company's existing Jira/
GitLab/CI systems; fully autonomous merge without a human gate.

## Success Criteria

- A new repo goes from install to a passing `/customize` smoke run in a single short session,
  with zero hand-edited config required to reach "ready."
- A real feature task completes the full loop and produces a review-passed GitLab MR + updated
  Jira issue, with the writer-lock/clean-reviewer separation observable.
- A base version bump rolls out to a pilot set of repos without any team forking the base.
- Two engineers on the same repo (different hosts later) share one customize source of truth.

## Dependencies & Assumptions

- **Assumption:** v1 host is Cursor (the team's current editor) — **confirm**.
- Company Jira and GitLab are reachable via MCP servers with credentials managed per host.
- A platform team (or owner) exists to hold and version the base (product shape D).
- **Assumption:** internal repos are diverse enough in stack that repo-mining must be
  language-agnostic in its first pass.

## Outstanding Questions

1. v1 host: confirm Cursor, or standardize on Claude Code / Codex first?
2. Base distribution mechanism: internal package registry, git submodule, or a CLI installer?
3. Overlay conflict resolution when the central base pushes a change a team overlaid — block, prompt, or auto-merge with review?
4. Which 2-3 internal repos are the pilots for the smoke-run validation?
5. Minimum viable "company constitution" — what standards are non-negotiable vs configurable on day 1?
