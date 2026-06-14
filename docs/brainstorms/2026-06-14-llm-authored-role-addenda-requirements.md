---
date: 2026-06-14
topic: llm-authored-role-addenda
type: requirements
scope: feature
status: draft
upstream: docs/ideation/2026-06-14-llm-authored-role-addenda-ideation.md
---

# Requirements: LLM-authored, repo-specific role addenda

## Problem

ai-sdlc personalizes the **constitution** (appended standards) and the **overlay config** (track,
test command, integrations) from mined evidence, but the **role prompts themselves stay generic**.
The Engineer never learns this repo's stack idioms, the Tester never learns where its real test
command and risky surfaces are, the Reviewer never learns the repo's security-sensitive areas. The
single most valuable per-repo guidance — the role's own system prompt — is the part mining never
touches. The Anthropic `defending-code-reference-harness` shows the value of LLM-authored config but
pays in non-determinism; ai-sdlc cannot accept that without losing its identity (deterministic,
idempotent, reviewable, gate-safe compile).

## Actors & Core Outcome

- **Primary actor:** an internal engineer running `/customize` (or a follow-up `tune-roles`) on a repo.
- **Secondary actor:** the platform team that owns the base roles and the addenda contract.
- **Core outcome:** after setup, each compiled role agent carries a short, repo-specific **addendum**
  authored by the host agent from mined evidence — additive guidance fenced under a generated heading,
  never overriding a gate or posture — and the compile that produces the host config stays byte-identical
  given the overlay. The addenda are visible and reviewable as a normal overlay diff.

## Product Thesis & Positioning

This brings the harness's proven "LLM authors the config" move into ai-sdlc **without** importing its
non-determinism. The trick is architectural, not new: addenda are just more **overlay** content. The
overlay is already the user-owned, version-controlled, human-reviewed layer the deterministic compiler
merges from. The LLM writes overlay text (a reviewable diff); the compiler stays pure. The harness's
prose "rewrite vs unchanged" guardrail becomes a **mechanically enforced** contract — consistent with
ai-sdlc's "gates can't be typo'd off" ethos.

## Goals

- Personalize role prompts per repo from mined evidence, additively.
- Keep `compile` deterministic and idempotent given an overlay (LLM output lands in the overlay, not in compile).
- Make the addenda contract mechanically enforced, so no addendum can weaken a gate, posture, or the single-writer rule.
- Keep addenda reviewable: a normal overlay diff a human signs off on.
- Reuse the existing smoke gate; no new non-negotiable gate.

## Non-Goals (v1)

- LLM calls from inside ai-sdlc (no model dependency/secret in the compiler) — the **host agent** authors via a skill.
- Rewriting role **bodies** wholesale or editing role **frontmatter/descriptions** (routing classifiers).
- Authoring addenda for roles that don't exist in the base, or inventing new roles.
- Auto-applying addenda without a human-reviewable overlay diff.
- Per-package/per-directory role addenda (monorepo layering is a separate track).

## Primary Flow (v1 hero slice)

1. Setup mines the repo (existing `/customize`), producing `RepoProfile` + project-context.
2. The engineer runs the **`tune-roles`** skill. The host agent reads the mined evidence and the base
   role bodies, and drafts a short addendum per role **within the contract** (allowed: stack idioms,
   test/run specifics, repo-risk hot-spots; forbidden: anything touching gates/posture/single-writer).
3. The agent writes the addenda into `overlay.roleAddenda` (a reviewable `.customize.yaml` diff).
4. `aisdlc compile` merges each addendum into its role body under a generated heading and emits host
   config; the bounds validator rejects any out-of-contract addendum (fails the build loudly).
5. `aisdlc smoke` gates as today; the human reviews the overlay diff.

## Functional Requirements

**Data model**
- **R1.** `Overlay` gains `roleAddenda: Record<roleName, string>` (default `{}`), validated by schema:
  role name is a slug; addendum is a non-empty string within a length cap.
- **R2.** Addenda for a role **absent** from the resolved model are ignored (no crash), mirroring how
  loop stages drop absent roles.

**Merge & emit**
- **R3.** `applyRoleOverlay` appends a present role's addendum to `role.body` under a fixed, clearly
  marked heading (e.g. `## Project-specific guidance (generated)`), so it is visibly fenced from the
  base prompt in every emitted host file.
