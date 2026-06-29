---
title: "feat: Add data-ml and compliance reference packs"
type: feat
date: 2026-06-29
origin: docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md
---

# feat: Add data-ml and compliance reference packs

## Summary

Ship two additive reference extension packs — `data-ml` and `compliance` — following the existing security/infra pack contract. Each pack adds a read-only domain reviewer role, a focused skill, and constitution guidance. No MCP integrations in this slice (integration names must stay unique when all reference packs load together; story is clear enough without new contracts).

---

## Problem Frame

Research ranked opportunity #6 calls for domain packs covering data/ML workflows (notebooks, batch jobs, migrations, model contracts, reproducibility) and compliance workflows (audit-sensitive review, privacy checks, policy evidence). The pack loader and four reference packs already exist, but teams working on pipelines or regulated changes have no curated starting point. Packs are the right extension mechanism — domain expertise stays additive without expanding base roles.

---

## Requirements

| ID | Requirement |
| --- | --- |
| R1 | Add `packs/data-ml/` with manifest, role, skill, and `AGENTS.md` |
| R2 | Add `packs/compliance/` with manifest, role, skill, and `AGENTS.md` |
| R3 | Role names and skill names must not collide with base or existing reference packs |
| R4 | Reviewer roles use `posture: read-only`; skills must not bypass Approved? or test gates |
| R5 | Update `packs/README.md`, `docs/packs.md`, and reference-pack tests for the expanded set |
| R6 | No credentials or live MCP servers required for tests |
| R7 | Both packs load together with the existing four reference packs without duplicate-name errors |

---

## Key Technical Decisions

1. **Ship both packs in one slice.** Each pack is manifest + role + skill + AGENTS.md (~6 files). Bounded and mirrors the mobile/data research first slice (`data-reviewer` + `data-pipeline-review`).

2. **No new MCP integrations in v1.** All six reference packs load together in tests; `database`, `github`, and other contracts are already claimed. Skills and roles reference files, tests, and evidence instead of MCP tools. Follow-up can add domain-specific contracts when binding stories are clear.

3. **Compliance stays checklist-oriented.** Avoid legal-advice posture; focus on audit trail, PII handling, retention, and policy-evidence reminders aligned with the security pack's evidence-over-prose pattern.

4. **Alphabetical ordering in tests.** Extend `reference-packs.test.ts` curated list and composition assertions to include six packs sorted by manifest name.

---

## Output Structure

```
packs/data-ml/
├── pack.yaml
├── AGENTS.md
├── roles/data-reviewer.md
└── skills/data-pipeline-review/SKILL.md

packs/compliance/
├── pack.yaml
├── AGENTS.md
├── roles/compliance-reviewer.md
└── skills/privacy-audit-check/SKILL.md
```

---

## Implementation Units

### U1. Data-ML pack content

- **Goal:** Curated data/ML review guidance for pipelines, notebooks, and reproducibility.
- **Requirements:** R1, R3, R4
- **Dependencies:** None
- **Files:** `packs/data-ml/pack.yaml`, `packs/data-ml/AGENTS.md`, `packs/data-ml/roles/data-reviewer.md`, `packs/data-ml/skills/data-pipeline-review/SKILL.md`
- **Approach:** `data-reviewer` read-only role covering batch jobs, backfills, schema migrations, model/data contracts, and reproducibility. `data-pipeline-review` skill with path globs for notebooks, SQL, dbt, Airflow-style YAML, and common ML config files.
- **Patterns to follow:** `packs/infra/`, `packs/backend-api/`
- **Test scenarios:** Manifest validates; role/skill names unique; loads with base without collision.
- **Verification:** Reference pack loader test includes `data-ml` artifacts.

### U2. Compliance pack content

- **Goal:** Audit-sensitive and privacy-oriented review checklist without legal-advice posture.
- **Requirements:** R2, R3, R4
- **Dependencies:** None
- **Files:** `packs/compliance/pack.yaml`, `packs/compliance/AGENTS.md`, `packs/compliance/roles/compliance-reviewer.md`, `packs/compliance/skills/privacy-audit-check/SKILL.md`
- **Approach:** `compliance-reviewer` read-only role for change auditability, PII minimization, retention, and policy evidence. `privacy-audit-check` skill triggered on auth, user-data, logging, and config paths.
- **Patterns to follow:** `packs/security/`
- **Test scenarios:** Same uniqueness and load assertions as U1.
- **Verification:** Reference pack loader test includes `compliance` artifacts.

### U3. Documentation and tests

- **Goal:** Document and regression-test the six-pack reference set.
- **Requirements:** R5, R6, R7
- **Dependencies:** U1, U2
- **Files:** `packs/README.md`, `docs/packs.md`, `tests/packs/reference-packs.test.ts`
- **Approach:** Extend pack index tables and curated test expectations (sorted manifest names, role/skill/constitution snippets).
- **Test scenarios:** Six packs load; constitution contains pack guidance for both new packs; duplicate rejection cases unchanged.
- **Verification:** `npm test -- tests/packs/reference-packs.test.ts` passes; full suite green.

---

## Scope Boundaries

- Does not add miner detection for notebooks, ML frameworks, or compliance tooling.
- Does not add MCP integration contracts (deferred until unique binding story exists).
- Does not modify base roles or constitution beyond pack merge addenda.

### Deferred to Follow-Up Work

- Optional MCP contracts (e.g., data-catalog, audit-log readers) once tool naming and overlay binding patterns are defined.
- Corpus fixtures asserting data-ML or compliance-specific miner signals.

---

## Risks & Dependencies

- **Overlap with security pack:** Compliance and security both touch PII; compliance focuses on audit/policy evidence, security on trust boundaries and threats. Cross-reference in AGENTS.md prose, do not duplicate threat-model skill.
- **Name collisions:** Loader fails closed; test curated list must stay alphabetically sorted for stable assertions.

---

## Sources & Research

- `docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md` (ranked #6)
- `docs/plans/2026-06-29-004-feat-lfg-improvement-backlog-plan.md` (U5)
- `docs/plans/2026-06-29-002-feat-reference-packs-mcp-contracts-plan.md`
- Existing packs under `packs/`
