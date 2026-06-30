---
date: 2026-06-30
topic: tracks-cde-program-gate
type: eval-report
origin: docs/brainstorms/2026-06-30-agent-skills-description-extension-requirements.md
---

# Program Gate Report: Tracks A/B → C/D/E (2026-06-30)

Gate requirement **R13** from `docs/brainstorms/2026-06-30-agent-skills-description-extension-requirements.md`: Tracks C, D, and E require a written eval report showing personalized guidance wins on all phase-B baseline scenarios before merge; regressions block downstream tracks.

This report records Track A/B outcomes, the expanded 10-repo bench template, and the go/no-go decision for Tracks C–E.

---

## Track B — Behavior Eval v2 (R13)

**Harness:** `tests/corpus/behavior-eval-v2.test.ts` (`BEHAVIOR_EVAL_V2_SCENARIOS`)

**Result:** **6/6 scenarios show `improvement: true`** — personalized Cursor guidance beats the generic baseline on every pinned read-only scenario.

| Scenario ID | Kind | Fixture | Personalized pass | Generic pass | Improvement |
|---|---|---|---|---|---|
| `python-rags-localize-change` | localize | python-rags | pass | fail | yes |
| `go-app-localize-change` | localize | go-app | pass | fail | yes |
| `rust-cargo-localize-change` | localize | rust-cargo | pass | fail | yes |
| `java-maven-localize-change` | localize | java-maven | pass | fail | yes |
| `go-app-verify-lint` | verify-lint | go-app | pass | fail | yes |
| `go-app-reproduce-failure` | reproduce | go-app | pass | fail | yes |

**Coverage notes:**

- Four localize scenarios exercise Architect/Engineer/Tester surfaces on Python, Go, Rust, and JVM fixtures (R8, R10).
- Reviewer (`verify-lint`) and Debugger (`reproduce`) scenarios score grounding surfaces added in Track A (R9).
- Default CI runs these offline; no network or host LLM required.

**R13 gate:** satisfied — all phase-B baseline scenarios improve with personalized guidance.

---

## External Bench — 10-Repo Catalog (seed 42, count 10)

**Catalog:** `eval-corpus/external-repos.json` revision `2026-06-30` (10 languages: TypeScript, Python, Go, Rust, Java, Ruby, C#, Kotlin, PHP, JavaScript).

**Command:**

```bash
npm run build
npm run bench
# or: node dist/cli/index.js bench --seed 42 --count 10
```

Reports land under `.verify/reports/<run-id>/eval-report.json`.

### Bench metrics template

Fill after a live bench run (network required; opt-in via `AISDLC_EXTERNAL_CORPUS=1` in CI):

| Metric | Target / bar | Run value |
|---|---|---|
| `summary.total` | 10 | |
| `summary.setupReady` | 10/10 | |
| `summary.handsOff` | 10/10 | |
| `summary.validButNeedsAttention` | 0 (ideal) | |
| `summary.agentQuality.averageScore` | ≥ 90 | |
| `summary.agentQuality.missingArchitectGrounding` | 0 when map exists; flat repos may use standards-based grounding | |
| `summary.agentQuality.missingEngineerGrounding` | 0 | |
| `summary.agentQuality.missingTesterGrounding` | 0 when test command exists | |
| `summary.agentQuality.missingReviewerGrounding` | 0 when linter signals exist | |
| `summary.agentQuality.missingDebuggerGrounding` | 0 when test command exists | |
| `summary.agentQuality.noisyMaps` | note only (packages > 8) | |
| `summary.failureClasses` | empty or documented residuals | |
| `diversityGaps` | `[]` for full catalog | |

**Per-repo agent quality fields** (in each `results[].setup.agentQuality`):

- Role grounding: `architectGrounded`, `engineerGrounded`, `testerGrounded`, `reviewerGrounded`, `debuggerGrounded`
- Evidence: `hasRootTestCommand`, `hasCodebaseMap`, `evidenceBackedStandards`, `mapIsNoisy`
- Composite: `score` (0–100; five roles × 12 + test command 15 + map 15 + standards 10 − noisy map 10)

### Reference snapshot (pre–Track C)

From the 7-repo catalog era (before okhttp/laravel/express expansion), the bar was 7/7 setup-ready with avg agent quality ~96/100. Track A added Reviewer/Debugger deterministic grounding; this gate extends the catalog to 10 repos and adds reviewer/debugger fields to bench scoring. Re-run bench after merge to populate the template above.

---

## Track A — Role Grounding (summary)

Shipped on branch `feat/bench-catalog-gate-report` (merged with prior Track A/B work):

- Reviewer deterministic grounding from linter/map signals
- Debugger deterministic grounding from test-command provenance
- Architect standards-based grounding for flat/low-map repos
- `aisdlc status` reports all five groundable roles

Corpus fixtures and v2 scenarios validate these surfaces offline.

---

## Decision

| Track | Scope | Decision |
|---|---|---|
| **C** | Templated deterministic role addenda | **Proceed** — R13 satisfied (6/6 v2 improvement); grounding foundation in place |
| **D** | Ecosystem pack skill descriptions | **Defer** — wait for Track C addenda eval; skip if addenda + grounding cover stack idioms (R23) |
| **E** | Description suffix experiment | **Defer** — requires Track B routing scenario proving suffix benefit (R26); not demonstrated in current v2 set |

**Residuals / follow-up:**

1. Run live 10-repo bench and fill the metrics template after merge.
2. Track C merge gate: maintain setup-ready 10/10 and non-empty addenda on ≥ 8/10 repos (R18) without regressing v2 scenarios.
3. Add a mock routing scenario before reopening Track E.

---

## Related docs

- Requirements: `docs/brainstorms/2026-06-30-agent-skills-description-extension-requirements.md`
- Plan: `docs/plans/2026-06-30-003-feat-agent-skills-description-extension-plan.md`
- Bench workflow: `docs/eval/external-repo-workflow.md`
