---
date: 2026-06-30
topic: agent-skills-description-extension
type: requirements
origin: docs/ideation/2026-06-30-extend-project-agents-skills-descriptions-ideation.md
---

# Requirements: Agent & Skill Description Extension (Ideation #1–#5)

## Summary

Extend project-specific agent and skill guidance in five phased tracks: complete deterministic role grounding for Reviewer, Debugger, and flat Architect repos; extend Behavior Eval v2 to prove guidance quality; add templated deterministic role addenda; introduce optional ecosystem pack skills with richer descriptions; and only then experiment with compile-time description suffixes when eval shows routing benefit. The program keeps base role/skill bodies host-neutral and puts repo facts in grounding, overlay, or packs — not longer generic prose.

---

## Problem Frame

The 10-repo external bench (seed 42, count 10) proves hands-off setup works: 10/10 setup-ready, 10/10 hands-off, avg agent quality 96/100, full Cursor emit on every clone. The gap is uneven personalization — Tester and Engineer carry mined commands; Reviewer and Debugger stay generic on all 10; flat repos (e.g. Flask) lack Architect map grounding; deterministic customize leaves `roleAddenda` empty; skill and frontmatter descriptions remain identical across stacks.

STRATEGY.md commits to agents following *this repo's* stack with evidence-backed standards. Extending descriptions must increase actionable repo specificity without token bloat, routing regressions, or breaking deterministic compile reviewability.

---

## Key Decisions

- **Ground facts first, routing text last.** Tracks #1–#2 extend role bodies and overlay; track #3 (description suffixes) runs only after track #5 shows measurable benefit.
- **Deterministic by default.** Tracks #1, #2, and #4 must work in deterministic customize/compile without a host LLM. Plugin Mode `/tune-roles` remains the path for richer LLM prose.
- **No constitution duplication.** Project standards stay in `AGENTS.md` and standards index; agents receive pointers and role-scoped grounding, not full standards copies.
- **Behavior eval gates expansion.** Track #3 and track #4 ship only if track #5 demonstrates improved mock-agent decisions vs baseline; otherwise defer.
- **Build on existing v2.** Behavior Eval v2 read-only harness and plan already exist; track #5 extends scenarios and surfaces — it does not restart v2 from scratch.

---

## Phased Delivery

| Phase | Track | Ideation # | Depends on |
|---|---|---|---|
| A | Complete deterministic role grounding | #1 | — |
| B | Extend Behavior Eval v2 | #5 | A (partial — Tester/Engineer scenarios already exist) |
| C | Templated deterministic role addenda | #2 | A; informed by B |
| D | Ecosystem pack skill descriptions | #4 | B; optional parallel with C |
| E | Description suffix experiment | #3 | B proves routing signal |

Phases C and D are mutually informed — if grounding + addenda cover stack idioms, pack skills may shrink. Planning chooses order after phase B results.

---

## Requirements

### Track A — Complete role grounding (#1)

**Role body grounding**

- R1. Reviewer receives a deterministic `## Deterministic project grounding` section when the repo has mineable review signals: detected linters, high-confidence map entries flagged as security- or boundary-sensitive, and architecture demotion learnings already in the accepted-learnings ledger.
- R2. Debugger receives deterministic grounding when a root or package test command exists: primary reproduction command with CI/miner provenance, pointer to common log or CI artifact locations when mined from workflows, and explicit read-only posture reminder (no file writes).
- R3. Architect receives **standards-based** grounding when architecture confidence is low and no codebase map exists: framework, lint tool, test command, and test-layout standard — clearly labeled as low-confidence / no map, not as a fake high-confidence map.
- R4. All new grounding blocks respect existing caps (`MAX_ROLE_GROUNDING_CHARS`), pass `assertRoleAddendumWithinContract`, and never weaken gates or postures in prose.
- R5. `aisdlc status` reports Reviewer and Debugger grounding states using the same `deterministic` / `generic` / `deterministic+llm` scheme as other roles.

**Validation**

- R6. Corpus expectations cover at least one flat-repo fixture (e.g. `python-rags` or `flask-like`) for Architect standards-based grounding and one ready repo for Reviewer/Debugger grounding signals.
- R7. External bench agent-quality summary must show zero repos with `testerGrounded: false` when test commands exist (maintain current bar) and reduce `missingTesterGrounding`-class gaps for Reviewer/Debugger on the 10-repo catalog after phase A.

### Track B — Extend Behavior Eval v2 (#5)

**Scope extension (builds on `docs/plans/2026-06-29-005-feat-behavior-eval-v2-readonly-plan.md`)**

- R8. Add pinned read-only scenarios for role surfaces beyond Architect: at minimum Tester (test command selection) and Engineer (edit-area selection) on 2+ corpus fixtures.
- R9. Add scenarios that score Reviewer and Debugger grounding surfaces once track A ships — mock agent must prefer mined linter/checklist hints and reproduction commands over generic base guidance.
- R10. Tie at least 3 scenarios to ecosystem fixtures promoted in the corpus gate (Go, Rust, JVM, PHP, or JS) so multilingual coverage is behavior-gated, not miner-only.
- R11. Optional stretch: one scenario per pinned external-catalog repo shape reduced to a fixture (follow external-repo fix loop — do not depend on network in default CI).
- R12. v1 artifact signal scoring (`behavior-eval.ts`) remains unchanged; v2 reports `improvement: true` when personalized guidance beats generic on the pinned task.

**Program gate**

- R13. Track C, D, and E require a written eval report showing personalized guidance wins on all phase-B baseline scenarios before merge; regressions block downstream tracks.

### Track C — Templated deterministic role addenda (#2)