- **R4.** With an empty `roleAddenda` (the base default), compile output is **unchanged** — no golden
  snapshot churn for existing repos.
- **R5.** Given a fixed overlay (including addenda), compile remains byte-identical/idempotent.

**Contract (mechanical enforcement)**
- **R6.** A deterministic validator rejects an addendum that: exceeds the length cap; targets a role
  name that is not a slug; or contains directives that attempt to weaken a non-negotiable gate, the
  `Approved?` checkpoint, the single-writer rule, or a role's declared posture (e.g. granting write to a
  read-only role). Violations throw at load/merge with a specific message — never silently dropped.
- **R7.** The contract is documented in one place (the `tune-roles` skill body + a short contract note)
  and enforced by the validator, so the human-facing rules and the machine check do not drift.

**Authoring skill**
- **R8.** A `tune-roles` skill instructs the host agent to read mined evidence + base role bodies, draft
  addenda within the contract, write them to the overlay, then recompile and re-smoke. It is
  model-invocable (unlike the deterministic `/customize` orchestration steps).
- **R9.** The skill requires the addenda to be additive and evidence-grounded (cite the repo signal a
  guidance line is based on, in prose), and to defer to the base prompt on any conflict.

**Safety / gates**
- **R10.** The four non-negotiable gates remain base-only and non-overlay-expressible; addenda can never
  represent them. `.strict()` continues to reject unknown overlay keys.
- **R11.** An out-of-contract or oversized addendum fails `compile`/`smoke`, so a green setup never ships
  a gate-weakening prompt.

## Key Design Decisions & Tensions

- **Non-determinism is quarantined to the overlay.** The LLM writes overlay text (reviewable); compile
  stays a pure function of the overlay. This is the whole reason the feature is safe.
- **Additive, fenced addenda — not body rewrites.** The base gate language always survives in the emitted
  prompt; the addendum sits under a labeled heading, so drift is obvious in review.
- **Mechanical contract over prose guardrail.** The harness trusts a prose map; ai-sdlc enforces bounds in
  code, matching its gate philosophy. Tension: a heuristic denylist can't catch every adversarial phrasing
  — mitigated by additivity (base prompt still present), human review of the diff, and the smoke gate.
- **Host agent is the LLM.** No API/secret added to the compiler; authoring is a skill, like the harness.

## Scope Boundaries

**In scope:** the `roleAddenda` overlay field + schema bounds; merge-append under a fenced heading; the
mechanical contract validator; the `tune-roles` authoring skill; tests across schema/merge/compile.

**Deferred to follow-up:** wiring `tune-roles` into the `/customize` first-run chain automatically;
mining-evidence → draft *suggestions* generated deterministically as a starting point; per-package
addenda for monorepos; authoring role descriptions/frontmatter.

**Outside this product's identity:** LLM calls from within the compiler; wholesale body rewrites;
overlay-expressible gates; auto-apply without a reviewable diff.

## Success Criteria

- A repo can carry a per-role addendum that shows up, fenced, in every emitted host agent file, with no
  change to the four gates or any posture.
- Compile with empty `roleAddenda` is byte-identical to today (no snapshot churn); compile with a fixed
  addenda set is idempotent.
- An addendum attempting to weaken a gate/posture (or exceeding the cap) fails the build with a clear
  message.
- The `tune-roles` skill produces a reviewable overlay diff a human approves before it ships.

## Dependencies & Assumptions

- Builds on the existing base/overlay split, `mergeOverlay`, and the smoke gate.
- **Assumption:** mined `RepoProfile`/project-context is rich enough to ground useful addenda (already
  used for standards).
- **Assumption:** additivity + human review + smoke is sufficient safety for v1, given the mechanical
  denylist is best-effort, not a complete adversarial filter.

## Outstanding Questions

1. Length cap value (chars) for an addendum — settle when writing the schema (proposal: ~1500).
2. Exact denylist phrasings for the contract validator — start conservative, expand from real misuse.
3. Should `tune-roles` eventually run inside `/customize`, or stay an explicit opt-in follow-up? (v1: opt-in.)
4. Do we want a deterministic "draft suggestion" pre-seed from mining, or leave drafting fully to the agent? (v1: agent drafts.)
