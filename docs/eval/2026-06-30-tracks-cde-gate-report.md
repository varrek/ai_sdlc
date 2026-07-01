---
date: 2026-06-30
topic: tracks-cde-program-gate
type: eval-report
origin: docs/brainstorms/2026-06-30-agent-skills-description-extension-requirements.md
---

# Program Gate Report: Tracks A/B → C/D/E (2026-06-30)

Gate requirement **R13** from `docs/brainstorms/2026-06-30-agent-skills-description-extension-requirements.md`: Tracks C, D, and E require a written eval report showing personalized guidance wins on all phase-B baseline scenarios before merge; regressions block downstream tracks.

This report records Track A/B/C outcomes, the expanded 10-repo bench, go/no-go for Tracks D/E, and follow-ups (aspnetcore collision fix, monorepo noise).

---

## Track B — Behavior Eval v2 (R13)

**Harness:** `tests/corpus/behavior-eval-v2.test.ts` (`BEHAVIOR_EVAL_V2_SCENARIOS`)

**Result:** **6/6 scenarios show `improvement: true`** — personalized Cursor guidance beats the generic baseline on every pinned read-only scenario.

| Scenario ID | Kind | Fixture | Personalized pass | Generic pass | Improvement |
|---|---|---|---|---|---|
| `python-rags-localize-change` | localize | python-rags | pass | fail | yes |
| `go-app-localize-change` | localize | go-app | pass | fail | yes |
| `go-app-verify-lint` | verify-lint | go-app | pass | fail | yes |
| `go-app-reproduce-failure` | reproduce | go-app | pass | fail | yes |
| `rust-cargo-localize-change` | localize | rust-cargo | pass | fail | yes |
| `java-maven-localize-change` | localize | java-maven | pass | fail | yes |

**R13 gate:** satisfied.

---

## External Bench — 10-Repo Catalog (seed 42, count 10)

**Catalog:** `eval-corpus/external-repos.json` revision `2026-06-30` (10 languages: TypeScript, Python, Go, Rust, Java, Ruby, C#, Kotlin, PHP, JavaScript).

**Command:**

```bash
npm run build
npm run bench
# or: node dist/cli/index.js bench --seed 42 --count 10 --force
```

**Report ID:** `seed-42-count-10-0b22bcc68560` (pre-aspnetcore fix). Post-fix aspnetcore verified locally (`setupReady: true`, `smoke: pass`).

### Summary metrics

| Metric | Target / bar | Run value |
|---|---|---|
| `summary.total` | 10 | **10** |
| `summary.setupReady` | 10/10 | **9/10** → **10/10** after user-instruction collision fix |
| `summary.handsOff` | 10/10 | **9/10** → **10/10** after fix |
| `summary.validButNeedsAttention` | 0 (ideal) | **1** (Flask low architecture confidence) |
| `summary.agentQuality.averageScore` | ≥ 96 | **96/100** |
| `summary.agentQuality.missingArchitectGrounding` | 0 | **0** |
| `summary.agentQuality.missingEngineerGrounding` | 0 | **0** |
| `summary.agentQuality.missingTesterGrounding` | 0 | **0** |
| `summary.agentQuality.missingReviewerGrounding` | 0 | **0** |
| `summary.agentQuality.missingDebuggerGrounding` | 0 | **0** |
| `summary.agentQuality.noisyMaps` | note only | **2** (Cargo, OkHttp) |
| `summary.failureClasses` | empty | **`emitter-bug: 1`** (aspnetcore) — fixed |
| `diversityGaps` | `[]` | **`[]`** |

### Per-repo agent quality (9 successful in pre-fix run)

| Repo | Score | All 5 roles grounded | Notes |
|---|---|---|---|
| pallets/flask | 85 | yes | low map; standards-based architect |
| rust-lang/cargo | 90 | yes | noisy map (26 packages) |
| square/okhttp | 90 | yes | noisy map (28 packages) |
| vitejs/vite | 100 | yes | — |
| cli/cli | 100 | yes | — |
| rails/rails | 100 | yes | — |
| spring-projects/spring-petclinic | 100 | yes | — |
| laravel/framework | 100 | yes | — |
| expressjs/express | 100 | yes | — |

**Failure (fixed):** `dotnet/aspnetcore` — compile refused to overwrite user-authored `src/Components/AGENTS.md`. Fix: customize marks hierarchy scopes with pre-existing nested instruction files as `accepted: false` so compile skips emission while preserving user guidance.

---

## Track C — Templated Role Addenda

Merged on `main` (PR #26). Post-merge validation:

- **R18:** non-empty templated `roleAddenda` on **10/10** successful bench clones (5 roles each).
- **Behavior eval v2:** 6/6 improvement maintained.
- **Track C typecheck hotfix:** PR #29.

---

## Monorepo noise (ideation #6 — separate initiative)

Cargo and OkHttp score **90/100** (not 100) because the bench agent-quality formula applies a **−10 `mapIsNoisy` penalty** when `packages > 8`. Root agents and role grounding remain fully deterministic on both repos.

This is **not** a Track D (ecosystem pack skills) gap. The recommended follow-up is **ideation #6** — package-scoped instruction files / large-repo progressive disclosure (`docs/ideation/2026-06-30-extend-project-agents-skills-descriptions-ideation.md` #6, `docs/plans/2026-06-14-004-feat-large-repo-scaling-plan.md`). Defer until a dedicated large-repo scaling slice is scheduled.

---

## Decision

| Track | Scope | Decision |
|---|---|---|
| **C** | Templated deterministic role addenda | **Shipped & validated** |
| **D** | Ecosystem pack skill descriptions | **Defer** — v2 6/6 improvement; bench avg 96; addenda + grounding cover stack idioms (R23) |
| **E** | Description suffix experiment | **Defer** — no routing scenario in v2 (R26) |

**Residuals:**

1. Re-run full 10-repo bench after aspnetcore fix merges to refresh report JSON.
2. Monorepo quality uplift tracked under ideation #6, not pack skills.
3. Add mock routing scenarios before reopening Track E.

---

## Related docs

- Requirements: `docs/brainstorms/2026-06-30-agent-skills-description-extension-requirements.md`
- Ideation: `docs/ideation/2026-06-30-extend-project-agents-skills-descriptions-ideation.md`
- Bench workflow: `docs/eval/external-repo-workflow.md`
- Large-repo scaling: `docs/plans/2026-06-14-004-feat-large-repo-scaling-plan.md`