- R14. Deterministic customize may populate `overlay.roleAddenda` from evidence templates without invoking a host LLM when mining confidence is sufficient (stack, framework, primary modules, lint/test commands).
- R15. Template output must pass the same addenda contract as `/tune-roles` (length cap, gate/posture forbidden phrases, posture-appropriate capabilities).
- R16. Template addenda must not duplicate content already present in deterministic grounding sections for the same role — planner deduplicates at implementation time; product rule is one fact, one surface.
- R17. Plugin Mode `/tune-roles` remains available and may overwrite or extend template addenda after human review.
- R18. Empty addenda on deterministic bench repos (current 10/10 state) becomes non-empty on at least 8/10 catalog repos after track C, without reducing setup-ready rate.

### Track D — Ecosystem pack skill descriptions (#4)

- R19. New or extended packs (e.g. pytest, gradle-jvm, php-composer, dotnet) may ship skills whose **descriptions** mention ecosystem-specific triggers ("when this repo uses pytest…") while base skills (`customize`, `sdlc-loop`, etc.) stay host-neutral.
- R20. Pack activation is automatic when miner detects matching ecosystem signals; inactive packs emit nothing.
- R21. Pack skill descriptions cite the same evidence keys as standards (manifest paths, CI files) in pack README or skill body — not free-form invention.
- R22. Capability matrix and `docs/packs.md` document new pack skills and when they attach.
- R23. Track D is optional until track B runs; skip if templated addenda + grounding satisfy eval without pack-specific workflow skills.

### Track E — Description suffix experiment (#3)

- R24. Compile may append a bounded stack hint suffix to role frontmatter `description` fields (not skill descriptions in v1 of this track) derived from mining: primary language, test runner, framework — max 80 characters appended after a ` | ` separator.
- R25. Base description text from `sdlc-base/roles/*.md` is never replaced or truncated — suffix is additive only.
- R26. Track E merges only if track B adds a mock **routing** scenario showing suffix-bearing descriptions improve role/skill selection vs unsuffixed baseline on pinned fixtures; otherwise track E stays documented as deferred in plan residual notes.
- R27. No LLM-authored frontmatter descriptions in this program (deferred per prior ideation — routing classifier stability).

---

## Success Criteria

| Metric | Target after program |
|---|---|
| Hands-off setup rate (10-repo bench) | Maintain 10/10 |
| Agent quality avg (bench) | ≥ 96, trend up on flat/noisy-map repos |
| Roles with deterministic grounding when evidence exists | 5/5 groundable roles (Debugger may stay generic only when no test command) |
| Behavior eval v2 improvement flag | true on all pinned phase-B scenarios |
| Evidence coverage | Maintain 100% on ready repos |
| Deterministic re-run | Freshness no-op preserved — new grounding keyed off existing overlay/project-context fingerprints |

---

## Scope Boundaries

**In scope:** Deterministic grounding, templated addenda, pack skill descriptions, eval extension, conditional description suffix.

**Out of scope for this program:**

- LLM rewrite of frontmatter descriptions or base role bodies.
- Duplicating full standards into every agent file.
- Live host LLM behavior eval (mock/scaffold only in track B).
- Manual edits to external bench clones.
- Per-host different description policies without capability-matrix update.
- Package-scoped `AGENTS.md` / large-repo scaling (ideation #6 — separate initiative).

**Deferred follow-ups:**

- Live Cursor/Claude agent trace comparison for behavior eval.
- Multi-host behavior eval bundles.
- Monorepo per-package instruction files when noisy maps hurt quality scores.

---

## Dependencies & Assumptions

- Track A extends `src/core/role-grounding.ts`, `src/cli/status.ts`, and corpus expectations — same pattern as shipped Tester/Engineer grounding plans.
- Track B extends `tests/corpus/behavior-eval-v2.ts` — plan at `docs/plans/2026-06-29-005-feat-behavior-eval-v2-readonly-plan.md` is partially implemented.
- Track C touches `src/customize/emitters.ts` and overlay schema usage — no schema change required if `roleAddenda` already exists.
- Track D uses existing pack loader merge path under `packs/`.
- Assumption: mock-agent scoring remains an acceptable CI gate until live host eval is productized.

---

## Outstanding Questions

- Q1. **Template addenda vs pack skills:** After phase B, if Engineer grounding + templates cover stack idioms, are ecosystem pack skills still worth maintaining? *Decision gate: phase B eval + carrying cost of N packs.*
- Q2. **Reviewer grounding depth:** Should Reviewer grounding include mined CI job names only, or also static analysis config paths (e.g. phpstan, golangci)? *Default: linters + map + demotion learnings only in v1.*
- Q3. **Description suffix hosts:** Apply suffix on all four hosts' agent frontmatter, or Cursor-only for track E? *Default: all hosts that emit `description`, same suffix source.*

---

## Relationship to Prior Art

| Artifact | Relationship |
|---|---|
| `docs/ideation/2026-06-30-extend-project-agents-skills-descriptions-ideation.md` | Source ranked ideas #1–#5 |
| `docs/plans/2026-06-29-005-feat-tester-deterministic-grounding-plan.md` | Done — pattern for track A |
| `docs/plans/2026-06-29-005-feat-behavior-eval-v2-readonly-plan.md` | Track B extends this |
| `docs/ideation/2026-06-14-llm-authored-role-addenda-ideation.md` | Track C deterministic half of A1–A3 |
| `docs/brainstorms/2026-06-29-plugin-first-llm-personalization-requirements.md` | Plugin Mode `/tune-roles` complements track C |

---

## Handoff

Ready for `ce-plan` as one program plan with five implementation units (tracks A–E) or five stacked plans in phase order. Recommended planning order: **A → B → (C | D) → E**.
